// src/lib/session.ts
import { useQuery } from "@tanstack/react-query";
import { qk } from "./query";
import { api } from "./api";
import type { SelfUser } from "@/types/api";

async function fetchMe(): Promise<SelfUser> {
  const res = await api.get<{ user: SelfUser }>("/me");
  return res.user;
}

export function useSessionUserId(): string | null {
  const { data } = useQuery({
    queryKey: qk.me(),
    queryFn: fetchMe,
    staleTime: 5 * 60_000,
  });
  return data?.id ?? null;
}