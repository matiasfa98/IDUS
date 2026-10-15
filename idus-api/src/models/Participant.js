import mongoose from "mongoose";

const participantSchema = new mongoose.Schema(
  {
    challengeId: { type: mongoose.Schema.Types.ObjectId, ref: "Challenge", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["MEMBER", "MODERATOR"], default: "MEMBER" },
    joinedAt: { type: Date, default: Date.now },
    lastSyncedAt: Date,
    streak: {
      current: { type: Number, default: 0 },
      longest: { type: Number, default: 0 },
      lastCompletedDate: Date,
    },
    stats: {
      completed: { type: Number, default: 0 },
      missed: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

participantSchema.index({ challengeId: 1, userId: 1 }, { unique: true });
participantSchema.index({ userId: 1 });

export const Participant = mongoose.model("Participant", participantSchema);