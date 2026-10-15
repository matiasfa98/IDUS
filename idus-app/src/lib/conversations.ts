// src/lib/conversations.ts
import { api } from "./api";
import type { Conversation } from "@/types/api";

export async function listConversations(): Promise<Conversation[]> {
  const res = await api.get<{ conversations: Conversation[] }>("/conversations");
  return res.conversations;
}

export async function getConversation(id: string): Promise<Conversation> {
  const res = await api.get<{ conversation: Conversation }>(
    `/conversations/${id}`
  );
  return res.conversation;
}

export async function markConversationRead(
  conversationId: string,
  messageId: string
): Promise<void> {
  await api.post(`/conversations/${conversationId}/read`, { messageId });
}