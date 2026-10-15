// src/routes/conversations.js
import express from "express";
import { z } from "zod";
import mongoose from "mongoose";

import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { serializeUser } from "../utils/serializeUser.js";

export const conversationsRouter = express.Router();

// ── Schemas ──────────────────────────────────────────
const createConversationSchema = z.object({
  type: z.enum(["dm", "group"]),
  participantIds: z.array(z.string()).min(1).max(50),
  title: z.string().max(80).optional(),
});

// ── Helpers ──────────────────────────────────────────
function dmKeyFor(a, b) {
  return [String(a), String(b)].sort().join("_");
}

function serializeParticipant(p, user) {
  return {
    userId: String(p.userId),
    role: p.role,
    joinedAt: p.joinedAt,
    leftAt: p.leftAt,
    lastReadMessageId: p.lastReadMessageId ? String(p.lastReadMessageId) : null,
    lastReadAt: p.lastReadAt,
    user: serializeUser(user),
  };
}

async function serializeConversation(convo, { includeParticipants = true } = {}) {
  const base = {
    id: String(convo._id),
    type: convo.type,
    challengeId: convo.challengeId ? String(convo.challengeId) : null,
    title: convo.title,
    avatarUrl: convo.avatarUrl,
    createdBy: String(convo.createdBy),
    lastMessageAt: convo.lastMessageAt,
    lastMessagePreview: convo.lastMessagePreview,
    lastMessageSenderId: convo.lastMessageSenderId
      ? String(convo.lastMessageSenderId)
      : null,
    messageCount: convo.messageCount ?? 0,
    createdAt: convo.createdAt,
    updatedAt: convo.updatedAt,
  };

  if (!includeParticipants) return base;

  const userIds = convo.participants.map((p) => p.userId);
  const users = await User.find({ _id: { $in: userIds } }).lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  return {
    ...base,
    participants: convo.participants.map((p) =>
      serializeParticipant(p, userMap.get(String(p.userId)))
    ),
  };
}

// ── POST /conversations ─────────────────────────────
// Create a DM or group. Idempotent for DMs (via dmKey).
conversationsRouter.post(
  "/",
  requireAuth,
  validate(createConversationSchema),
  async (req, res, next) => {
    try {
      const { type, participantIds, title } = req.body;

      // Never include self twice.
      const cleanIds = Array.from(
        new Set(participantIds.filter((id) => String(id) !== String(req.userId)))
      );

      if (cleanIds.length === 0) {
        return res.status(400).json({
          error: "NO_OTHER_PARTICIPANTS",
          message: "Provide at least one other participant.",
        });
      }

      // Verify all participants exist.
      const users = await User.find({ _id: { $in: cleanIds } }, { _id: 1 }).lean();
      if (users.length !== cleanIds.length) {
        return res.status(400).json({
          error: "UNKNOWN_PARTICIPANT",
          message: "One or more participantIds do not exist.",
        });
      }

      // ── DM: exactly 2 people, idempotent via dmKey ─
      if (type === "dm") {
        if (cleanIds.length !== 1) {
          return res.status(400).json({
            error: "DM_REQUIRES_ONE_PARTICIPANT",
            message: "A DM is between exactly two users.",
          });
        }

        const otherId = cleanIds[0];
        const dmKey = dmKeyFor(req.userId, otherId);

        let convo = await Conversation.findOne({ dmKey });

        if (!convo) {
          convo = await Conversation.create({
            type: "dm",
            dmKey,
            participants: [
              { userId: req.userId, role: "ADMIN", joinedAt: new Date() },
              { userId: otherId, role: "MEMBER", joinedAt: new Date() },
            ],
            createdBy: req.userId,
          });
        }

        return res.status(200).json({
          conversation: await serializeConversation(convo),
          alreadyExisted:
            !!convo.createdAt && convo.createdAt < new Date(Date.now() - 500),
        });
      }

      // ── Group: 3+ people, no idempotency key ────────
      const participants = [
        { userId: req.userId, role: "ADMIN", joinedAt: new Date() },
        ...cleanIds.map((id) => ({
          userId: id,
          role: "MEMBER",
          joinedAt: new Date(),
        })),
      ];

      const convo = await Conversation.create({
        type: "group",
        title: title ?? null,
        participants,
        createdBy: req.userId,
      });

      res.status(201).json({
        conversation: await serializeConversation(convo),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /conversations ──────────────────────────────
// List my conversations, newest activity first.
// Includes unreadCount per conversation (messages from others since watermark).
conversationsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);

    const convos = await Conversation.find({
      participants: {
        $elemMatch: { userId: req.userId, leftAt: null },
      },
    })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .limit(limit)
      .lean();

    // Compute unread counts in parallel.
    const unreadCounts = await Promise.all(
      convos.map(async (c) => {
        const me = c.participants.find(
          (p) => String(p.userId) === String(req.userId)
        );
        const lastReadId = me?.lastReadMessageId;

        const query = {
          conversationId: c._id,
          senderId: { $ne: req.userId },
          deletedAt: null,
        };

        if (lastReadId) {
          const watermark = await Message.findById(lastReadId, {
            createdAt: 1,
          }).lean();
          if (watermark) {
            query.createdAt = { $gt: watermark.createdAt };
          }
        }

        return Message.countDocuments(query);
      })
    );

    const serialized = await Promise.all(
      convos.map(async (c, i) => {
        const base = await serializeConversation(c, {
          includeParticipants: false,
        });
        return { ...base, unreadCount: unreadCounts[i] };
      })
    );

    res.json({ conversations: serialized });
  } catch (err) {
    next(err);
  }
});

// ── GET /conversations/:id ──────────────────────────
conversationsRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "INVALID_ID" });
    }

    const convo = await Conversation.findById(req.params.id);
    if (!convo) {
      return res.status(404).json({ error: "CONVERSATION_NOT_FOUND" });
    }

    const isParticipant = convo.participants.some(
      (p) => String(p.userId) === String(req.userId) && !p.leftAt
    );
    if (!isParticipant) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    res.json({ conversation: await serializeConversation(convo) });
  } catch (err) {
    next(err);
  }
});

