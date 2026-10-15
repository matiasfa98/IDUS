import mongoose from "mongoose";

const DIFFICULTIES = ["BEGINNER", "ELEMENTARY", "INTERMEDIATE", "ADVANCED", "EXPERT"];
const DAY_TYPES = ["PROJECT", "MILESTONE", "FINAL"];
const SKILL_MODES = ["SHARED", "INDIVIDUAL"];
const VISIBILITIES = ["PRIVATE", "UNLISTED", "PUBLIC"];
const STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"];

const daySchema = new mongoose.Schema(
  {
    dayNumber: { type: Number, required: true },
    scheduledDate: { type: Date, required: true },
    title: { type: String, required: true },
    type: { type: String, enum: DAY_TYPES, default: "PROJECT" },
    description: { type: String, required: true },
    objective: { type: String, required: true },
    requirements: { type: [String], default: [] },
    estimatedMinutes: { type: Number, default: 60 },
    isFinal: { type: Boolean, default: false },
  },
  { _id: true }
);

const phaseSchema = new mongoose.Schema(
  {
    order: { type: Number, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    monthLabel: String,
    days: { type: [daySchema], default: [] },
  },
  { _id: true }
);

const scheduleSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["weekdays", "custom", "explicit"], required: true },
    days: [Number],
    dates: [String],
  },
  { _id: false }
);

const settingsSchema = new mongoose.Schema(
  {
    graceHours: { type: Number, default: 48 },
    allowBackfill: { type: Boolean, default: false },
  },
  { _id: false }
);

const challengeSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    inviteCode: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    topic: { type: String, required: true },
    description: { type: String, default: "" },
    difficulty: { type: String, enum: DIFFICULTIES, required: true },
    skillMode: { type: String, enum: SKILL_MODES, default: "SHARED" },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    schedule: { type: scheduleSchema, required: true },
    availableDays: { type: Number, required: true },
    dailyMinutes: { type: Number, default: 60 },
    goal: String,
    monthLabels: { type: Boolean, default: false },
    visibility: { type: String, enum: VISIBILITIES, default: "PRIVATE" },
    status: { type: String, enum: STATUSES, default: "DRAFT" },
    creatorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    phases: { type: [phaseSchema], default: [] },
    settings: { type: settingsSchema, default: () => ({}) },
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

challengeSchema.index({ visibility: 1, status: 1 });

export const Challenge = mongoose.model("Challenge", challengeSchema);