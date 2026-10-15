// src/lib/auth.ts
//
// F1 auth: dev-token flow.
// Mints a Clerk session token via the backend's /dev/token endpoint
// (guarded by NODE_ENV on the backend — never mounted in production).
//
// F1.5 will replace this entire file with Clerk's useAuth().getToken().
// Nothing outside this file should know where tokens come from.

import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "idus.devToken";
const SESSION_KEY = "idus.devSessionId";

// Clerk on the free tier issues ~57s tokens. Refresh when <15s remain.
const REFRESH_THRESHOLD_SECONDS = 15;

interface CachedToken {
  token: string;
  expiresAt: number; // unix seconds
  sessionId: string;
}

let memory: CachedToken | null = null;

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

async function readFromStore(): Promise<CachedToken | null> {
  try {
    const raw = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedToken;
    if (!parsed.token || !parsed.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeToStore(cached: CachedToken) {
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(cached));
    await SecureStore.setItemAsync(SESSION_KEY, cached.sessionId);
  } catch {
    // SecureStore failures are non-fatal — memory cache still works for this session.
  }
}

async function clearStore() {
  memory = null;
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(SESSION_KEY);
  } catch {
    // ignore
  }
}

async function mintDevToken(): Promise<CachedToken> {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  const devSecret = process.env.EXPO_PUBLIC_DEV_TOKEN_SECRET;
  const userId = process.env.EXPO_PUBLIC_DEV_CLERK_USER_ID;

  if (!apiUrl) throw new Error("EXPO_PUBLIC_API_URL not set");
  if (!devSecret) throw new Error("EXPO_PUBLIC_DEV_TOKEN_SECRET not set");
  if (!userId) throw new Error("EXPO_PUBLIC_DEV_CLERK_USER_ID not set");

  const res = await fetch(`${apiUrl}/dev/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-dev-secret": devSecret,
    },
    body: JSON.stringify({ userId }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`dev/token failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    token: string;
    sessionId: string;
    expiresIn: number;
    expiresAt: number;
  };

  return {
    token: json.token,
    sessionId: json.sessionId,
    expiresAt: json.expiresAt ?? nowSeconds() + json.expiresIn,
  };
}

/**
 * Returns a valid token, minting a fresh one if needed.
 * Safe to call on every request — hits the memory cache first.
 */
export async function getToken(): Promise<string> {
  if (memory && memory.expiresAt - nowSeconds() > REFRESH_THRESHOLD_SECONDS) {
    return memory.token;
  }

  if (!memory) {
    memory = await readFromStore();
  }

  if (memory && memory.expiresAt - nowSeconds() > REFRESH_THRESHOLD_SECONDS) {
    return memory.token;
  }

  // Mint fresh.
  const fresh = await mintDevToken();
  memory = fresh;
  await writeToStore(fresh);
  return fresh.token;
}

export async function signInDev(): Promise<void> {
  const fresh = await mintDevToken();
  memory = fresh;
  await writeToStore(fresh);
}

export async function signOut(): Promise<void> {
  await clearStore();
}

export async function hasToken(): Promise<boolean> {
  if (memory && memory.expiresAt - nowSeconds() > 0) return true;
  const stored = await readFromStore();
  return !!stored && stored.expiresAt - nowSeconds() > 0;
}