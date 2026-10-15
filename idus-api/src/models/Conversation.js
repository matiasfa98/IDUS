// src/models/Conversation.js
import mongoose from "mongoose";

const CONVERSATION_TYPES = ["challenge", "dm", "group"];
const PARTICIPANT_ROLES = ["MEMBER", "ADMIN"];

const participantSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: { type: String, enum: PARTICIPANT_ROLES, default: "MEMBER" },
    joinedAt: { type: Date, default: Date.now },
    leftAt: { type: Date, default: null },
    mutedUntil: { type: Date, default: null },
    // High-water-mark — everything up to and including this message is "read".
    lastReadMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    lastReadAt: { type: Date, default: null },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: CONVERSATION_TYPES, required: true, index: true },

    // Present only when type === "challenge".
    challengeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Challenge",
      default: null,
    },

    // Group-only fields (ignored for dm and challenge).
    title: { type: String, default: null },
    avatarUrl: { type: String, default: null },

    participants: { type: [participantSchema], default: [] },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Denormalized for fast list rendering — bumped on every message.
    lastMessageAt: { type: Date, default: null, index: true },
    lastMessagePreview: { type: String, default: null },
    lastMessageSenderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // For DMs only — deterministic key so we never create duplicate DMs.
    // Format: "<userIdA>_<userIdB>" with ids sorted lexically.
    dmKey: { type: String, default: null, unique: true, sparse: true },

    messageCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

conversationSchema.index({ "participants.userId": 1, lastMessageAt: -1 });
conversationSchema.index({ challengeId: 1 }, { unique: true, sparse: true });

export const Conversation = mongoose.model("Conversation", conversationSchema);
export const CONVERSATION_TYPES_ENUM = CONVERSATION_TYPES;