// scripts/socket-with-mint.mjs
import { io } from "socket.io-client";

const API = "http://127.0.0.1:4000";
const DEV_SECRET = "dev-secret-change-me";
const USER_ID = "user_3Jrtj88IUPEgIrtU6uQw6njXhl4";
const CONVERSATION_ID = process.argv[2];

if (!CONVERSATION_ID) {
  console.error("Usage: node scripts/socket-with-mint.mjs <conversationId>");
  process.exit(1);
}

// Mint a fresh token first.
const mintRes = await fetch(`${API}/dev/token`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-dev-secret": DEV_SECRET,
  },
  body: JSON.stringify({ userId: USER_ID }),
});
const { token } = await mintRes.json();
console.log(`[mint] got token (${token.length} chars)`);

const socket = io(API, {
  path: "/socket.io",
  auth: { token },
  transports: ["websocket"],
});

socket.on("connect", () => {
  console.log(`[socket] connected sid=${socket.id}`);
  socket.emit("join:conversation", { conversationId: CONVERSATION_ID });
  console.log(`[socket] joined ${CONVERSATION_ID}`);
});

socket.on("message:new", (msg) => console.log(`[socket] message:new`, msg));
socket.on("message:edited", (msg) => console.log(`[socket] message:edited`, msg));
socket.on("message:deleted", (d) => console.log(`[socket] message:deleted`, d));
socket.on("connect_error", (err) => console.error(`[socket] connect_error:`, err.message));