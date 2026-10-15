// src/routes/challenges.js
import express from "express";
import { z } from "zod";
import mongoose from "mongoose";

import { Challenge } from "../models/Challenge.js";
import { Participant } from "../models/Participant.js";
import { Conversation } from "../models/Conversation.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { generateSlug, generateInviteCode } from "../utils/slug.js";
import { resolveChallengeDays } from "../utils/scheduleResolver.js";
import { generateValidatedProgression } from "../services/geminiGenerate.js";
import { generateLimiter } from "../middleware/rateLimit.js";

export const challengesRouter = express.Router();

// ── Schemas ──────────────────────────────────────────
const scheduleSchema = z.object({
  type: z.enum(["weekdays", "custom", "explicit"]),
  days: z.array(z.number().int().min(0).max(6)).optional(),
  dates: z.array(z.string()).optional(),
});

const baseChallengeSchema = z.object({
  title: z.string().min(3).max(120),
  topic: z.string().min(2).max(80),
  description: z.string().max(2000).default(""),
  difficulty: z.enum([
    "BEGINNER",
    "ELEMENTARY",
    "INTERMEDIATE",
    "ADVANCED",
    "EXPERT",
  ]),
  startDate: z.string(),
  endDate: z.string(),
  schedule: scheduleSchema,
  dailyMinutes: z.number().int().min(5).max(600).default(60),
  goal: z.string().max(500).optional(),
  visibility: z.enum(["PRIVATE", "UNLISTED", "PUBLIC"]).default("PRIVATE"),
  monthLabels: z.boolean().default(false),
});

const createChallengeSchema = baseChallengeSchema.refine(
  (d) => new Date(d.startDate) <= new Date(d.endDate),
  { message: "startDate must be before endDate", path: ["endDate"] }
);

const updateChallengeSchema = baseChallengeSchema.partial();

