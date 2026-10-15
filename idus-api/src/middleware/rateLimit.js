// src/middleware/rateLimit.js
//
// Sliding-window rate limiter. In-memory only — single process.
// For multi-instance scale, swap the Map for Redis (INCR + EXPIRE).

const buckets = new Map(); // key -> array of timestamps (ms), ascending

// Periodic cleanup to avoid unbounded growth.
const CLEANUP_INTERVAL_MS = 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of buckets.entries()) {
    const pruned = timestamps.filter((t) => now - t < 60 * 60 * 1000);
    if (pruned.length === 0) buckets.delete(key);
    else buckets.set(key, pruned);
  }
}, CLEANUP_INTERVAL_MS).unref();

/**
 * Create a rate-limit middleware.
 *
 * @param {object} opts
 * @param {number} opts.windowMs - window duration in ms
 * @param {number} opts.max - max requests per window
 * @param {string} opts.name - identifier for error messages + key namespacing
 * @param {(req: import("express").Request) => string} [opts.keyFn]
 * @returns {import("express").RequestHandler}
 */
export function rateLimit({ windowMs, max, name, keyFn }) {
  return (req, res, next) => {
    const key = `${name}:${keyFn ? keyFn(req) : defaultKey(req)}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Prune expired timestamps for this key.
    let timestamps = (buckets.get(key) ?? []).filter((t) => t > windowStart);

    const wouldExceed = timestamps.length >= max;

    if (wouldExceed) {
      // Compute when the user can retry.
      // We have N = timestamps.length requests in the window.
      // We need to get down to max requests.
      // The oldest (N - max + 1) timestamps must expire before we accept.
      // The one that matters is timestamps[N - max] (0-indexed).
      const indexToExpire = timestamps.length - max;
      const pivot = timestamps[indexToExpire] ?? timestamps[0] ?? now;
      const retryAt = pivot + windowMs;
      const retryAfterSec = Math.max(1, Math.ceil((retryAt - now) / 1000));

      // Do NOT push the current request into the bucket —
      // rejected requests shouldn't count toward the next window.
      buckets.set(key, timestamps);

      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", "0");
      res.setHeader("X-RateLimit-Reset", String(Math.ceil(retryAt / 1000)));
      res.setHeader("Retry-After", String(retryAfterSec));

      return res.status(429).json({
        error: "RATE_LIMITED",
        message: `Too many requests. Try again in ${retryAfterSec}s.`,
        retryAfter: retryAfterSec,
      });
    }

    // Accept: push and continue.
    timestamps.push(now);
    buckets.set(key, timestamps);

    const remaining = Math.max(0, max - timestamps.length);
    // Reset time = when the oldest accepted request leaves the window.
    const oldest = timestamps[0] ?? now;
    const resetAt = oldest + windowMs;

    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));

    next();
  };
}

function defaultKey(req) {
  if (req.userId) return `u:${req.userId}`;
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return `ip:${forwarded.split(",")[0].trim()}`;
  }
  return `ip:${req.ip}`;
}

// ── Prebuilt limiters ────────────────────────────────

export const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  name: "search",
});

export const uploadSignLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  name: "upload-sign",
});

export const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  name: "messages",
});

export const contactRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  name: "contact-requests",
});

export const devTokenLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  name: "dev-token",
  keyFn: (req) =>
    `ip:${(req.headers["x-forwarded-for"] ?? req.ip ?? "unknown")
      .toString()
      .split(",")[0]
      .trim()}`,
});

export const syncLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  name: "sync",
});

export const generateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  name: "generate",
});