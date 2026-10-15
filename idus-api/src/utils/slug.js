import { Challenge } from "../models/Challenge.js";

const SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I,O,0,1

function randomString(length, alphabet) {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export async function generateSlug(title) {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40) || "challenge";

  const MAX_ATTEMPTS = 10;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const candidate = i === 0 ? base : `${base}-${randomString(4, SLUG_ALPHABET)}`;
    const exists = await Challenge.exists({ slug: candidate });
    if (!exists) return candidate;
  }
  throw new Error("Failed to generate unique slug");
}

export async function generateInviteCode() {
  const MAX_ATTEMPTS = 10;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const code = randomString(6, CODE_ALPHABET);
    const exists = await Challenge.exists({ inviteCode: code });
    if (!exists) return code;
  }
  throw new Error("Failed to generate unique invite code");
}