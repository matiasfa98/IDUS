import { generateChallengeProgression } from "./gemini.js";
import {
  validateProgression,
  normalizeProgression,
} from "./challengeValidator.js";

/**
 * Generate a challenge progression with one retry on validation failure.
 */
export async function generateValidatedProgression(spec) {
  let lastError = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`[gemini] attempt ${attempt}`);
      const raw = await generateChallengeProgression(spec);
      const normalized = normalizeProgression(raw);
      validateProgression(normalized, spec);
      console.log(`[gemini] attempt ${attempt} passed validation`);
      return normalized;
    } catch (err) {
      lastError = err;
      console.warn(`[gemini] attempt ${attempt} failed:`, err.message);
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  throw new Error(`Gemini generation failed after 2 attempts: ${lastError?.message}`);
}