// src/routes/presence.js
import express from "express";
import { z } from "zod";

import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { getPresenceBatch } from "../services/presence.js";

export const presenceRouter = express.Router();

const querySchema = z.object({
  userIds: z.string().min(1).max(500),
});

// ── GET /presence?userIds=a,b,c ──────────────────────
presenceRouter.get(
  "/",
  requireAuth,
  (req, res, next) => {
    try {
      const { userIds } = req.query;
      if (!userIds) {
        return res.status(400).json({ error: "MISSING_USER_IDS" });
      }

      const ids = userIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 100); // cap

      res.json({ presence: getPresenceBatch(ids) });
    } catch (err) {
      next(err);
    }
  }
);
