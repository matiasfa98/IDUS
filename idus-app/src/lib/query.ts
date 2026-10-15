// src/lib/query.ts
import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        if (error instanceof ApiError) {
          if (error.status === 401 || error.status === 403) return false;
          if (error.status === 400 || error.status === 404) return false;
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

export const qk = {
  me: () => ["me"] as const,
  meChallenges: () => ["me", "challenges"] as const,
  challenge: (slug: string) => ["challenge", slug] as const,

  conversations: () => ["conversations"] as const,
  conversation: (id: string) => ["conversation", id] as const,
  messages: (conversationId: string) => ["messages", conversationId] as const,
};