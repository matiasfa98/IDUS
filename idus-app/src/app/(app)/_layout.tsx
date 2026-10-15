// src/app/(app)/_layout.tsx
import { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { Tabs, Redirect } from "expo-router";
import { useColorScheme } from "react-native";
import { useQuery } from "@tanstack/react-query";

import { hasToken } from "@/lib/auth";
import { listConversations } from "@/lib/conversations";
import { qk } from "@/lib/query";

export default function AppLayout() {
  const [status, setStatus] = useState<"checking" | "authed" | "guest">(
    "checking"
  );
  const scheme = useColorScheme();

  useEffect(() => {
    let cancelled = false;
    hasToken().then((ok) => {
      if (!cancelled) setStatus(ok ? "authed" : "guest");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Badge poll — runs at layout level so it survives tab switches.
  const { data: conversations } = useQuery({
    queryKey: qk.conversations(),
    queryFn: listConversations,
    enabled: status === "authed",
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  if (status === "checking") {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (status === "guest") {
    return <Redirect href="/(auth)/sign-in" />;
  }

  const totalUnread =
    conversations?.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0) ?? 0;

  const tint = "#4f46e5";
  const bg = scheme === "dark" ? "#0a0a0a" : "#fff";
  const border = scheme === "dark" ? "#1f1f1f" : "#e5e5e5";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tint,
        tabBarInactiveTintColor: "#888",
        tabBarStyle: { backgroundColor: bg, borderTopColor: border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen
        name="chats"
        options={{
          title: "Chats",
          tabBarBadge: totalUnread > 0 ? totalUnread : undefined,
          tabBarBadgeStyle: { backgroundColor: "#ef4444", color: "#fff" },
        }}
      />
      <Tabs.Screen name="me" options={{ title: "Me" }} />
      <Tabs.Screen name="challenges/[slug]" options={{ href: null }} />
      <Tabs.Screen name="chats/[id]" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});