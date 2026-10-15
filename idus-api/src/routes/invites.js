import express from "express";

import { Challenge } from "../models/Challenge.js";
import { Participant } from "../models/Participant.js";
import { requireAuth } from "../middleware/auth.js";

export const invitesRouter = express.Router();

// ── GET /join/:inviteCode — public preview ──────────
invitesRouter.get("/:inviteCode", async (req, res, next) => {
  try {
    const challenge = await Challenge.findOne({
      inviteCode: req.params.inviteCode.toUpperCase(),
    }).lean();

    if (!challenge) {
      return res.status(404).json({ error: "INVALID_INVITE" });
    }
    if (challenge.status !== "PUBLISHED") {
      return res.status(409).json({ error: "NOT_PUBLISHED" });
    }

    const participantCount = await Participant.countDocuments({
      challengeId: challenge._id,
    });

    res.json({
      challenge: {
        slug: challenge.slug,
        title: challenge.title,
        topic: challenge.topic,
        difficulty: challenge.difficulty,
        description: challenge.description,
        startDate: challenge.startDate,
        endDate: challenge.endDate,
        availableDays: challenge.availableDays,
        dailyMinutes: challenge.dailyMinutes,
        skillMode: challenge.skillMode,
      },
      participantCount,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /join/:inviteCode — authenticated join ─────
invitesRouter.post("/:inviteCode", requireAuth, async (req, res, next) => {
  try {
    const challenge = await Challenge.findOne({
      inviteCode: req.params.inviteCode.toUpperCase(),
    });

    if (!challenge) {
      return res.status(404).json({ error: "INVALID_INVITE" });
    }
    if (challenge.status !== "PUBLISHED") {
      return res.status(409).json({ error: "NOT_PUBLISHED" });
    }

    const existing = await Participant.findOne({
      challengeId: challenge._id,
      userId: req.userId,
    });
    if (existing) {
      return res.status(200).json({
        ok: true,
        alreadyJoined: true,
        slug: challenge.slug,
      });
    }

    await Participant.create({
      challengeId: challenge._id,
      userId: req.userId,
      role:
        String(challenge.creatorId) === String(req.userId)
          ? "MODERATOR"
          : "MEMBER",
    });

    res.status(201).json({ ok: true, slug: challenge.slug });
  } catch (err) {
    next(err);
  }
});