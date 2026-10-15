// src/services/presence.js
//
// In-memory presence store. Single-process only.
// When you scale to multiple API instances, swap this for Redis
// (a SET per user with instance IDs + TTL heartbeats).

const userSockets = new Map(); // userId -> Set<socketId>
const lastSeen = new Map();    // userId -> Date

const ONLINE_GRACE_MS = 3000;  // treat user as online if within this window

export function addSocket(userId, socketId) {
  const id = String(userId);
  if (!userSockets.has(id)) userSockets.set(id, new Set());
  userSockets.get(id).add(socketId);
  lastSeen.set(id, new Date());
}

export function removeSocket(userId, socketId) {
  const id = String(userId);
  const set = userSockets.get(id);
  if (!set) return false;

  set.delete(socketId);
  lastSeen.set(id, new Date());

  if (set.size === 0) {
    userSockets.delete(id);
    return true; // user just went fully offline
  }
  return false; // user still has another socket
}

export function isOnline(userId) {
  const id = String(userId);
  const set = userSockets.get(id);
  if (!set || set.size === 0) return false;
  return true;
}

export function getPresence(userId) {
  const id = String(userId);
  return {
    userId: id,
    online: isOnline(id),
    lastSeen: lastSeen.get(id) ?? null,
  };
}

export function getPresenceBatch(userIds) {
  return userIds.map((id) => getPresence(id));
}

export function getOnlineUserIds() {
  return Array.from(userSockets.keys());
}
export function getSocketsForUser(userId) {
  const set = userSockets.get(String(userId));
  return set ? Array.from(set) : [];
}