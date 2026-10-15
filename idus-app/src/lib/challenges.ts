// src/lib/challenges.ts
import { api } from "./api";
import type {
  ChallengeDetailResponse,
  MeChallengesResponse,
} from "@/types/api";

export async function fetchMeChallenges(): Promise<MeChallengesResponse> {
  return api.get<MeChallengesResponse>("/me/challenges");
}

export async function fetchChallenge(
  slug: string
): Promise<ChallengeDetailResponse> {
  return api.get<ChallengeDetailResponse>(`/challenges/${slug}`);
}