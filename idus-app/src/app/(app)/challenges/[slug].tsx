// src/app/(app)/challenges/[slug].tsx
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { fetchChallenge } from "@/lib/challenges";
import { listConversations } from "@/lib/conversations";
import { qk } from "@/lib/query";

export default function ChallengeDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: qk.challenge(slug),
    queryFn: () => fetchChallenge(slug),
    enabled: !!slug,
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
        <Text style={styles.errorTitle}>Couldn't load challenge</Text>
        <Text style={styles.errorBody}>
          {error instanceof Error ? error.message : "Unknown error"}
        </Text>
      </View>
    );
  }

  if (!data) return null;

  const { challenge, participantCount, isCreator, isParticipant } = data;

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>{challenge.title}</Text>
      <Text style={styles.meta}>
        {challenge.topic} · {challenge.difficulty} · {challenge.availableDays}{" "}
        days · {challenge.dailyMinutes}m/day
      </Text>

      <View style={styles.tagRow}>
        <Text style={styles.tag}>{challenge.status}</Text>
        {isCreator ? <Text style={styles.tag}>Creator</Text> : null}
        {isParticipant && !isCreator ? (
          <Text style={styles.tag}>Joined</Text>
        ) : null}
      </View>

      {challenge.description ? (
        <Text style={styles.description}>{challenge.description}</Text>
      ) : null}

      <Text style={styles.section}>
        {participantCount} participant{participantCount === 1 ? "" : "s"}
      </Text>

      <ChatButton challengeId={challenge.id} />

      {challenge.phases.length === 0 ? (
        <Text style={styles.empty}>
          No phases yet. Generate the progression to see the daily plan.
        </Text>
      ) : (
        challenge.phases.map((phase) => (
          <View key={phase._id} style={styles.phase}>
            <Text style={styles.phaseTitle}>{phase.title}</Text>
            <Text style={styles.phaseDesc}>{phase.description}</Text>
            {phase.days.map((day) => (
              <View key={day._id} style={styles.day}>
                <Text style={styles.dayNum}>Day {day.dayNumber}</Text>
                <Text style={styles.dayTitle}>{day.title}</Text>
                <Text style={styles.dayType}>{day.type}</Text>
              </View>
            ))}
          </View>
        ))
      )}
    </ScrollView>
  );
}

function ChatButton({ challengeId }: { challengeId: string }) {
  const { data: conversations } = useQuery({
    queryKey: qk.conversations(),
    queryFn: listConversations,
  });

  const convo = conversations?.find(
    (c) => c.type === "challenge" && c.challengeId === challengeId
  );

  if (!convo) return null;

  return (
    <Pressable
      style={styles.chatBtn}
      onPress={() => router.push(`/(app)/chats/${convo.id}`)}
    >
      <Text style={styles.chatBtnText}>Open challenge chat →</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  scroll: { padding: 20, paddingBottom: 60 },
  title: { fontSize: 26, fontWeight: "700", color: "#fff", marginBottom: 6 },
  meta: { fontSize: 14, color: "#888", marginBottom: 12 },
  tagRow: { flexDirection: "row", gap: 6, marginBottom: 20, flexWrap: "wrap" },
  tag: {
    fontSize: 11,
    color: "#a5b4fc",
    backgroundColor: "#1e1b4b",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: "hidden",
  },
  description: {
    fontSize: 15,
    color: "#ccc",
    lineHeight: 22,
    marginBottom: 24,
  },
  section: {
    fontSize: 13,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  chatBtn: {
    backgroundColor: "#1e1b4b",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 24,
  },
  chatBtnText: { color: "#a5b4fc", fontWeight: "600", fontSize: 15 },
  empty: { fontSize: 14, color: "#666", fontStyle: "italic" },
  phase: { marginBottom: 24 },
  phaseTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
  },
  phaseDesc: { fontSize: 13, color: "#888", marginBottom: 12 },
  day: {
    backgroundColor: "#141414",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#1f1f1f",
  },
  dayNum: { fontSize: 11, color: "#888", marginBottom: 2 },
  dayTitle: { fontSize: 15, color: "#fff", fontWeight: "500" },
  dayType: {
    fontSize: 10,
    color: "#a5a5a5",
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  errorTitle: { fontSize: 17, fontWeight: "600", color: "#fff", marginBottom: 6 },
  errorBody: { fontSize: 14, color: "#888", textAlign: "center" },
});