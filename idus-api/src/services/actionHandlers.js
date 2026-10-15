// src/services/actionHandlers.js
import mongoose from "mongoose";

import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";
import { Challenge } from "../models/Challenge.js";
import { Participant } from "../models/Participant.js";
import { Progress } from "../models/Progress.js";
import { User } from "../models/User.js";
import { SyncLog } from "../models/SyncLog.js";
import { computeStreak } from "../utils/streak.js";
import { emitToConversation } from "./socket.js";

// ── Helpers shared with HTTP routes ─────────────────────

function previewFromBody(body, attachments) {
  if (body && body.trim().length > 0) {
    return body.length > 80 ? body.slice(0, 80) + "…" : body;
  }
  if (attachments && attachments.length > 0) {
    const kinds = new Set(attachments.map((a) => a.kind));
    if (kinds.has("image")) return "📷 Image";
    if (kinds.has("audio")) return "🎵 Audio";
    return "📎 File";
  }
  return "";
}

function serializeMessage(m) {
  return {
    id: String(m._id),
    conversationId: String(m.conversationId),
    senderId: String(m.senderId),
    clientMessageId: m.clientMessageId,
    body: m.body,
    attachments: m.attachments ?? [],
    replyToId: m.replyToId ? String(m.replyToId) : null,
    reactions: m.reactions ?? {},
    editedAt: m.editedAt,
    deletedAt: m.deletedAt,
    localTimestamp: m.localTimestamp,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

function isLate(day, completedAt, graceHours) {
  const scheduled = new Date(day.scheduledDate).getTime();
  const completed = new Date(completedAt).getTime();
  const graceMs = graceHours * 60 * 60 * 1000;
  return completed > scheduled + graceMs;
}

function findDay(challenge, dayId) {
  for (const phase of challenge.phases ?? []) {
    for (const day of phase.days ?? []) {
      if (String(day._id) === String(dayId)) {
        return { day, phase };
      }
    }
  }
  return null;
}

// ── MESSAGE_SEND ─────────────────────────────────────────

async function handleMessageSend(userId, payload) {
  const {
    conversationId,
    clientMessageId,
    body,
    attachments,
    replyToId,
    localTimestamp,
  } = payload;

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    return { status: "REJECTED", reason: "INVALID_CONVERSATION_ID" };
  }

  const convo = await Conversation.findById(conversationId);
  if (!convo) {
    return { status: "REJECTED", reason: "CONVERSATION_NOT_FOUND" };
  }

  const isParticipant = convo.participants.some(
    (p) => String(p.userId) === String(userId) && !p.leftAt
  );
  if (!isParticipant) {
    return { status: "REJECTED", reason: "NOT_A_PARTICIPANT" };
  }

  // Idempotency: same sender + clientMessageId
  const existing = await Message.findOne({
    senderId: userId,
    clientMessageId,
  });
  if (existing) {
    return {
      status: "DUPLICATE",
      result: { message: serializeMessage(existing) },
    };
  }

  const now = new Date();
  const localTs = localTimestamp ? new Date(localTimestamp) : now;

  const msg = await Message.create({
    conversationId,
    senderId: userId,
    clientMessageId,
    body: body ?? "",
    attachments: attachments ?? [],
    replyToId: replyToId ?? null,
    localTimestamp: localTs,
  });

  convo.lastMessageAt = msg.createdAt;
  convo.lastMessagePreview = previewFromBody(msg.body, msg.attachments);
  convo.lastMessageSenderId = msg.senderId;
  convo.messageCount = (convo.messageCount ?? 0) + 1;
  await convo.save();

  const payloadOut = serializeMessage(msg);
  emitToConversation(String(conversationId), "message:new", payloadOut);

  return { status: "ACCEPTED", result: { message: payloadOut } };
}

// ── MESSAGE_EDIT ─────────────────────────────────────────

async function handleMessageEdit(userId, payload) {
  const { conversationId, messageId, body } = payload;

  if (
    !mongoose.Types.ObjectId.isValid(conversationId) ||
    !mongoose.Types.ObjectId.isValid(messageId)
  ) {
    return { status: "REJECTED", reason: "INVALID_ID" };
  }

  const msg = await Message.findOne({ _id: messageId, conversationId });
  if (!msg) return { status: "REJECTED", reason: "MESSAGE_NOT_FOUND" };
  if (String(msg.senderId) !== String(userId)) {
    return { status: "REJECTED", reason: "CANNOT_EDIT_OTHERS" };
  }
  if (msg.deletedAt) return { status: "REJECTED", reason: "MESSAGE_DELETED" };

  msg.body = body;
  msg.editedAt = new Date();
  await msg.save();

  const out = serializeMessage(msg);
  emitToConversation(String(conversationId), "message:edited", out);
  return { status: "ACCEPTED", result: { message: out } };
}

// ── MESSAGE_DELETE ───────────────────────────────────────

async function handleMessageDelete(userId, payload) {
  const { conversationId, messageId } = payload;

  if (
    !mongoose.Types.ObjectId.isValid(conversationId) ||
    !mongoose.Types.ObjectId.isValid(messageId)
  ) {
    return { status: "REJECTED", reason: "INVALID_ID" };
  }

  const msg = await Message.findOne({ _id: messageId, conversationId });
  if (!msg) return { status: "REJECTED", reason: "MESSAGE_NOT_FOUND" };
  if (String(msg.senderId) !== String(userId)) {
    return { status: "REJECTED", reason: "CANNOT_DELETE_OTHERS" };
  }

  msg.deletedAt = new Date();
  msg.body = "";
  msg.attachments = [];
  await msg.save();

  emitToConversation(String(conversationId), "message:deleted", {
    conversationId: String(conversationId),
    messageId: String(msg._id),
  });

  return { status: "ACCEPTED", result: { ok: true } };
}

// ── READ_RECEIPT ─────────────────────────────────────────

async function handleReadReceipt(userId, payload) {
  const { conversationId, messageId } = payload;

  if (
    !mongoose.Types.ObjectId.isValid(conversationId) ||
    !mongoose.Types.ObjectId.isValid(messageId)
  ) {
    return { status: "REJECTED", reason: "INVALID_ID" };
  }

  const convo = await Conversation.findById(conversationId);
  if (!convo) return { status: "REJECTED", reason: "CONVERSATION_NOT_FOUND" };

  const p = convo.participants.find(
    (x) => String(x.userId) === String(userId) && !x.leftAt
  );
  if (!p) return { status: "REJECTED", reason: "NOT_A_PARTICIPANT" };

  p.lastReadMessageId = messageId;
  p.lastReadAt = new Date();
  await convo.save();

  emitToConversation(String(conversationId), "receipt:read", {
    conversationId: String(conversationId),
    userId: String(userId),
    lastReadMessageId: String(messageId),
    lastReadAt: p.lastReadAt,
  });

  return {
    status: "ACCEPTED",
    result: {
      lastReadMessageId: String(messageId),
      lastReadAt: p.lastReadAt,
    },
  };
}

// ── DAY_COMPLETE ─────────────────────────────────────────

async function handleDayComplete(userId, payload) {
  const { challengeSlug, dayId, completedAt, note, artifactUrl } = payload;

  const challenge = await Challenge.findOne({ slug: challengeSlug });
  if (!challenge) return { status: "REJECTED", reason: "CHALLENGE_NOT_FOUND" };

  const participant = await Participant.findOne({
    challengeId: challenge._id,
    userId,
  });
  if (!participant) return { status: "REJECTED", reason: "NOT_A_PARTICIPANT" };

  const found = findDay(challenge, dayId);
  if (!found) return { status: "REJECTED", reason: "DAY_NOT_FOUND" };

  const ts = completedAt ? new Date(completedAt) : new Date();
  const late = isLate(found.day, ts, challenge.settings?.graceHours ?? 48);

  const progress = await Progress.findOneAndUpdate(
    {
      challengeId: challenge._id,
      userId,
      dayId: found.day._id,
    },
    {
      $set: {
        dayNumber: found.day.dayNumber,
        status: "COMPLETED",
        completedAt: ts,
        localTimestamp: ts,
        late,
        note: note ?? null,
        artifactUrl: artifactUrl ?? null,
        syncedAt: new Date(),
      },
      $setOnInsert: {
        challengeId: challenge._id,
        userId,
        dayId: found.day._id,
      },
    },
    { new: true, upsert: true }
  );

  const completions = await Progress.find({
    challengeId: challenge._id,
    userId,
    status: "COMPLETED",
  })
    .select("completedAt")
    .lean();

  const nextStreak = computeStreak(completions, participant.streak);
  participant.streak = nextStreak;
  participant.stats = {
    completed: completions.length,
    missed: Math.max(0, challenge.availableDays - completions.length),
  };
  participant.lastSyncedAt = new Date();
  await participant.save();

  return {
    status: "ACCEPTED",
    result: {
      progress: {
        id: String(progress._id),
        dayId: String(progress.dayId),
        dayNumber: progress.dayNumber,
        status: progress.status,
        completedAt: progress.completedAt,
        late: progress.late,
      },
      streak: participant.streak,
      stats: participant.stats,
    },
  };
}

// ── Dispatcher ───────────────────────────────────────────

const HANDLERS = {
  MESSAGE_SEND: handleMessageSend,
  MESSAGE_EDIT: handleMessageEdit,
  MESSAGE_DELETE: handleMessageDelete,
  READ_RECEIPT: handleReadReceipt,
  DAY_COMPLETE: handleDayComplete,
};

export const SUPPORTED_ACTIONS = Object.keys(HANDLERS);

export async function dispatchAction(userId, action) {
  const { type, payload } = action;

  if (!type || typeof type !== "string") {
    return { status: "REJECTED", reason: "MISSING_TYPE" };
  }

  const handler = HANDLERS[type];
  if (!handler) {
    return { status: "REJECTED", reason: `UNSUPPORTED_TYPE: ${type}` };
  }

  try {
    return await handler(userId, payload ?? {});
  } catch (err) {
    console.error(`[sync] handler error for ${type}:`, err);
    return { status: "REJECTED", reason: err.message ?? "HANDLER_ERROR" };
  }
}