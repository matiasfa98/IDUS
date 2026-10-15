// src/routes/progress.js
import express from "express";
import { z } from "zod";

import { Challenge } from "../models/Challenge.js";
import { Participant } from "../models/Participant.js";
import { Progress } from "../models/Progress.js";
import { SyncLog } from "../models/SyncLog.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { computeStreak } from "../utils/streak.js";

export const progressRouter = express.Router();

// ── Schemas ──────────────────────────────────────────
const completeSchema = z.object({
  clientActionId: z.string().min(8).max(64),
  completedAt: z.string().optional(), // ISO; defaults to now
  note: z.string().max(500).optional(),
  artifactUrl: z.string().url().optional(),
});

// ── Helpers ──────────────────────────────────────────
function serializeProgress(p) {
  return {
    id: String(p._id),
    challengeId: String(p.challengeId),
    userId: String(p.userId),
    dayId: String(p.dayId),
    dayNumber: p.dayNumber,
    status: p.status,
    completedAt: p.completedAt,
    localTimestamp: p.localTimestamp,
    late: p.late ?? false,
    note: p.note ?? null,
    artifactUrl: p.artifactUrl ?? null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function findDay(challenge, dayId) {
  for (const phase of challenge.phases ?? []) {
    for (const day of phase.days ?? []) {
      if (String(day._id) === String(dayId)) {
        return { day, phase };
      }
    }
  }
  return null;
}

function isLate(day, completedAt, graceHours) {
  const scheduled = new Date(day.scheduledDate).getTime();
  const completed = new Date(completedAt).getTime();
  const graceMs = graceHours * 60 * 60 * 1000;
  return completed > scheduled + graceMs;
}

async function assertParticipant(challengeId, userId) {
  return Participant.findOne({ challengeId, userId });
}

// ── POST /challenges/:slug/days/:dayId/complete ──────
progressRouter.post(
  "/:slug/days/:dayId/complete",
  requireAuth,
  validate(completeSchema),
  async (req, res, next) => {
    try {
      const challenge = await Challenge.findOne({ slug: req.params.slug });
      if (!challenge) {
        return res.status(404).json({ error: "CHALLENGE_NOT_FOUND" });
      }

      const participant = await assertParticipant(challenge._id, req.userId);
      if (!participant) {
        return res.status(403).json({ error: "NOT_A_PARTICIPANT" });
      }

      const found = findDay(challenge, req.params.dayId);
      if (!found) {
        return res.status(404).json({ error: "DAY_NOT_FOUND" });
      }

      // Idempotency check — same clientActionId means replay, return prior result.
      const priorLog = await SyncLog.findOne({
        userId: req.userId,
        clientActionId: req.body.clientActionId,
      }).lean();

      if (priorLog) {
        const existing = await Progress.findOne({
          challengeId: challenge._id,
          userId: req.userId,
          dayId: found.day._id,
        }).lean();

        return res.status(200).json({
          progress: existing ? serializeProgress(existing) : null,
          replayed: true,
          syncStatus: priorLog.status,
        });
      }

      const completedAt = req.body.completedAt
        ? new Date(req.body.completedAt)
        : new Date();
      const late = isLate(
        found.day,
        completedAt,
        challenge.settings?.graceHours ?? 48
      );

      // Upsert Progress. If it already existed (re-completion), overwrite.
      const progress = await Progress.findOneAndUpdate(
        {
          challengeId: challenge._id,
          userId: req.userId,
          dayId: found.day._id,
        },
        {
          $set: {
            dayNumber: found.day.dayNumber,
            status: "COMPLETED",
            completedAt,
            localTimestamp: completedAt,
            late,
            note: req.body.note ?? null,
            artifactUrl: req.body.artifactUrl ?? null,
            syncedAt: new Date(),
          },
          $setOnInsert: {
            challengeId: challenge._id,
            userId: req.userId,
            dayId: found.day._id,
          },
        },
        { new: true, upsert: true }
      );

      // Recompute streak from all completed progress.
      const completions = await Progress.find({
        challengeId: challenge._id,
        userId: req.userId,
        status: "COMPLETED",
      })
        .select("completedAt")
        .lean();

      const nextStreak = computeStreak(completions, participant.streak);
      participant.streak = nextStreak;

      // Recompute stats.
      const completedCount = completions.length;
      participant.stats = {
        completed: completedCount,
        missed: Math.max(0, challenge.availableDays - completedCount),
      };

      participant.lastSyncedAt = new Date();
      await participant.save();

      // Record the action for idempotency.
      await SyncLog.create({
        userId: req.userId,
        challengeId: challenge._id,
        clientActionId: req.body.clientActionId,
        actionType: "DAY_COMPLETE",
        status: "ACCEPTED",
      });

      res.status(201).json({
        progress: serializeProgress(progress),
        streak: participant.streak,
        stats: participant.stats,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /challenges/:slug/progress/me ────────────────
progressRouter.get(
  "/:slug/progress/me",
  requireAuth,
  async (req, res, next) => {
    try {
      const challenge = await Challenge.findOne({ slug: req.params.slug }).lean();
      if (!challenge) {
        return res.status(404).json({ error: "CHALLENGE_NOT_FOUND" });
      }

      const participant = await assertParticipant(challenge._id, req.userId);
      if (!participant) {
        return res.status(403).json({ error: "NOT_A_PARTICIPANT" });
      }

      const rows = await Progress.find({
        challengeId: challenge._id,
        userId: req.userId,
      })
        .sort({ dayNumber: 1 })
        .lean();

      res.json({
        progress: rows.map(serializeProgress),
        streak: participant.streak,
        stats: participant.stats,
        totalDays: challenge.availableDays,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /challenges/:slug/progress/summary ───────────
progressRouter.get(
  "/:slug/progress/summary",
  requireAuth,
  async (req, res, next) => {
    try {
      const challenge = await Challenge.findOne({ slug: req.params.slug }).lean();
      if (!challenge) {
        return res.status(404).json({ error: "CHALLENGE_NOT_FOUND" });
      }

      const isCreator = String(challenge.creatorId) === String(req.userId);
      const isParticipant = await assertParticipant(challenge._id, req.userId);
      if (!isCreator && !isParticipant) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }

      const totalParticipants = await Participant.countDocuments({
        challengeId: challenge._id,
      });

      const grouped = await Progress.aggregate([
        {
          $match: {
            challengeId: challenge._id,
            status: "COMPLETED",
          },
        },
        {
          $group: {
            _id: "$dayNumber",
            completedCount: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      const byDay = new Map(grouped.map((g) => [g._id, g.completedCount]));

      // Build a flat list of all days with aggregate completion counts.
      const summary = [];
      for (const phase of challenge.phases ?? []) {
        for (const day of phase.days ?? []) {
          summary.push({
            dayNumber: day.dayNumber,
            dayId: String(day._id),
            title: day.title,
            scheduledDate: day.scheduledDate,
            completedCount: byDay.get(day.dayNumber) ?? 0,
          });
        }
      }

      res.json({
        totalParticipants,
        totalDays: challenge.availableDays,
        summary,
      });
    } catch (err) {
      next(err);
    }
  }
);