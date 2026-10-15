// scripts/test-socket.mjs
import { io } from "socket.io-client";

const API = "http://127.0.0.1:4000";
const TOKEN = process.argv[2];
const CONVERSATION_ID = process.argv[3];

if (!TOKEN || !CONVERSATION_ID) {
  console.error("Usage: node scripts/test-socket.mjs <clerk-token> <conversationId>");
  process.exit(1);
}

const socket = io(API, {
  path: "/socket.io",
  auth: { token: TOKEN },
  transports: ["websocket"],
});

socket.on("connect", () => {
  console.log(`[socket] connected sid=${socket.id}`);
  socket.emit("join:conversation", { conversationId: CONVERSATION_ID });
  console.log(`[socket] joined ${CONVERSATION_ID}`);
});

socket.on("joined:conversations", (d) => {
  console.log(`[socket] joined ${d.count} conversation(s)`);
});

socket.on("message:new", (msg) => {
  console.log(`[socket] message:new`, msg);
});

socket.on("message:edited", (msg) => {
  console.log(`[socket] message:edited`, msg);
});

socket.on("message:deleted", (data) => {
  console.log(`[socket] message:deleted`, data);
});

socket.on("typing:start", (d) => console.log(`[socket] typing:start`, d));
socket.on("typing:stop", (d) => console.log(`[socket] typing:stop`, d));
socket.on("receipt:read", (d) => console.log(`[socket] receipt:read`, d));

socket.on("connect_error", (err) => {
  console.error(`[socket] connect_error:`, err.message);
});

socket.on("error", (err) => console.error(`[socket] error:`, err));