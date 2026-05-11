import { Feather } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useT } from "@/i18n";

export default function TabLayout() {
  const colors = useColors();
  const { t } = useT();
  const isWeb = Platform.OS === "web";

  // Slice 8: hide the Tabs header — every tab now mounts its own Stack
  // header (set in each per-tab _layout.tsx) so we don't render two stacked
  // header bars on detail screens. The shared sync chip + "+ Flag" button
  // moved to components/ScreenHeader.tsx and is mounted by each Stack's
  // index-screen `headerRight`.
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarLabelStyle: { fontFamily: "Inter_500Medium", fontSize: 11 },
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () => (
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}
          />
        ),
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: t("tabs.today"),
          tabBarIcon: ({ color }) => <Feather name="calendar" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="properties"
        options={{
          title: t("tabs.properties"),
          tabBarIcon: ({ color }) => <Feather name="map-pin" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: t("tabs.me"),
          tabBarIcon: ({ color }) => <Feather name="user" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