// ── POST /conversations/:id/read ────────────────────
// Advance the read watermark. Never downgrades — stale receipts are ignored.
conversationsRouter.post(
  "/:id/read",
  requireAuth,
  async (req, res, next) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: "INVALID_ID" });
      }

      const { messageId } = req.body ?? {};
      if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) {
        return res.status(400).json({ error: "INVALID_MESSAGE_ID" });
      }

      const convo = await Conversation.findById(req.params.id);
      if (!convo) {
        return res.status(404).json({ error: "CONVERSATION_NOT_FOUND" });
      }

      const p = convo.participants.find(
        (x) => String(x.userId) === String(req.userId) && !x.leftAt
      );
      if (!p) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }

      // Fetch the target message to get its createdAt.
      const targetMsg = await Message.findOne(
        { _id: messageId, conversationId: convo._id },
        { createdAt: 1 }
      ).lean();
      if (!targetMsg) {
        return res.status(404).json({ error: "MESSAGE_NOT_FOUND" });
      }

      // Only advance forward.
      let advance = true;
      if (p.lastReadMessageId) {
        const current = await Message.findById(p.lastReadMessageId, {
          createdAt: 1,
        }).lean();
        if (current && current.createdAt >= targetMsg.createdAt) {
          advance = false;
        }
      }

      if (advance) {
        p.lastReadMessageId = messageId;
        p.lastReadAt = new Date();
        await convo.save();

        const { emitToConversation } = await import("../services/socket.js");
        emitToConversation(req.params.id, "receipt:read", {
          conversationId: req.params.id,
          userId: String(req.userId),
          lastReadMessageId: String(messageId),
          lastReadAt: p.lastReadAt,
        });
      }

      res.json({
        ok: true,
        advanced: advance,
        lastReadMessageId: p.lastReadMessageId
          ? String(p.lastReadMessageId)
          : null,
        lastReadAt: p.lastReadAt,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /conversations/:id/reads ─────────────────────
// Per-participant read watermarks. Powers "Seen by N of M" UI.
conversationsRouter.get(
  "/:id/reads",
  requireAuth,
  async (req, res, next) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: "INVALID_ID" });
      }

      const convo = await Conversation.findById(req.params.id).lean();
      if (!convo) {
        return res.status(404).json({ error: "CONVERSATION_NOT_FOUND" });
      }

      const isParticipant = convo.participants.some(
        (p) => String(p.userId) === String(req.userId) && !p.leftAt
      );
      if (!isParticipant) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }

      res.json({
        reads: convo.participants
          .filter((p) => !p.leftAt)
          .map((p) => ({
            userId: String(p.userId),
            lastReadMessageId: p.lastReadMessageId
              ? String(p.lastReadMessageId)
              : null,
            lastReadAt: p.lastReadAt,
          })),
      });
    } catch (err) {
      next(err);
    }
  }
);