import mongoose from "mongoose";

const progressSchema = new mongoose.Schema(
  {
    challengeId: { type: mongoose.Schema.Types.ObjectId, ref: "Challenge", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    dayId: { type: mongoose.Schema.Types.ObjectId, required: true },
    dayNumber: { type: Number, required: true },
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "MISSED", "LOCKED"],
      default: "PENDING",
    },
    late: { type: Boolean, default: false },
    completedAt: Date,
    localTimestamp: Date,
    note: String,
    artifactUrl: String,
    artifactHash: String,
    syncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

progressSchema.index({ challengeId: 1, userId: 1, dayId: 1 }, { unique: true });
progressSchema.index({ challengeId: 1, dayId: 1 });
progressSchema.index({ userId: 1 });

export const Progress = mongoose.model("Progress", progressSchema);