// src/scripts/migrateMetaphors.js
//
// Migrates User.metaphor from the old flat shape
//   { key, label, animeTheme, customArtUrl }
// to the new two-layer shape
//   { genre, archetype, vibe, displayName, tagline, art }
//
// Run: node src/scripts/migrateMetaphors.js
// Idempotent. Backs off if `metaphor.genre` is already set.

import mongoose from "mongoose";
import { config } from "../src/config.js";
import { User } from "../src/models/User.js";
import { DEFAULT_METAPHOR } from "../src/data/metaphors.js";

async function main() {
  await mongoose.connect(config.mongoUri);
  console.log("[migrate] connected");

  const cursor = User.find({
    $or: [
      { "metaphor.genre": { $exists: false } },
      { "metaphor.genre": null },
    ],
  }).cursor();

  let count = 0;
  for await (const user of cursor) {
    const old = user.metaphor ?? {};
    user.metaphor = {
      genre: DEFAULT_METAPHOR.genre,
      archetype: DEFAULT_METAPHOR.archetype,
      vibe: DEFAULT_METAPHOR.vibe,
      displayName: old.label ?? null,
      tagline: old.animeTheme ?? null,
      art: old.customArtUrl
        ? {
            source: "upload",
            url: old.customArtUrl,
            thumbUrl: null,
            attribution: null,
            externalId: null,
          }
        : null,
      updatedAt: new Date(),
    };
    await user.save();
    count++;
  }

  console.log(`[migrate] done — ${count} user(s) updated`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[migrate] failed", err);
  process.exit(1);
});