import mongoose from "mongoose";
import {
  GENRES,
  ARCHETYPES,
  VIBES,
  DEFAULT_METAPHOR,
  METAPHOR_LIMITS,
} from "../data/metaphors.js";

const artSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      enum: ["catalog", "anilist", "upload"],
      required: true,
    },
    url: { type: String, required: true },
    thumbUrl: String,
    attribution: {
      type: String,
      maxlength: METAPHOR_LIMITS.attributionMax,
    },
    externalId: String, // AniList character id, Cloudinary public_id, etc.
  },
  { _id: false }
);

const metaphorSchema = new mongoose.Schema(
  {
    genre: { type: String, enum: GENRES, default: DEFAULT_METAPHOR.genre },
    archetype: {
      type: String,
      enum: ARCHETYPES,
      default: DEFAULT_METAPHOR.archetype,
    },
    vibe: { type: String, enum: VIBES, default: DEFAULT_METAPHOR.vibe },
    displayName: {
      type: String,
      maxlength: METAPHOR_LIMITS.displayNameMax,
      default: null,
    },
    tagline: {
      type: String,
      maxlength: METAPHOR_LIMITS.taglineMax,
      default: null,
    },
    art: { type: artSchema, default: null },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const deviceKeySchema = new mongoose.Schema(
  {
    keyId: { type: String, required: true },
    publicKey: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    revokedAt: Date,
  },
  { _id: false }
);

const settingsSchema = new mongoose.Schema(
  {
    notifications: {
      dailyReminder: { type: Boolean, default: true },
      streakAtRisk: { type: Boolean, default: true },
      phaseStart: { type: Boolean, default: true },
    },
    theme: { type: String, enum: ["dark", "light", "system"], default: "dark" },
    privacy: {
      discoverable: { type: Boolean, default: true },
      showProgress: { type: Boolean, default: true },
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    clerkId: { type: String, required: true, unique: true, index: true },
    permanentId: { type: String, required: true, unique: true, index: true },
    username: { type: String, unique: true, sparse: true },
    fullName: String,
    metaphor: { type: metaphorSchema, default: () => ({}) },
    motto: String,
    skills: { type: [String], default: [] },
    settings: { type: settingsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

// Indexes for discovery (used by Batch 7+).
userSchema.index({ "metaphor.genre": 1, "metaphor.archetype": 1 });
userSchema.index({ "metaphor.vibe": 1 });

export const User = mongoose.model("User", userSchema);