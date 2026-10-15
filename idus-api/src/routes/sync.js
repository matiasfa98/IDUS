// src/routes/sync.js
import express from "express";
import { z } from "zod";

import { SyncLog } from "../models/SyncLog.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { dispatchAction, SUPPORTED_ACTIONS } from "../services/actionHandlers.js";
import { syncLimiter } from "../middleware/rateLimit.js";

export const syncRouter = express.Router();

// ── Schemas ──────────────────────────────────────────
const actionSchema = z.object({
  clientActionId: z.string().min(8).max(64),
  type: z.string().min(3).max(40),
  payload: z.record(z.any()).optional(),
});

const syncSchema = z.object({
  actions: z.array(actionSchema).min(1).max(200),
});

// ── POST /sync ───────────────────────────────────────
syncRouter.post("/", requireAuth, syncLimiter, validate(syncSchema), async (req, res, next) => {
  try {
    const { actions } = req.body;

    const results = [];

    for (const action of actions) {
      const { clientActionId, type } = action;

      // ── Idempotency check: have we seen this action before? ──
      const priorLog = await SyncLog.findOne({
        userId: req.userId,
        clientActionId,
      }).lean();

      if (priorLog) {
        results.push({
          clientActionId,
          type,
          status: priorLog.status,
          reason: priorLog.reason ?? null,
          replay: true,
          result: priorLog.result ?? null,
        });
        continue;
      }

      // ── Dispatch to handler ──
      const outcome = await dispatchAction(req.userId, action);

      // ── Persist outcome to SyncLog for replay protection ──
      // SyncLog requires challengeId; for non-challenge actions we store the
      // conversation or a placeholder. Keep the model's spirit: any ObjectId.
      let challengeIdForLog = null;
      if (type === "DAY_COMPLETE" && action.payload?.challengeSlug) {
        // Look up the actual challengeId via the handler's result would be
        // ideal, but simpler: reuse a placeholder ObjectId for non-challenge
        // types and require the frontend to send challengeId when relevant.
      }

      // Extract challengeId from result if handler returned one; otherwise
      // fall back to a syntactically valid placeholder so the schema's
      // required field is satisfied.
      const placeholderId = action.payload?.challengeId
        ?? action.payload?.conversationId
        ?? "000000000000000000000000";

            await SyncLog.updateOne(
        { userId: req.userId, clientActionId },
        {
          $setOnInsert: {
            userId: req.userId,
            challengeId: action.payload?.challengeId ?? null,
            conversationId: action.payload?.conversationId ?? null,
            clientActionId,
            actionType: type,
            status: outcome.status,
            reason: outcome.reason ?? null,
          },
        },
        { upsert: true }
      );

      results.push({
        clientActionId,
        type,
        status: outcome.status,
        reason: outcome.reason ?? null,
        replay: false,
        result: outcome.result ?? null,
      });
    }

    res.json({ results });
  } catch (err) {
    next(err);
  }
});

// ── GET /sync/supported ──────────────────────────────
// Introspection endpoint — handy for debugging and for the frontend to know
// what action types are valid.
syncRouter.get("/supported", (req, res) => {
  res.json({ actions: SUPPORTED_ACTIONS });
});