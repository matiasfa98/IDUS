// src/middleware/clerk.js
import { clerkMiddleware } from "@clerk/express";
import { config } from "../config.js";

export const idusClerk = clerkMiddleware({
  publishableKey: config.clerk.publishableKey,
  secretKey: config.clerk.secretKey,
  authorizedParties: [
    "https://ultimate-fish-8975.accounts.dev",
    "http://localhost:4000", // In case you test from a local frontend later
  ],
  // Keep debug on for now to see the exact error
  debug: true,
});