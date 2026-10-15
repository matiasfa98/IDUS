// src/routes/dev.js
import express from "express";
import { config } from "../config.js";
import { devTokenLimiter } from "../middleware/rateLimit.js";

export const devRouter = express.Router();

// Hard guard: never mount in production.
if (config.env === "production") {
  throw new Error("devRouter must not be loaded in production");
}

const REQUESTED_TTL_SECONDS = 60 * 60; // ask for 1h — Clerk may ignore

devRouter.post("/token", devTokenLimiter, async (req, res, next) => {
  try {
    const secret = req.headers["x-dev-secret"];
    if (!secret || secret !== process.env.DEV_TOKEN_SECRET) {
      return res.status(401).json({ error: "BAD_DEV_SECRET" });
    }

    const { userId } = req.body ?? {};

    if (!userId || !/^user_[A-Za-z0-9]{20,}$/.test(userId)) {
      return res.status(400).json({
        error: "INVALID_USER_ID",
        message: `userId looks wrong: "${userId}" (length ${userId?.length})`,
      });
    }

    // ── Create session ─────────────────────────────
    const sessionRes = await fetch("https://api.clerk.com/v1/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.clerk.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: userId }),
    });

    if (!sessionRes.ok) {
      const text = await sessionRes.text();
      console.error("[dev/token] session create failed:", sessionRes.status, text);
      return res.status(sessionRes.status).json({
        error: "CLERK_SESSION_CREATE_FAILED",
        message: text,
      });
    }

    const session = await sessionRes.json();

    // ── Mint token ─────────────────────────────────
    const tokenRes = await fetch(
      `https://api.clerk.com/v1/sessions/${session.id}/tokens?expires_in_seconds=${REQUESTED_TTL_SECONDS}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.clerk.secretKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error("[dev/token] token mint failed:", tokenRes.status, text);
      return res.status(tokenRes.status).json({
        error: "CLERK_TOKEN_MINT_FAILED",
        message: text,
      });
    }

    const tok = await tokenRes.json();

    // ── Decode the actual JWT to find its real expiry ──────
    // Clerk silently ignores `expires_in_seconds` on some instances
    // (notably free tier), returning a 60s token instead. Trust the
    // token itself, not our request.
    let actualExp = null;
    try {
      const payloadB64 = tok.jwt.split(".")[1];
      const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf8");
      const payload = JSON.parse(payloadJson);
      actualExp = payload.exp;
    } catch (err) {
      console.error("[dev/token] failed to decode JWT:", err.message);
    }

    const now = Math.floor(Date.now() / 1000);
    const actualTtl = actualExp ? actualExp - now : 60;

    console.log(
      `[dev/token] minted for ${userId} — Clerk issued ${actualTtl}s TTL`
    );

    res.json({
      token: tok.jwt,
      sessionId: session.id,
      expiresIn: actualTtl,
      expiresAt: actualExp,
    });
  } catch (err) {
    console.error("[dev/token] error:", err);
    next(err);
  }
});