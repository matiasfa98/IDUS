// src/routes/messages.js
import express from "express";
import { z } from "zod";
import mongoose from "mongoose";

import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";
import { SyncLog } from "../models/SyncLog.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { serializeUser } from "../utils/serializeUser.js";
import { User } from "../models/User.js";
import { emitToConversation } from "../services/socket.js";
import { messageLimiter } from "../middleware/rateLimit.js";

export const messagesRouter = express.Router();

// ── Schemas ──────────────────────────────────────────
const attachmentSchema = z.object({
  kind: z.enum(["image", "file", "audio"]),
  url: z.string().url(),
  thumbUrl: z.string().url().nullable().optional(),
  mimeType: z.string().min(3),
  size: z.number().int().positive(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  duration: z.number().positive().nullable().optional(),
  originalName: z.string().max(255).nullable().optional(),
  cloudinaryPublicId: z.string().nullable().optional(),
});

const sendMessageSchema = z.object({
  clientMessageId: z.string().min(8).max(64),
  body: z.string().max(4000).default(""),
  attachments: z.array(attachmentSchema).max(10).default([]),
  replyToId: z.string().nullable().optional(),
  localTimestamp: z.string().optional(),
});

const editMessageSchema = z.object({
  body: z.string().min(1).max(4000),
});

// ── Helpers ──────────────────────────────────────────
function serializeMessage(m, senderUser) {
  return {
    id: String(m._id),
    conversationId: String(m.conversationId),
    senderId: String(m.senderId),
    clientMessageId: m.clientMessageId,
    body: m.body,
    attachments: m.attachments ?? [],
    replyToId: m.replyToId ? String(m.replyToId) : null,
    reactions: m.reactions ?? {},
    editedAt: m.editedAt,
    deletedAt: m.deletedAt,
    localTimestamp: m.localTimestamp,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    sender: senderUser ? serializeUser(senderUser) : null,
  };
}

async function ensureParticipant(conversationId, userId) {
  const convo = await Conversation.findById(conversationId);
  if (!convo) return { convo: null, ok: false };
  const ok = convo.participants.some(
    (p) => String(p.userId) === String(userId) && !p.leftAt
  );
  return { convo, ok };
}

function previewFromBody(body, attachments) {
  if (body && body.trim().length > 0) {
    return body.length > 80 ? body.slice(0, 80) + "…" : body;
  }
  if (attachments.length > 0) {
    const kinds = new Set(attachments.map((a) => a.kind));
    if (kinds.has("image")) return "📷 Image";
    if (kinds.has("audio")) return "🎵 Audio";
    return "📎 File";
  }
  return "";
}

// ── POST /conversations/:id/messages ─────────────────
// Send a message. Idempotent via (senderId, clientMessageId).
messagesRouter.post(
  "/:id/messages",
  requireAuth,
  messageLimiter,
  validate(sendMessageSchema),
  async (req, res, next) => {
    try {
      const { id: conversationId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        return res.status(400).json({ error: "INVALID_ID" });
      }

      const { convo, ok } = await ensureParticipant(conversationId, req.userId);
      if (!convo) {
        return res.status(404).json({ error: "CONVERSATION_NOT_FOUND" });
      }
      if (!ok) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }

      const {
        clientMessageId,
        body,
        attachments,
        replyToId,
        localTimestamp,
      } = req.body;

      // Idempotency — same sender, same clientMessageId.
      const existing = await Message.findOne({
        senderId: req.userId,
        clientMessageId,
      });
      if (existing) {
        const senderUser = await User.findById(existing.senderId).lean();
        return res.status(200).json({
          message: serializeMessage(existing, senderUser),
          duplicate: true,
        });
      }

      // Validate replyToId if present.
      let replyRef = null;
      if (replyToId) {
        if (!mongoose.Types.ObjectId.isValid(replyToId)) {
          return res.status(400).json({ error: "INVALID_REPLY_TO" });
        }
        replyRef = await Message.exists({
          _id: replyToId,
          conversationId,
        });
        if (!replyRef) {
          return res.status(400).json({ error: "REPLY_MESSAGE_NOT_FOUND" });
        }
      }

      const now = new Date();
      const localTs = localTimestamp ? new Date(localTimestamp) : now;

      const msg = await Message.create({
        conversationId,
        senderId: req.userId,
        clientMessageId,
        body: body ?? "",
        attachments: attachments ?? [],
        replyToId: replyToId ?? null,
        localTimestamp: localTs,
      });

      // Bump conversation denormalized fields.
      convo.lastMessageAt = msg.createdAt;
      convo.lastMessagePreview = previewFromBody(msg.body, msg.attachments);
      convo.lastMessageSenderId = msg.senderId;
      convo.messageCount = (convo.messageCount ?? 0) + 1;
      await convo.save();

      // SyncLog for idempotency audit + later sync-batch endpoint.
      await SyncLog.updateOne(
        { userId: req.userId, clientActionId: clientMessageId },
        {
          $setOnInsert: {
            userId: req.userId,
            challengeId: convo.challengeId ?? convo._id, // reuse field
            clientActionId: clientMessageId,
            actionType: "MESSAGE_SEND",
            status: "ACCEPTED",
          },
        },
        { upsert: true }
      );

      const senderUser = await User.findById(req.userId).lean();
      const payload = serializeMessage(msg, senderUser);

      // Real-time broadcast to conversation room.
      emitToConversation(conversationId, "message:new", payload);

      res.status(201).json({ message: payload });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /conversations/:id/messages ──────────────────
// Cursor-paginated. `before` = messageId to fetch older-than.
messagesRouter.get(
  "/:id/messages",
  requireAuth,
  async (req, res, next) => {
    try {
      const { id: conversationId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        return res.status(400).json({ error: "INVALID_ID" });
      }

      const { ok } = await ensureParticipant(conversationId, req.userId);
      if (!ok) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }

      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const before = req.query.before;

      const query = {
        conversationId,
        deletedAt: null,
      };

      if (before) {
        if (!mongoose.Types.ObjectId.isValid(before)) {
          return res.status(400).json({ error: "INVALID_CURSOR" });
        }
        const cursor = await Message.findById(before, { createdAt: 1 }).lean();
        if (cursor) {
          query.createdAt = { $lt: cursor.createdAt };
        }
      }

      const messages = await Message.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      // Reverse so response is oldest-first within the page.
      const ordered = messages.reverse();

      // Batch-fetch senders.
      const senderIds = Array.from(new Set(ordered.map((m) => String(m.senderId))));
      const senders = await User.find({ _id: { $in: senderIds } }).lean();
      const senderMap = new Map(senders.map((u) => [String(u._id), u]));

      res.json({
        messages: ordered.map((m) =>
          serializeMessage(m, senderMap.get(String(m.senderId)))
        ),
        hasMore: messages.length === limit,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /conversations/:id/messages/:messageId ─────
messagesRouter.patch(
  "/:id/messages/:messageId",
  requireAuth,
  validate(editMessageSchema),
  async (req, res, next) => {
    try {
      const { id: conversationId, messageId } = req.params;
      if (
        !mongoose.Types.ObjectId.isValid(conversationId) ||
        !mongoose.Types.ObjectId.isValid(messageId)
      ) {
        return res.status(400).json({ error: "INVALID_ID" });
      }

      const { ok } = await ensureParticipant(conversationId, req.userId);
      if (!ok) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }

      const msg = await Message.findOne({
        _id: messageId,
        conversationId,
      });
      if (!msg) {
        return res.status(404).json({ error: "MESSAGE_NOT_FOUND" });
      }
      if (String(msg.senderId) !== String(req.userId)) {
        return res.status(403).json({ error: "CANNOT_EDIT_OTHERS" });
      }
      if (msg.deletedAt) {
        return res.status(409).json({ error: "MESSAGE_DELETED" });
      }

      msg.body = req.body.body;
      msg.editedAt = new Date();
      await msg.save();

      const senderUser = await User.findById(msg.senderId).lean();
      const payload = serializeMessage(msg, senderUser);

      emitToConversation(conversationId, "message:edited", payload);

      res.json({ message: payload });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /conversations/:id/messages/:messageId ────
messagesRouter.delete(
  "/:id/messages/:messageId",
  requireAuth,
  async (req, res, next) => {
    try {
      const { id: conversationId, messageId } = req.params;
      if (
        !mongoose.Types.ObjectId.isValid(conversationId) ||
        !mongoose.Types.ObjectId.isValid(messageId)
      ) {
        return res.status(400).json({ error: "INVALID_ID" });
      }

      const { ok } = await ensureParticipant(conversationId, req.userId);
      if (!ok) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }

      const msg = await Message.findOne({
        _id: messageId,
        conversationId,
      });
      if (!msg) {
        return res.status(404).json({ error: "MESSAGE_NOT_FOUND" });
      }
      if (String(msg.senderId) !== String(req.userId)) {
        return res.status(403).json({ error: "CANNOT_DELETE_OTHERS" });
      }

      msg.deletedAt = new Date();
      msg.body = "";
      msg.attachments = [];
      await msg.save();

      emitToConversation(conversationId, "message:deleted", {
        conversationId,
        messageId: String(msg._id),
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);