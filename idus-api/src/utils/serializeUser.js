// src/utils/serializeUser.js
import { DEFAULT_METAPHOR } from "../data/metaphors.js";

/**
 * Public-safe user shape. Use this everywhere a user is embedded in a response.
 * Pass `{ self: true }` to include fields only the owner should see.
 */
export function serializeUser(user, { self = false } = {}) {
  if (!user) return null;

  const m = user.metaphor ?? {};

  const base = {
    id: String(user._id),
    permanentId: user.permanentId,
    username: user.username ?? null,
    fullName: user.fullName ?? null,
    metaphor: {
      genre: m.genre ?? DEFAULT_METAPHOR.genre,
      archetype: m.archetype ?? DEFAULT_METAPHOR.archetype,
      vibe: m.vibe ?? DEFAULT_METAPHOR.vibe,
      displayName: m.displayName ?? null,
      tagline: m.tagline ?? null,
      art: m.art
        ? {
            source: m.art.source,
            url: m.art.url,
            thumbUrl: m.art.thumbUrl ?? null,
            attribution: m.art.attribution ?? null,
          }
        : null,
      updatedAt: m.updatedAt ?? null,
    },
    motto: user.motto ?? null,
    skills: user.skills ?? [],
    createdAt: user.createdAt,
  };

  if (!self) return base;

  return {
    ...base,
    settings: user.settings,
    updatedAt: user.updatedAt,
  };
}