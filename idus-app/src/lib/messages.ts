// src/lib/messages.ts
import { ulid } from "ulid";

import { api } from "./api";
import type { Message, MessageAttachment } from "@/types/api";

export interface ListMessagesResponse {
  messages: Message[];
  hasMore: boolean;
}

export async function listMessages(
  conversationId: string,
  opts: { before?: string; limit?: number } = {}
): Promise<ListMessagesResponse> {
  const params = new URLSearchParams();
  if (opts.before) params.set("before", opts.before);
  if (opts.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return api.get<ListMessagesResponse>(
    `/conversations/${conversationId}/messages${qs ? `?${qs}` : ""}`
  );
}

export interface SendMessageInput {
  conversationId: string;
  body: string;
  clientMessageId?: string;
  attachments?: MessageAttachment[];
  replyToId?: string | null;
}

export async function sendMessage(input: SendMessageInput): Promise<Message> {
  const clientMessageId = input.clientMessageId ?? ulid();
  const res = await api.post<{ message: Message; duplicate?: boolean }>(
    `/conversations/${input.conversationId}/messages`,
    {
      clientMessageId,
      body: input.body,
      attachments: input.attachments ?? [],
      replyToId: input.replyToId ?? null,
      localTimestamp: new Date().toISOString(),
    }
  );
  return res.message;
}

// Separate helper so the optimistic path can pre-generate the ID.
export function generateClientMessageId(): string {
  return ulid();
}