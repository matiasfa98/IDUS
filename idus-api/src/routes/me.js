// src/routes/me.js
import express from "express";
import { z } from "zod";

import { User } from "../models/User.js";
import { Challenge } from "../models/Challenge.js";
import { Participant } from "../models/Participant.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { serializeUser } from "../utils/serializeUser.js";
import { GENRES, ARCHETYPES, VIBES } from "../data/metaphors.js";
import { getCharacterById } from "../services/anilist.js";
import { fetchResourceMetadata } from "../services/cloudinary.js";

export const meRouter = express.Router();

// ── Schemas ──────────────────────────────────────────
const patchMeSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/).optional(),
  fullName: z.string().max(80).optional(),
  motto: z.string().max(200).optional(),
  skills: z.array(z.string().max(40)).max(50).optional(),
  settings: z.object({
    notifications: z.object({
      dailyReminder: z.boolean().optional(),
      streakAtRisk: z.boolean().optional(),
      phaseStart: z.boolean().optional(),
    }).optional(),
    theme: z.enum(["dark", "light", "system"]).optional(),
    privacy: z.object({
      discoverable: z.boolean().optional(),
      showProgress: z.boolean().optional(),
    }).optional(),
  }).optional(),
});

const patchMetaphorSchema = z.object({
  genre: z.enum(GENRES).optional(),
  archetype: z.enum(ARCHETYPES).optional(),
  vibe: z.enum(VIBES).optional(),
  displayName: z.string().max(40).nullable().optional(),
  tagline: z.string().max(120).nullable().optional(),
});

// ── GET /me ──────────────────────────────────────────
meRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).lean();
    if (!user) {
      return res.status(404).json({ error: "USER_NOT_FOUND" });
    }
    res.json({ user: serializeUser(user, { self: true }) });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /me ────────────────────────────────────────
