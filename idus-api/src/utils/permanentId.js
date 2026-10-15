import { User } from "../models/User.js";

export async function generatePermanentId() {
  const MAX_ATTEMPTS = 10;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const id = String(Math.floor(100000 + Math.random() * 900000));

    const exists = await User.exists({ permanentId: id });
    if (!exists) return id;
  }

  throw new Error("Failed to generate a unique permanent ID after 10 attempts");
}