// ── Helpers ──────────────────────────────────────────
function serializeChallenge(c) {
  return {
    id: String(c._id),
    slug: c.slug,
    inviteCode: c.inviteCode,
    title: c.title,
    topic: c.topic,
    description: c.description,
    difficulty: c.difficulty,
    skillMode: c.skillMode,
    startDate: c.startDate,
    endDate: c.endDate,
    schedule: c.schedule,
    availableDays: c.availableDays,
    dailyMinutes: c.dailyMinutes,
    goal: c.goal,
    monthLabels: c.monthLabels,
    visibility: c.visibility,
    status: c.status,
    creatorId: String(c.creatorId),
    phases: c.phases ?? [],
    settings: c.settings,
    version: c.version,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

async function upsertCreatorParticipant(challengeId, userId) {
  return Participant.updateOne(
    { challengeId, userId },
    {
      $setOnInsert: {
        challengeId,
        userId,
        role: "MODERATOR",
        joinedAt: new Date(),
      },
    },
    { upsert: true }
  );
}

/**
 * Ensure the challenge has a conversation. Called on publish.
 * Idempotent — safe to call repeatedly.
 */
async function ensureChallengeConversation(challenge) {
  let convo = await Conversation.findOne({ challengeId: challenge._id });

  if (!convo) {
    convo = await Conversation.create({
      type: "challenge",
      challengeId: challenge._id,
      participants: [
        {
          userId: challenge.creatorId,
          role: "ADMIN",
          joinedAt: new Date(),
        },
      ],
      createdBy: challenge.creatorId,
    });
    console.log(
      `[challenges] created conversation ${convo._id} for ${challenge.slug}`
    );
  }

  return convo;
}

/**
 * Add a user to the challenge conversation if not already an active participant.
 * Idempotent.
 */
async function addConversationParticipant(challengeId, userId, role) {
  const convo = await Conversation.findOne({ challengeId });
  if (!convo) return null;

  const alreadyIn = convo.participants.some(
    (p) => String(p.userId) === String(userId) && !p.leftAt
  );
  if (alreadyIn) return convo;

  convo.participants.push({
    userId,
    role,
    joinedAt: new Date(),
  });
  await convo.save();
  return convo;
}

/**
 * Mark a user as having left the challenge conversation.
 * Idempotent.
 */
async function removeConversationParticipant(challengeId, userId) {
  const convo = await Conversation.findOne({ challengeId });
  if (!convo) return null;

  const p = convo.participants.find(
    (x) => String(x.userId) === String(userId) && !x.leftAt
  );
  if (!p) return convo;

  p.leftAt = new Date();
  await convo.save();
  return convo;
}

// ── POST /challenges ─────────────────────────────────
challengesRouter.post(
  "/",
  requireAuth,
  validate(createChallengeSchema),
  async (req, res, next) => {
    try {
      const body = req.body;
      const start = new Date(body.startDate);
      const end = new Date(body.endDate);

      const challengeDays = resolveChallengeDays(start, end, body.schedule);

      if (challengeDays.length === 0) {
        return res.status(400).json({
          error: "NO_CHALLENGE_DAYS",
          message: "The given schedule produces zero challenge days.",
        });
      }

      const slug = await generateSlug(body.title);
      const inviteCode = await generateInviteCode();

      const challenge = await Challenge.create({
        slug,
        inviteCode,
        title: body.title,
        topic: body.topic,
        description: body.description,
        difficulty: body.difficulty,
        skillMode: "SHARED",
        startDate: start,
        endDate: end,
        schedule: body.schedule,
        availableDays: challengeDays.length,
        dailyMinutes: body.dailyMinutes,
        goal: body.goal,
        monthLabels: body.monthLabels,
        visibility: body.visibility,
        status: "DRAFT",
        creatorId: req.userId,
        phases: [],
      });

      res.status(201).json({ challenge: serializeChallenge(challenge) });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /challenges/mine ─────────────────────────────
challengesRouter.get("/mine", requireAuth, async (req, res, next) => {
  try {
    const challenges = await Challenge.find({ creatorId: req.userId })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ challenges: challenges.map(serializeChallenge) });
  } catch (err) {
    next(err);
  }
});

// ── GET /challenges/joined ───────────────────────────
challengesRouter.get("/joined", requireAuth, async (req, res, next) => {
  try {
    const participations = await Participant.find({ userId: req.userId })
      .sort({ joinedAt: -1 })
      .lean();

    const challengeIds = participations.map((p) => p.challengeId);
    const challenges = await Challenge.find({
      _id: { $in: challengeIds },
      status: "PUBLISHED",
    }).lean();

    const challengeMap = new Map(challenges.map((c) => [String(c._id), c]));

    const result = participations
      .filter((p) => challengeMap.has(String(p.challengeId)))
      .map((p) => {
        const c = challengeMap.get(String(p.challengeId));
        return {
          challenge: serializeChallenge(c),
          participant: {
            role: p.role,
            joinedAt: p.joinedAt,
            streak: p.streak,
            stats: p.stats,
          },
        };
      });

    res.json({ joined: result });
  } catch (err) {
    next(err);
  }
});

// ── POST /challenges/:slug/generate ──────────────────
challengesRouter.post(
  "/:slug/generate",
  requireAuth,
  generateLimiter,
  async (req, res, next) => {
    try {
      const challenge = await Challenge.findOne({ slug: req.params.slug });
      if (!challenge) {
        return res.status(404).json({ error: "CHALLENGE_NOT_FOUND" });
      }
      if (String(challenge.creatorId) !== String(req.userId)) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }
      if (challenge.status !== "DRAFT") {
        return res.status(409).json({
          error: "NOT_DRAFT",
          message: "Only drafts can be generated.",
        });
      }

      const spec = {
        topic: challenge.topic,
        description: challenge.description,
        difficulty: challenge.difficulty,
        goal: challenge.goal,
        availableDays: challenge.availableDays,
        dailyMinutes: challenge.dailyMinutes,
        startDate: challenge.startDate.toISOString().slice(0, 10),
        endDate: challenge.endDate.toISOString().slice(0, 10),
        creatorInstructions: req.body?.creatorInstructions,
      };

      const progression = await generateValidatedProgression(spec);

      const scheduledDates = resolveChallengeDays(
        challenge.startDate,
        challenge.endDate,
        challenge.schedule
      );

      const phases = progression.phases.map((phase, phaseIdx) => ({
        order: phaseIdx,
        title: phase.title,
        description: phase.description,
        monthLabel: phase.monthLabel,
        days: phase.days.map((day) => {
          const scheduled = scheduledDates[day.dayNumber - 1];
          return {
            _id: new mongoose.Types.ObjectId(),
            dayNumber: day.dayNumber,
            scheduledDate: scheduled,
            title: day.title,
            type: day.type,
            description: day.description,
            objective: day.objective,
            requirements: day.requirements,
            estimatedMinutes: day.estimatedMinutes,
            isFinal: day.type === "FINAL",
          };
        }),
      }));

      challenge.phases = phases;
      challenge.version += 1;
      await challenge.save();

      res.json({
        challenge: serializeChallenge(challenge),
        generated: {
          phaseCount: phases.length,
          dayCount: progression.phases.reduce((n, p) => n + p.days.length, 0),
          summary: progression.challenge.summary,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /challenges/:slug/publish ───────────────────
challengesRouter.post(
  "/:slug/publish",
  requireAuth,
  async (req, res, next) => {
    try {
      const challenge = await Challenge.findOne({ slug: req.params.slug });
      if (!challenge) {
        return res.status(404).json({ error: "CHALLENGE_NOT_FOUND" });
      }
      if (String(challenge.creatorId) !== String(req.userId)) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }

      const alreadyPublished = challenge.status === "PUBLISHED";

      if (!alreadyPublished) {
        if (!challenge.phases || challenge.phases.length === 0) {
          return res.status(409).json({
            error: "NO_PHASES",
            message:
              "Generate phases first: POST /challenges/:slug/generate",
          });
        }

        // Upsert participant BEFORE flipping status. If this throws,
        // the challenge stays DRAFT and /publish can be retried.
        await upsertCreatorParticipant(challenge._id, req.userId);

        challenge.status = "PUBLISHED";
        challenge.version += 1;
        await challenge.save();
      } else {
        // Already published: still make sure the creator is a participant.
        await upsertCreatorParticipant(challenge._id, req.userId);
      }

      // Ensure the challenge conversation exists (idempotent).
      await ensureChallengeConversation(challenge);

      res.json({
        challenge: serializeChallenge(challenge),
        alreadyPublished,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /challenges/:slug/join ──────────────────────
challengesRouter.post(
  "/:slug/join",
  requireAuth,
  async (req, res, next) => {
    try {
      const challenge = await Challenge.findOne({ slug: req.params.slug });
      if (!challenge) {
        return res.status(404).json({ error: "CHALLENGE_NOT_FOUND" });
      }
      if (challenge.status !== "PUBLISHED") {
        return res.status(409).json({
          error: "NOT_PUBLISHED",
          message:
            "Challenge must be published before joining. POST /challenges/:slug/publish",
        });
      }

      const existing = await Participant.findOne({
        challengeId: challenge._id,
        userId: req.userId,
      });
      if (existing) {
        // Even on repeat join, make sure they're in the conversation.
        await addConversationParticipant(
          challenge._id,
          req.userId,
          String(challenge.creatorId) === String(req.userId)
            ? "ADMIN"
            : "MEMBER"
        );

        return res.status(200).json({
          participant: {
            userId: String(existing.userId),
            role: existing.role,
            joinedAt: existing.joinedAt,
            streak: existing.streak,
            stats: existing.stats,
          },
          alreadyJoined: true,
        });
      }

      const participant = await Participant.create({
        challengeId: challenge._id,
        userId: req.userId,
        role:
          String(challenge.creatorId) === String(req.userId)
            ? "MODERATOR"
            : "MEMBER",
      });

      // Add to challenge conversation (idempotent).
      await addConversationParticipant(
        challenge._id,
        req.userId,
        String(challenge.creatorId) === String(req.userId)
          ? "ADMIN"
          : "MEMBER"
      );

      res.status(201).json({
        participant: {
          userId: String(participant.userId),
          role: participant.role,
          joinedAt: participant.joinedAt,
          streak: participant.streak,
          stats: participant.stats,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /challenges/:slug/leave ───────────────────
challengesRouter.delete(
  "/:slug/leave",
  requireAuth,
  async (req, res, next) => {
    try {
      const challenge = await Challenge.findOne({ slug: req.params.slug });
      if (!challenge) {
        return res.status(404).json({ error: "CHALLENGE_NOT_FOUND" });
      }
      if (String(challenge.creatorId) === String(req.userId)) {
        return res.status(409).json({
          error: "CREATOR_CANNOT_LEAVE",
          message: "Creators cannot leave their own challenge.",
        });
      }

      await Participant.deleteOne({
        challengeId: challenge._id,
        userId: req.userId,
      });

      // Mark conversation participant as left (keep history).
      await removeConversationParticipant(challenge._id, req.userId);

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /challenges/:slug ────────────────────────────
challengesRouter.get("/:slug", requireAuth, async (req, res, next) => {
  try {
    const challenge = await Challenge.findOne({ slug: req.params.slug });
    if (!challenge) {
      return res.status(404).json({ error: "CHALLENGE_NOT_FOUND" });
    }

    const isCreator = String(challenge.creatorId) === String(req.userId);
    const isParticipant = await Participant.exists({
      challengeId: challenge._id,
      userId: req.userId,
    });
    const isVisible =
      challenge.visibility === "PUBLIC" || challenge.visibility === "UNLISTED";

    if (!isCreator && !isParticipant && !isVisible) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    const participantCount = await Participant.countDocuments({
      challengeId: challenge._id,
    });

    res.json({
      challenge: serializeChallenge(challenge),
      participantCount,
      isParticipant: !!isParticipant,
      isCreator,
    });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /challenges/:slug ──────────────────────────
challengesRouter.patch(
  "/:slug",
  requireAuth,
  validate(updateChallengeSchema),
  async (req, res, next) => {
    try {
      const challenge = await Challenge.findOne({ slug: req.params.slug });
      if (!challenge) {
        return res.status(404).json({ error: "CHALLENGE_NOT_FOUND" });
      }

      if (String(challenge.creatorId) !== String(req.userId)) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }

      if (challenge.status !== "DRAFT") {
        return res.status(409).json({
          error: "CHALLENGE_NOT_DRAFT",
          message: "Only drafts can be edited.",
        });
      }

      const body = req.body;

      const nextStart = body.startDate
        ? new Date(body.startDate)
        : challenge.startDate;
      const nextEnd = body.endDate
        ? new Date(body.endDate)
        : challenge.endDate;
      const nextSchedule = body.schedule ?? challenge.schedule;

      if (nextStart > nextEnd) {
        return res.status(400).json({
          error: "INVALID_DATE_RANGE",
          message: "startDate must be before endDate",
        });
      }

      const recompute = body.startDate || body.endDate || body.schedule;
      let nextAvailableDays = challenge.availableDays;
      if (recompute) {
        const days = resolveChallengeDays(nextStart, nextEnd, nextSchedule);
        if (days.length === 0) {
          return res.status(400).json({
            error: "NO_CHALLENGE_DAYS",
            message: "The updated schedule produces zero challenge days.",
          });
        }
        nextAvailableDays = days.length;
      }

      if (body.title) challenge.title = body.title;
      if (body.topic) challenge.topic = body.topic;
      if (body.description !== undefined) challenge.description = body.description;
      if (body.difficulty) challenge.difficulty = body.difficulty;
      if (body.dailyMinutes) challenge.dailyMinutes = body.dailyMinutes;
      if (body.goal !== undefined) challenge.goal = body.goal;
      if (body.visibility) challenge.visibility = body.visibility;
      if (body.monthLabels !== undefined) challenge.monthLabels = body.monthLabels;

      if (recompute) {
        challenge.startDate = nextStart;
        challenge.endDate = nextEnd;
        challenge.schedule = nextSchedule;
        challenge.availableDays = nextAvailableDays;
      }

      challenge.version += 1;
      await challenge.save();

      res.json({ challenge: serializeChallenge(challenge) });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /challenges/:slug ─────────────────────────
challengesRouter.delete("/:slug", requireAuth, async (req, res, next) => {
  try {
    const challenge = await Challenge.findOne({ slug: req.params.slug });
    if (!challenge) {
      return res.status(404).json({ error: "CHALLENGE_NOT_FOUND" });
    }

    if (String(challenge.creatorId) !== String(req.userId)) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    if (challenge.status === "PUBLISHED") {
      return res.status(409).json({
        error: "CANNOT_DELETE_PUBLISHED",
        message: "Archive the challenge instead.",
      });
    }

    await Challenge.deleteOne({ _id: challenge._id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});