meRouter.patch(
  "/",
  requireAuth,
  validate(patchMeSchema),
  async (req, res, next) => {
    try {
      const user = await User.findById(req.userId);
      if (!user) {
        return res.status(404).json({ error: "USER_NOT_FOUND" });
      }

      const b = req.body;

      if (b.username !== undefined) {
        const taken = await User.findOne({
          username: b.username,
          _id: { $ne: user._id },
        });
        if (taken) {
          return res.status(409).json({
            error: "USERNAME_TAKEN",
            message: "That username is already in use.",
          });
        }
        user.username = b.username;
      }

      if (b.fullName !== undefined) user.fullName = b.fullName;
      if (b.motto !== undefined) user.motto = b.motto;
      if (b.skills !== undefined) user.skills = b.skills;

      if (b.settings) {
        user.settings = {
          notifications: {
            ...(user.settings?.notifications ?? {}),
            ...(b.settings.notifications ?? {}),
          },
          theme: b.settings.theme ?? user.settings?.theme ?? "dark",
          privacy: {
            ...(user.settings?.privacy ?? {}),
            ...(b.settings.privacy ?? {}),
          },
        };
      }

      await user.save();
      res.json({ user: serializeUser(user.toObject(), { self: true }) });
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /me/metaphor ───────────────────────────────
meRouter.patch(
  "/metaphor",
  requireAuth,
  validate(patchMetaphorSchema),
  async (req, res, next) => {
    try {
      const user = await User.findById(req.userId);
      if (!user) {
        return res.status(404).json({ error: "USER_NOT_FOUND" });
      }

      const b = req.body;

      // Ensure metaphor subdoc exists.
      if (!user.metaphor) user.metaphor = {};
      const m = user.metaphor;

      if (b.genre !== undefined) m.genre = b.genre;
      if (b.archetype !== undefined) m.archetype = b.archetype;
      if (b.vibe !== undefined) m.vibe = b.vibe;
      if (b.displayName !== undefined) m.displayName = b.displayName;
      if (b.tagline !== undefined) m.tagline = b.tagline;

      m.updatedAt = new Date();

      user.markModified("metaphor");
      await user.save();

      res.json({ user: serializeUser(user.toObject(), { self: true }) });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /me/challenges ───────────────────────────────
// One-call convenience for the home screen.
meRouter.get("/challenges", requireAuth, async (req, res, next) => {
  try {
    // Created
    const created = await Challenge.find({ creatorId: req.userId })
      .sort({ createdAt: -1 })
      .lean();

    // Joined
    const participations = await Participant.find({ userId: req.userId })
      .sort({ joinedAt: -1 })
      .lean();

    const joinedIds = participations.map((p) => p.challengeId);
    const joinedChallenges = await Challenge.find({
      _id: { $in: joinedIds },
    }).lean();

    const joinedMap = new Map(joinedChallenges.map((c) => [String(c._id), c]));

    const joined = participations
      .filter((p) => joinedMap.has(String(p.challengeId)))
      .map((p) => {
        const c = joinedMap.get(String(p.challengeId));
        return {
          challenge: serializeChallengeSummary(c),
          participant: {
            role: p.role,
            joinedAt: p.joinedAt,
            streak: p.streak,
            stats: p.stats,
          },
        };
      });

    res.json({
      created: created.map(serializeChallengeSummary),
      joined,
    });
  } catch (err) {
    next(err);
  }
});


// ── POST /me/metaphor/art/anilist ────────────────────
// Pin an AniList character as the user's metaphor art.
meRouter.post(
  "/metaphor/art/anilist",
  requireAuth,
  async (req, res, next) => {
    try {
      const { externalId } = req.body ?? {};
      if (!externalId) {
        return res.status(400).json({ error: "MISSING_EXTERNAL_ID" });
      }

      // Re-verify the character exists. Don't trust the client's URL.
      const character = await getCharacterById(externalId);
      if (!character || !character.image) {
        return res.status(404).json({ error: "CHARACTER_NOT_FOUND" });
      }

      const user = await User.findById(req.userId);
      if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });

      if (!user.metaphor) user.metaphor = {};
      user.metaphor.art = {
        source: "anilist",
        url: character.image,
        thumbUrl: character.thumb,
        attribution: "via AniList",
        externalId: String(character.externalId),
      };
      user.metaphor.updatedAt = new Date();
      user.markModified("metaphor");
      await user.save();

      res.json({ user: serializeUser(user.toObject(), { self: true }) });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /me/metaphor/art/upload ─────────────────────
// Pin a custom-uploaded Cloudinary asset as the user's metaphor art.
meRouter.post(
  "/metaphor/art/upload",
  requireAuth,
  async (req, res, next) => {
    try {
      const { publicId } = req.body ?? {};
      if (!publicId) {
        return res.status(400).json({ error: "MISSING_PUBLIC_ID" });
      }

      // Ownership check: must be in this user's folder.
      const expectedPrefix = `attachments/image/${req.userId}/`;
      if (!publicId.startsWith(expectedPrefix)) {
        return res.status(403).json({
          error: "NOT_YOUR_RESOURCE",
          message: `publicId must start with "${expectedPrefix}".`,
        });
      }

      const meta = await fetchResourceMetadata(publicId, "image");
      if (!meta || !meta.url) {
        return res.status(404).json({ error: "RESOURCE_NOT_FOUND" });
      }

      const user = await User.findById(req.userId);
      if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });

      if (!user.metaphor) user.metaphor = {};
      user.metaphor.art = {
        source: "upload",
        url: meta.url,
        thumbUrl: meta.thumbUrl,
        attribution: null,
        externalId: publicId,
      };
      user.metaphor.updatedAt = new Date();
      user.markModified("metaphor");
      await user.save();

      res.json({ user: serializeUser(user.toObject(), { self: true }) });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /me/metaphor/art ──────────────────────────
meRouter.delete("/metaphor/art", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });

    if (user.metaphor) {
      user.metaphor.art = null;
      user.metaphor.updatedAt = new Date();
      user.markModified("metaphor");
      await user.save();
    }

    res.json({ user: serializeUser(user.toObject(), { self: true }) });
  } catch (err) {
    next(err);
  }
});

// ── Local serializer for the home screen ─────────────
// A lighter shape than the full challenge — the frontend home
// doesn't need every phase and day, just the header info.
function serializeChallengeSummary(c) {
  return {
    id: String(c._id),
    slug: c.slug,
    title: c.title,
    topic: c.topic,
    difficulty: c.difficulty,
    status: c.status,
    startDate: c.startDate,
    endDate: c.endDate,
    availableDays: c.availableDays,
    dailyMinutes: c.dailyMinutes,
    visibility: c.visibility,
    creatorId: String(c.creatorId),
    version: c.version,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}