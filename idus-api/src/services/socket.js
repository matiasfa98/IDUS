// src/services/socket.js
import { Server } from "socket.io";
import { createClerkClient, verifyToken } from "@clerk/express";
import { config } from "../config.js";
import { User } from "../models/User.js";
import { Conversation } from "../models/Conversation.js";
import {
  addSocket,
  removeSocket,
  isOnline,
  getSocketsForUser,
} from "./presence.js";

const clerk = createClerkClient({
  secretKey: config.clerk.secretKey,
  publishableKey: config.clerk.publishableKey,
});

let io = null;

function roomFor(conversationId) {
  return `conversation:${conversationId}`;
}

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: config.env === "production" ? [config.webUrl] : true,
      credentials: true,
    },
    path: "/socket.io",
  });

  // ── Auth handshake ────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ??
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, "");

      if (!token) {
        return next(new Error("UNAUTHENTICATED"));
      }

      const claims = await verifyToken(token, {
        secretKey: config.clerk.secretKey,
      });

      const clerkId = claims?.sub;
      if (!clerkId) {
        return next(new Error("UNAUTHENTICATED"));
      }

      const user = await User.findOne({ clerkId });
      if (!user) {
        return next(new Error("USER_NOT_FOUND"));
      }

      socket.data.userId = String(user._id);
      socket.data.clerkId = clerkId;

      next();
    } catch (err) {
      console.error("[socket] auth error:", err.message);
      next(new Error("UNAUTHENTICATED"));
    }
  });

  // ── Connection ────────────────────────────────────
  io.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`[socket] connected user=${userId} sid=${socket.id}`);

    // ── Presence ─────────────────────────────────
    addSocket(userId, socket.id);

    socket.broadcast.emit("presence:update", {
      userId,
      online: true,
      at: new Date(),
    });

    // ── Join conversation rooms ──────────────────
    socket.on("join:conversations", async () => {
      try {
        const conversations = await Conversation.find(
          { "participants.userId": userId, "participants.leftAt": null },
          { _id: 1 }
        ).lean();

        for (const c of conversations) {
          socket.join(roomFor(c._id));
        }

        socket.emit("joined:conversations", { count: conversations.length });
      } catch (err) {
        console.error("[socket] join:conversations error:", err);
      }
    });

    socket.on("join:conversation", async ({ conversationId }) => {
      if (!conversationId) return;
      try {
        const allowed = await Conversation.exists({
          _id: conversationId,
          participants: { $elemMatch: { userId, leftAt: null } },
        });
        if (!allowed) {
          return socket.emit("error", { error: "NOT_A_PARTICIPANT" });
        }
        socket.join(roomFor(conversationId));

        const convo = await Conversation.findById(conversationId).lean();
        if (convo) {
          const otherIds = convo.participants
            .filter((p) => !p.leftAt && String(p.userId) !== String(userId))
            .map((p) => String(p.userId));

          const presenceList = otherIds.map((id) => ({
            userId: id,
            online: isOnline(id),
          }));
          socket.emit("presence:snapshot", { presence: presenceList });
        }
      } catch (err) {
        console.error("[socket] join:conversation error:", err);
      }
    });

    // ── Typing ───────────────────────────────────
    socket.on("typing:start", ({ conversationId }) => {
      if (!conversationId) return;
      socket.to(roomFor(conversationId)).emit("typing:start", {
        conversationId,
        userId,
        at: new Date(),
      });
    });

    socket.on("typing:stop", ({ conversationId }) => {
      if (!conversationId) return;
      socket.to(roomFor(conversationId)).emit("typing:stop", {
        conversationId,
        userId,
        at: new Date(),
      });
    });

    // ── Disconnect ───────────────────────────────
    socket.on("disconnect", (reason) => {
      const wentOffline = removeSocket(userId, socket.id);
      console.log(
        `[socket] disconnected user=${userId} sid=${socket.id} reason=${reason}`
      );

      if (wentOffline) {
        io.emit("presence:update", {
          userId,
          online: false,
          at: new Date(),
        });
      }
    });
  });

  return io;
}

// ── Broadcast helpers ─────────────────────────────────

export function emitToConversation(conversationId, event, payload) {
  if (!io) return;
  io.to(roomFor(conversationId)).emit(event, payload);
}

/**
 * Emit an event to every socket belonging to a specific user.
 * Used for direct notifications (contact requests, etc.).
 */
export function emitToUser(userId, event, payload) {
  if (!io) return;
  const sids = getSocketsForUser(userId);
  for (const sid of sids) {
    io.to(sid).emit(event, payload);
  }
}

export function isSocketReady() {
  return !!io;
}