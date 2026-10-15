// src/routes/participants.js
import express from "express";
import { z } from "zod";

import { Challenge } from "../models/Challenge.js";
import { Participant } from "../models/Participant.js";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { serializeUser } from "../utils/serializeUser.js";

export const participantsRouter = express.Router();

// ── Schemas ──────────────────────────────────────────
const roleSchema = z.object({
  role: z.enum(["MEMBER", "MODERATOR"]),
});

// ── Helpers ──────────────────────────────────────────
function serializeParticipant(p, user) {
  return {
    userId: String(p.userId),
    role: p.role,
    joinedAt: p.joinedAt,
    streak: p.streak,
    stats: p.stats,
    user: serializeUser(user),
  };
}

// ── GET /challenges/:slug/participants ───────────────
participantsRouter.get(
  "/:slug/participants",
  requireAuth,
  async (req, res, next) => {
    try {
      const challenge = await Challenge.findOne({
        slug: req.params.slug,
      }).lean();
      if (!challenge) {
        return res.status(404).json({ error: "CHALLENGE_NOT_FOUND" });
      }

      const isCreator = String(challenge.creatorId) === String(req.userId);
      const isParticipant = await Participant.exists({
        challengeId: challenge._id,
        userId: req.userId,
      });

      if (!isCreator && !isParticipant) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }

      const participants = await Participant.find({
        challengeId: challenge._id,
      })
        .sort({ "stats.completed": -1, joinedAt: 1 })
        .lean();

      // Batch-fetch users to avoid N+1.
      const userIds = participants.map((p) => p.userId);
      const users = await User.find({ _id: { $in: userIds } }).lean();
      const userMap = new Map(users.map((u) => [String(u._id), u]));

      res.json({
        participants: participants.map((p) =>
          serializeParticipant(p, userMap.get(String(p.userId)))
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /challenges/:slug/participants/:userId ─────
participantsRouter.patch(
  "/:slug/participants/:userId",
  requireAuth,
  validate(roleSchema),
  async (req, res, next) => {
    try {
      const challenge = await Challenge.findOne({ slug: req.params.slug });
      if (!challenge) {
        return res.status(404).json({ error: "CHALLENGE_NOT_FOUND" });
      }

      if (String(challenge.creatorId) !== String(req.userId)) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }

      const participant = await Participant.findOne({
        challengeId: challenge._id,
        userId: req.params.userId,
      });
      if (!participant) {
        return res.status(404).json({ error: "PARTICIPANT_NOT_FOUND" });
      }

      participant.role = req.body.role;
      await participant.save();

      const user = await User.findById(participant.userId).lean();
      res.json({ participant: serializeParticipant(participant, user) });
    } catch (err) {
      next(err);
    }
  }
);