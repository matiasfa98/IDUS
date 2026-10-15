// src/app/(app)/me/index.tsx
// Minimal profile. Reads /me (SelfUser). F6 makes this an editor.

import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";

import { api } from "@/lib/api";
import { qk } from "@/lib/query";
import { signOut } from "@/lib/auth";
import type { SelfUser } from "@/types/api";

async function fetchMe(): Promise<SelfUser> {
  const res = await api.get<{ user: SelfUser }>("/me");
  return res.user;
}

export default function MeScreen() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: qk.me(),
    queryFn: fetchMe,
  });

  async function handleSignOut() {
    await signOut();
    router.replace("/(auth)/sign-in");
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Couldn't load profile</Text>
        <Text style={styles.errorBody}>
          {error instanceof Error ? error.message : "Unknown error"}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.name}>
        {data.fullName ?? data.username ?? "Unnamed"}
      </Text>
      <Text style={styles.handle}>
        @{data.username ?? "—"} · #{data.permanentId}
      </Text>

      {data.metaphor.displayName ? (
        <Text style={styles.metaphor}>"{data.metaphor.displayName}"</Text>
      ) : null}

      {data.motto ? <Text style={styles.motto}>{data.motto}</Text> : null}

      <View style={styles.genreRow}>
        <Text style={styles.genre}>{data.metaphor.genre}</Text>
        <Text style={styles.genre}>{data.metaphor.archetype}</Text>
        <Text style={styles.genre}>{data.metaphor.vibe}</Text>
      </View>

      <Pressable style={styles.signOut} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  container: { flex: 1, padding: 24, paddingTop: 60 },
  name: { fontSize: 28, fontWeight: "700", color: "#fff", marginBottom: 4 },
  handle: { fontSize: 14, color: "#888", marginBottom: 20 },
  metaphor: {
    fontSize: 16,
    color: "#a5b4fc",
    fontStyle: "italic",
    marginBottom: 8,
  },
  motto: { fontSize: 15, color: "#ccc", marginBottom: 20 },
  genreRow: { flexDirection: "row", gap: 6, marginBottom: 40, flexWrap: "wrap" },
  genre: {
    fontSize: 12,
    color: "#a5a5a5",
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: "hidden",
  },
  signOut: {
    backgroundColor: "#2a1a1a",
    borderColor: "#5a1a1a",
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  signOutText: { color: "#ff6b6b", fontWeight: "600" },
  errorTitle: { fontSize: 17, fontWeight: "600", color: "#fff", marginBottom: 6 },
  errorBody: { fontSize: 14, color: "#888", textAlign: "center" },
});