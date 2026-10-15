// src/app/(app)/index.tsx
// Home: your challenges (created + joined).
// Data source: GET /me/challenges (single call, summary shapes).

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
import { fetchMeChallenges } from "@/lib/challenges";
import { qk } from "@/lib/query";
import type {
  ChallengeSummary,
  JoinedChallengeEntry,
} from "@/types/api";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: qk.meChallenges(),
    queryFn: fetchMeChallenges,
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
        <Text style={styles.errorTitle}>Couldn't load your challenges</Text>
        <Text style={styles.errorBody}>
          {error instanceof Error ? error.message : "Unknown error"}
        </Text>
        <Pressable style={styles.retry} onPress={() => refetch()}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const created = data?.created ?? [];
  const joined = data?.joined ?? [];

  const rows: Row[] = [
    ...(created.length > 0
      ? [{ kind: "header" as const, label: "Created" }]
      : []),
    ...created.map((c) => ({ kind: "created" as const, challenge: c })),
    ...(joined.length > 0
      ? [{ kind: "header" as const, label: "Joined" }]
      : []),
    ...joined.map((j) => ({ kind: "joined" as const, entry: j })),
  ];

  if (rows.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>No challenges yet</Text>
        <Text style={styles.emptyBody}>
          Create a challenge or join one via invite code.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(item, idx) =>
        item.kind === "header"
          ? `h-${item.label}-${idx}`
          : item.kind === "created"
            ? `c-${item.challenge.id}`
            : `j-${item.entry.challenge.id}`
      }
      contentContainerStyle={[
                            styles.list,
                            { paddingTop: insets.top + 16 },
                            ]}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
      }
      renderItem={({ item }) => {
        if (item.kind === "header") {
          return <Text style={styles.sectionHeader}>{item.label}</Text>;
        }
        const c =
          item.kind === "created" ? item.challenge : item.entry.challenge;
        const streak =
          item.kind === "joined" ? item.entry.participant.streak.current : null;

        return (
          <Pressable
            style={styles.card}
            onPress={() => router.push(`/(app)/challenges/${c.slug}`)}
          >
            <Text style={styles.cardTitle}>{c.title}</Text>
            <Text style={styles.cardMeta}>
              {c.topic} · {c.difficulty} · {c.availableDays}d
            </Text>
            <View style={styles.cardFooter}>
              <Text style={styles.badge}>{c.status}</Text>
              {streak !== null ? (
                <Text style={styles.streak}>🔥 {streak}</Text>
              ) : null}
            </View>
          </Pressable>
        );
      }}
    />
  );
}

type Row =
  | { kind: "header"; label: string }
  | { kind: "created"; challenge: ChallengeSummary }
  | { kind: "joined"; entry: JoinedChallengeEntry };

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  list: { padding: 16, paddingBottom: 40 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "600",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 8,
  },
  card: {
    backgroundColor: "#141414",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#1f1f1f",
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
  },
  cardMeta: { fontSize: 13, color: "#888" },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    alignItems: "center",
  },
  badge: {
    fontSize: 11,
    color: "#a5b4fc",
    backgroundColor: "#1e1b4b",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: "hidden",
  },
  streak: { fontSize: 13, color: "#fbbf24" },
  errorTitle: {
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 6,
    color: "#fff",
  },
  errorBody: {
    fontSize: 14,
    color: "#888",
    marginBottom: 20,
    textAlign: "center",
  },
  retry: {
    backgroundColor: "#4f46e5",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: "#fff", fontWeight: "600" },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
    color: "#fff",
  },
  emptyBody: { fontSize: 14, color: "#888", textAlign: "center" },
});