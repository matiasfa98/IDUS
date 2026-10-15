// src/app/(app)/chats/[id].tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
  Keyboard,
} from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  getConversation,
  markConversationRead,
} from "@/lib/conversations";
import {
  listMessages,
  sendMessage,
  generateClientMessageId,
} from "@/lib/messages";
import { qk } from "@/lib/query";
import { genreAccent } from "@/lib/genreColors";
import { useSessionUserId } from "@/lib/session";
import type { Message, User } from "@/types/api";

export default function ChatThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const myId = useSessionUserId();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  // Set a proper header title if we can.
  useEffect(() => {
    navigation.setOptions?.({ title: "Chat" });
  }, [navigation]);

  const { data: conversation } = useQuery({
    queryKey: qk.conversation(id),
    queryFn: () => getConversation(id),
    enabled: !!id,
    staleTime: 60_000,
  });

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: qk.messages(id),
    queryFn: () => listMessages(id, { limit: 50 }),
    enabled: !!id,
    refetchInterval: 5_000,
  });

  const [olderPages, setOlderPages] = useState<Message[][]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const allMessages = useMemo(() => {
    const pages = [...olderPages].reverse();
    const combined = pages.flat().concat(data?.messages ?? []);
    const seen = new Set<string>();
    const out: Message[] = [];
    for (const m of combined) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
    return out.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [olderPages, data]);

  const newestId = allMessages.length
    ? allMessages[allMessages.length - 1].id
    : null;
  const lastReceiptedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!id || !newestId) return;
    if (lastReceiptedRef.current === newestId) return;
    lastReceiptedRef.current = newestId;
    markConversationRead(id, newestId).catch(() => {});
  }, [id, newestId]);

  async function handleLoadOlder() {
    if (loadingOlder || !allMessages.length) return;
    setLoadingOlder(true);
    try {
      const oldest = allMessages[0];
      const page = await listMessages(id, { before: oldest.id, limit: 50 });
      setOlderPages((prev) => [...prev, page.messages]);
    } catch {
      // silent
    } finally {
      setLoadingOlder(false);
    }
  }

  const [draft, setDraft] = useState("");
  const listRef = useRef<FlatList<Message>>(null);

  const participantMap = useMemo(() => {
    const map = new Map<string, User>();
    for (const p of conversation?.participants ?? []) {
      map.set(p.userId, p.user);
    }
    return map;
  }, [conversation]);

  const sendMutation = useMutation({
    mutationFn: async (input: { clientMessageId: string; body: string }) => {
      return sendMessage({
        conversationId: id,
        body: input.body,
        clientMessageId: input.clientMessageId,
      });
    },
    onSuccess: (serverMessage, variables) => {
      qc.setQueryData<{ messages: Message[]; hasMore: boolean }>(
        qk.messages(id),
        (old) => {
          if (!old) return old;
          const filtered = old.messages.filter(
            (m) => m.clientMessageId !== variables.clientMessageId
          );
          if (filtered.some((m) => m.id === serverMessage.id)) {
            return { ...old, messages: filtered };
          }
          return { ...old, messages: [...filtered, serverMessage] };
        }
      );
      qc.invalidateQueries({ queryKey: qk.conversations() });
    },
    onError: (_err, variables) => {
      qc.setQueryData<{ messages: Message[]; hasMore: boolean }>(
        qk.messages(id),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            messages: old.messages.map((m) =>
              m.clientMessageId === variables.clientMessageId
                ? { ...m, editedAt: "FAILED" }
                : m
            ),
          };
        }
      );
    },
  });

  const myUser = myId ? participantMap.get(myId) : undefined;

  function handleSend() {
    const body = draft.trim();
    if (!body || !myId) return;

    const clientMessageId = generateClientMessageId();
    const now = new Date().toISOString();

    const optimistic: Message = {
      id: `optimistic-${clientMessageId}`,
      conversationId: id,
      senderId: myId,
      clientMessageId,
      body,
      attachments: [],
      replyToId: null,
      reactions: {},
      editedAt: null,
      deletedAt: null,
      localTimestamp: now,
      createdAt: now,
      updatedAt: now,
      sender: myUser ?? null,
    };

    qc.setQueryData<{ messages: Message[]; hasMore: boolean }>(
      qk.messages(id),
      (old) => {
        if (!old) return { messages: [optimistic], hasMore: false };
        return { ...old, messages: [...old.messages, optimistic] };
      }
    );

    setDraft("");
    sendMutation.mutate({ clientMessageId, body });

    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }

  const renderItem = useCallback(
    ({ item }: { item: Message }) => {
      const mine = item.senderId === myId;
      const senderUser =
        item.sender ?? participantMap.get(item.senderId) ?? null;
      const genre = senderUser?.metaphor?.genre;
      const accent = genreAccent(genre);
      const failed = item.editedAt === "FAILED";

      return (
        <View
          style={[
            styles.bubbleRow,
            mine ? styles.bubbleRowMine : styles.bubbleRowTheirs,
          ]}
        >
          <View
            style={[
              styles.bubble,
              mine ? styles.bubbleMine : styles.bubbleTheirs,
              { borderColor: failed ? "#ef4444" : accent },
            ]}
          >
            {!mine && senderUser ? (
              <Text style={styles.senderName}>
                {senderUser.metaphor?.displayName ??
                  senderUser.fullName ??
                  senderUser.username ??
                  "Unknown"}
              </Text>
            ) : null}
            <Text style={styles.body}>{item.body}</Text>
            <Text style={styles.timestamp}>{formatTime(item.createdAt)}</Text>
            {failed ? (
              <Text style={styles.failedHint}>Not sent</Text>
            ) : null}
          </View>
        </View>
      );
    },
    [myId, participantMap]
  );

  if (isLoading) {
    return (
      <View
        style={[
          styles.center,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <ActivityIndicator />
      </View>
    );
  }

  if (isError) {
    return (
      <View
        style={[
          styles.center,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <Text style={styles.errorTitle}>Couldn't load messages</Text>
        <Text style={styles.errorBody}>
          {error instanceof Error ? error.message : "Unknown error"}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <FlatList
        ref={listRef}
        data={allMessages}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        onRefresh={refetch}
        refreshing={isRefetching}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          listRef.current?.scrollToEnd({ animated: false });
        }}
        ListHeaderComponent={
          data?.hasMore || olderPages.length > 0 ? (
            <Pressable
              style={styles.loadOlder}
              onPress={handleLoadOlder}
              disabled={loadingOlder}
            >
              {loadingOlder ? (
                <ActivityIndicator size="small" />
              ) : (
                <Text style={styles.loadOlderText}>Load older messages</Text>
              )}
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyThread}>
            <Text style={styles.emptyThreadText}>
              No messages yet. Say something.
            </Text>
          </View>
        }
      />

      <View
        style={[
          styles.composer,
          { paddingBottom: Math.max(insets.bottom, 8) },
        ]}
      >
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Message"
          placeholderTextColor="#666"
          multiline
          maxLength={4000}
        />
        <Pressable
          style={[styles.sendBtn, !draft.trim() && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!draft.trim()}
        >
          <Text style={styles.sendBtnText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#0a0a0a",
  },
  list: { padding: 12, gap: 6 },
  bubbleRow: { flexDirection: "row" },
  bubbleRowMine: { justifyContent: "flex-end" },
  bubbleRowTheirs: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "78%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: "#141414",
  },
  bubbleMine: { backgroundColor: "#1a1a2e" },
  bubbleTheirs: { backgroundColor: "#141414" },
  senderName: {
    fontSize: 11,
    fontWeight: "600",
    color: "#a5b4fc",
    marginBottom: 3,
  },
  body: { fontSize: 15, color: "#fff", lineHeight: 20 },
  timestamp: {
    fontSize: 10,
    color: "#666",
    marginTop: 3,
    alignSelf: "flex-end",
  },
  failedHint: { fontSize: 10, color: "#ef4444", marginTop: 3 },
  loadOlder: {
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 8,
  },
  loadOlderText: { fontSize: 13, color: "#a5b4fc" },
  emptyThread: { alignItems: "center", paddingTop: 60 },
  emptyThreadText: { fontSize: 14, color: "#666", fontStyle: "italic" },
  composer: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingTop: 8,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#1f1f1f",
    backgroundColor: "#0a0a0a",
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#1a1a1a",
    color: "#fff",
    fontSize: 15,
  },
  sendBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#4f46e5",
    marginBottom: 2,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  errorTitle: { fontSize: 17, fontWeight: "600", color: "#fff", marginBottom: 6 },
  errorBody: { fontSize: 14, color: "#888", textAlign: "center" },
});