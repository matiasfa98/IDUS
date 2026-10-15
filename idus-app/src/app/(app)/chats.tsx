// src/app/(app)/chats.tsx
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { listConversations } from "@/lib/conversations";
import { qk } from "@/lib/query";
import { genreAccent } from "@/lib/genreColors";
import { useSessionUserId } from "@/lib/session";
import type { Conversation } from "@/types/api";

export default function ChatsScreen() {
  const myId = useSessionUserId();
const insets = useSafeAreaInsets();
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: qk.conversations(),
    queryFn: listConversations,
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Couldn't load chats</Text>
        <Text style={styles.errorBody}>
          {error instanceof Error ? error.message : "Unknown error"}
        </Text>
        <Pressable style={styles.retry} onPress={() => refetch()}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const conversations = data ?? [];

  if (conversations.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>No chats yet</Text>
        <Text style={styles.emptyBody}>
          Join a challenge to open its conversation.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={conversations}
      keyExtractor={(c) => c.id}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
      }
      renderItem={({ item }) => (
        <ConversationRow
          conversation={item}
          myId={myId}
          onPress={() => router.push(`/(app)/chats/${item.id}`)}
        />
      )}
    />
  );
}

function ConversationRow({
  conversation,
  myId,
  onPress,
}: {
  conversation: Conversation;
  myId: string | null;
  onPress: () => void;
}) {
  // Challenge conversations have no title set — derive from type.
  const displayName =
    conversation.title ??
    (conversation.type === "challenge"
      ? "Challenge chat"
      : conversation.type === "dm"
        ? "Direct message"
        : "Group");

  const accent = genreAccent(null); // conversation-level; per-sender in thread
  const unread = conversation.unreadCount ?? 0;

  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={[styles.avatar, { borderColor: accent }]}>
        <Text style={styles.avatarText}>{displayName.slice(0, 1)}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={styles.rowPreview} numberOfLines={1}>
          {conversation.lastMessagePreview ?? "No messages yet"}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowTime}>
          {formatRelative(conversation.lastMessageAt)}
        </Text>
        {unread > 0 ? (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>{unread > 99 ? "99+" : unread}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  list: { paddingVertical: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    backgroundColor: "#1a1a1a",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { fontSize: 18, fontWeight: "600", color: "#fff" },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: "600", color: "#fff", marginBottom: 2 },
  rowPreview: { fontSize: 13, color: "#888" },
  rowRight: { alignItems: "flex-end", gap: 4 },
  rowTime: { fontSize: 11, color: "#666" },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: "#4f46e5",
    justifyContent: "center",
    alignItems: "center",
  },
  unreadText: { fontSize: 11, fontWeight: "700", color: "#fff" },
  errorTitle: { fontSize: 17, fontWeight: "600", color: "#fff", marginBottom: 6 },
  errorBody: { fontSize: 14, color: "#888", textAlign: "center", marginBottom: 20 },
  retry: {
    backgroundColor: "#4f46e5",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: "#fff", fontWeight: "600" },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: "#fff", marginBottom: 8 },
  emptyBody: { fontSize: 14, color: "#888", textAlign: "center" },
});