import { getAuth } from "@clerk/express";
import { User } from "../models/User.js";
import { generatePermanentId } from "../utils/permanentId.js";

export async function requireAuth(req, res, next) {
  try {
    const auth = getAuth(req);
    console.log("[auth] getAuth:", JSON.stringify(auth));
    console.log("[auth] header starts:", req.headers.authorization?.slice(0, 30));

    const { userId } = auth;

    if (!userId) {
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }

    let user = await User.findOne({ clerkId: userId });
    if (!user) {
      user = await User.create({
        clerkId: userId,
        permanentId: await generatePermanentId(),
      });
    }

    req.userId = String(user._id);
    req.clerkId = userId;
    next();
  } catch (err) {
    console.error("[auth] error:", err);
    next(err);
  }
}