// src/app/(auth)/sign-in.tsx
import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { router } from "expo-router";

import { signInDev } from "@/lib/auth";

export default function SignInScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setBusy(true);
    setError(null);
    try {
      await signInDev();
      router.replace("/(app)");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Idus</Text>
      <Text style={styles.subtitle}>Build a skill, one day at a time.</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={handleSignIn}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Continue (dev)</Text>
        )}
      </Pressable>

      <Text style={styles.note}>
        Dev sign-in. Real Clerk auth lands in F1.5.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#0a0a0a",
  },
  title: {
    fontSize: 42,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#888",
    marginBottom: 48,
  },
  error: {
    color: "#ff6b6b",
    marginBottom: 16,
    textAlign: "center",
    paddingHorizontal: 16,
  },
  button: {
    backgroundColor: "#4f46e5",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 200,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  note: {
    marginTop: 24,
    fontSize: 12,
    color: "#555",
    textAlign: "center",
  },
});