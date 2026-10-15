// src/models/ContactRequest.js
import mongoose from "mongoose";

const STATUSES = ["PENDING", "ACCEPTED", "DECLINED", "CANCELLED"];

const contactRequestSchema = new mongoose.Schema(
  {
    fromUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    toUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: { type: String, enum: STATUSES, default: "PENDING", index: true },
    message: { type: String, maxlength: 300, default: null },
    respondedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Only one PENDING request per (from, to) pair.
contactRequestSchema.index(
  { fromUserId: 1, toUserId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "PENDING" },
  }
);

export const ContactRequest = mongoose.model(
  "ContactRequest",
  contactRequestSchema
);
export const CONTACT_REQUEST_STATUSES = STATUSES;