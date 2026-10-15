// src/models/SyncLog.js
import mongoose from "mongoose";

const syncLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    challengeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Challenge",
      default: null,
      index: true,
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      default: null,
      index: true,
    },
    clientActionId: { type: String, required: true },
    actionType: { type: String, required: true },
    status: { type: String, enum: ["ACCEPTED", "REJECTED", "CONFLICT"], required: true },
    reason: String,
    receivedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

syncLogSchema.index({ userId: 1, clientActionId: 1 }, { unique: true });
syncLogSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

export const SyncLog = mongoose.model("SyncLog", syncLogSchema);