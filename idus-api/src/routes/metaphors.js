// src/routes/metaphors.js
import express from "express";

import { requireAuth } from "../middleware/auth.js";
import { searchLimiter } from "../middleware/rateLimit.js";
import { searchCharacters, getCharacterById } from "../services/anilist.js";
import { GENRES, ARCHETYPES, VIBES } from "../data/metaphors.js";

export const metaphorsRouter = express.Router();

// ── GET /metaphors/catalog ───────────────────────────
// The closed enums from data/metaphors.js. Static.
metaphorsRouter.get("/catalog", (req, res) => {
  res.json({
    genres: GENRES,
    archetypes: ARCHETYPES,
    vibes: VIBES,
  });
});

// ── GET /metaphors/search?q=frieren ──────────────────
metaphorsRouter.get(
  "/search",
  requireAuth,
  searchLimiter,
  async (req, res, next) => {
    try {
      const rawQ = (req.query.q ?? "").toString().trim();
      if (rawQ.length < 2) {
        return res.status(400).json({
          error: "QUERY_TOO_SHORT",
          message: "Search query must be at least 2 characters.",
        });
      }

      const results = await searchCharacters(rawQ, {
        page: Number(req.query.page) || 1,
        perPage: Math.min(Number(req.query.perPage) || 20, 30),
      });

      res.json({ results, count: results.length });
    } catch (err) {
      if (err.code === "ANILIST_RATE_LIMITED") {
        return res.status(429).json({
          error: "UPSTREAM_RATE_LIMITED",
          message: "AniList is rate limiting us. Try again shortly.",
          retryAfter: err.retryAfter ?? 60,
        });
      }
      next(err);
    }
  }
);

// ── GET /metaphors/character/:externalId ─────────────
// Fetch one AniList character for re-verification.
metaphorsRouter.get(
  "/character/:externalId",
  requireAuth,
  async (req, res, next) => {
    try {
      const c = await getCharacterById(req.params.externalId);
      if (!c) {
        return res.status(404).json({ error: "CHARACTER_NOT_FOUND" });
      }
      res.json({ character: c });
    } catch (err) {
      next(err);
    }
  }
);