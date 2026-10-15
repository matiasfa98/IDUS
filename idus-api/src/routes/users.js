// src/routes/users.js
import express from "express";
import mongoose from "mongoose";

import { User } from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { serializeUser } from "../utils/serializeUser.js";
import { searchLimiter } from "../middleware/rateLimit.js";

export const usersRouter = express.Router();

// ── GET /users/search?q=...&limit=20 ─────────────────
usersRouter.get("/search", requireAuth, searchLimiter, async (req, res, next) => {
  try {
    const rawQ = (req.query.q ?? "").toString().trim();
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    if (rawQ.length < 2) {
      return res.status(400).json({
        error: "QUERY_TOO_SHORT",
        message: "Search query must be at least 2 characters.",
      });
    }

    const escaped = rawQ.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(escaped, "i");

    const users = await User.find({
      _id: { $ne: req.userId },
      "settings.privacy.discoverable": { $ne: false },
      $or: [{ username: rx }, { fullName: rx }, { permanentId: rx }],
    })
      .limit(limit)
      .select("-settings -clerkId")
      .lean();

    res.json({
      users: users.map((u) => serializeUser(u)),
      count: users.length,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /users/:id ────────────────────────────────────
usersRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "INVALID_ID" });
    }

    // Load with settings for the privacy check.
    const user = await User.findById(req.params.id).lean();
    if (!user) {
      return res.status(404).json({ error: "USER_NOT_FOUND" });
    }

    const isSelf = String(user._id) === String(req.userId);
    if (!isSelf && user.settings?.privacy?.discoverable === false) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    // Strip private fields before serializing.
    delete user.settings;
    delete user.clerkId;

    res.json({ user: serializeUser(user) });
  } catch (err) {
    next(err);
  }
});