// src/routes/contacts.js
import express from "express";
import { z } from "zod";
import mongoose from "mongoose";

import { ContactRequest } from "../models/ContactRequest.js";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { contactRequestLimiter } from "../middleware/rateLimit.js";
import { serializeUser } from "../utils/serializeUser.js";
import { emitToUser } from "../services/socket.js";

export const contactsRouter = express.Router();

// ── Schemas ──────────────────────────────────────────
const sendRequestSchema = z.object({
  toUserId: z.string().min(1),
  message: z.string().max(300).optional(),
});

// ── Helpers ──────────────────────────────────────────
async function serializeContactRequest(cr, { includeUsers = true } = {}) {
  const base = {
    id: String(cr._id),
    fromUserId: String(cr.fromUserId),
    toUserId: String(cr.toUserId),
    status: cr.status,
    message: cr.message,
    respondedAt: cr.respondedAt,
    createdAt: cr.createdAt,
    updatedAt: cr.updatedAt,
  };

  if (!includeUsers) return base;

  const userIds = [cr.fromUserId, cr.toUserId];
  const users = await User.find({ _id: { $in: userIds } })
    .select("-settings -clerkId")
    .lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  return {
    ...base,
    from: serializeUser(userMap.get(String(cr.fromUserId))),
    to: serializeUser(userMap.get(String(cr.toUserId))),
  };
}

// ── POST /contacts/request ───────────────────────────
contactsRouter.post(
  "/request",
  requireAuth,
  contactRequestLimiter,
  validate(sendRequestSchema),
  async (req, res, next) => {
    try {
      const { toUserId, message } = req.body;

      if (!mongoose.Types.ObjectId.isValid(toUserId)) {
        return res.status(400).json({ error: "INVALID_USER_ID" });
      }
      if (String(toUserId) === String(req.userId)) {
        return res.status(400).json({ error: "CANNOT_REQUEST_SELF" });
      }

      const target = await User.findById(toUserId, { _id: 1 }).lean();
      if (!target) {
        return res.status(404).json({ error: "USER_NOT_FOUND" });
      }

      // Existing pending request?
      const existing = await ContactRequest.findOne({
        fromUserId: req.userId,
        toUserId,
        status: "PENDING",
      });
      if (existing) {
        return res.status(200).json({
          request: await serializeContactRequest(existing),
          alreadyPending: true,
        });
      }

      // Reverse pending? (they already requested you)
      const reverse = await ContactRequest.findOne({
        fromUserId: toUserId,
        toUserId: req.userId,
        status: "PENDING",
      });
      if (reverse) {
        return res.status(409).json({
          error: "THEY_ALREADY_REQUESTED",
          message:
            "This user already sent you a request. Accept theirs instead.",
          requestId: String(reverse._id),
        });
      }

      const cr = await ContactRequest.create({
        fromUserId: req.userId,
        toUserId,
        message: message ?? null,
      });

      // Real-time notify the target if connected.
      emitToUser(String(toUserId), "contact:request", {
        id: String(cr._id),
        fromUserId: String(req.userId),
      });

      res.status(201).json({
        request: await serializeContactRequest(cr),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /contacts/requests?direction=incoming|outgoing|all ──
contactsRouter.get("/requests", requireAuth, async (req, res, next) => {
  try {
    const direction = req.query.direction ?? "all";
    const status = req.query.status ?? "PENDING";

    let query = {};
    if (direction === "incoming") {
      query = { toUserId: req.userId, status };
    } else if (direction === "outgoing") {
      query = { fromUserId: req.userId, status };
    } else {
      query = {
        $or: [{ toUserId: req.userId }, { fromUserId: req.userId }],
        status,
      };
    }

    const list = await ContactRequest.find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json({
      requests: await Promise.all(list.map((cr) => serializeContactRequest(cr))),
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /contacts/requests/:id/accept ───────────────
contactsRouter.post("/requests/:id/accept", requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "INVALID_ID" });
    }

    const cr = await ContactRequest.findById(req.params.id);
    if (!cr) return res.status(404).json({ error: "REQUEST_NOT_FOUND" });
    if (String(cr.toUserId) !== String(req.userId)) {
      return res.status(403).json({ error: "NOT_RECIPIENT" });
    }
    if (cr.status !== "PENDING") {
      return res.status(409).json({
        error: "NOT_PENDING",
        message: `Request is already ${cr.status}.`,
      });
    }

    cr.status = "ACCEPTED";
    cr.respondedAt = new Date();
    await cr.save();

    emitToUser(String(cr.fromUserId), "contact:accepted", {
      id: String(cr._id),
      toUserId: String(req.userId),
    });

    res.json({ request: await serializeContactRequest(cr) });
  } catch (err) {
    next(err);
  }
});

// ── POST /contacts/requests/:id/decline ──────────────
contactsRouter.post("/requests/:id/decline", requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "INVALID_ID" });
    }

    const cr = await ContactRequest.findById(req.params.id);
    if (!cr) return res.status(404).json({ error: "REQUEST_NOT_FOUND" });
    if (String(cr.toUserId) !== String(req.userId)) {
      return res.status(403).json({ error: "NOT_RECIPIENT" });
    }
    if (cr.status !== "PENDING") {
      return res.status(409).json({ error: "NOT_PENDING" });
    }

    cr.status = "DECLINED";
    cr.respondedAt = new Date();
    await cr.save();

    res.json({ request: await serializeContactRequest(cr) });
  } catch (err) {
    next(err);
  }
});

// ── POST /contacts/requests/:id/cancel ───────────────
contactsRouter.post("/requests/:id/cancel", requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "INVALID_ID" });
    }

    const cr = await ContactRequest.findById(req.params.id);
    if (!cr) return res.status(404).json({ error: "REQUEST_NOT_FOUND" });
    if (String(cr.fromUserId) !== String(req.userId)) {
      return res.status(403).json({ error: "NOT_SENDER" });
    }
    if (cr.status !== "PENDING") {
      return res.status(409).json({ error: "NOT_PENDING" });
    }

    cr.status = "CANCELLED";
    cr.respondedAt = new Date();
    await cr.save();

    res.json({ request: await serializeContactRequest(cr) });
  } catch (err) {
    next(err);
  }
});

// ── GET /contacts ────────────────────────────────────
// Your contacts: users you have an ACCEPTED request with (either direction).
contactsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const accepted = await ContactRequest.find({
      $or: [{ toUserId: req.userId }, { fromUserId: req.userId }],
      status: "ACCEPTED",
    })
      .sort({ respondedAt: -1 })
      .limit(500)
      .lean();

    const contactIds = new Set();
    for (const cr of accepted) {
      const other =
        String(cr.fromUserId) === String(req.userId)
          ? String(cr.toUserId)
          : String(cr.fromUserId);
      contactIds.add(other);
    }

    const users = await User.find({ _id: { $in: [...contactIds] } })
      .select("-settings -clerkId")
      .lean();

    res.json({
      contacts: users.map((u) => serializeUser(u)),
      count: users.length,
    });
  } catch (err) {
    next(err);
  }
});