import { Feather } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";

import { useColors } from "@/hooks/useColors";
import { useT } from "@/i18n";

export default function TabLayout() {
  const colors = useColors();
  const { t } = useT();

  // Slice 8: hide the Tabs header — every tab now mounts its own Stack
  // header (set in each per-tab _layout.tsx) so we don't render two stacked
  // header bars on detail screens. The shared sync chip + "+ Flag" button
  // moved to components/ScreenHeader.tsx and is mounted by each Stack's
  // index-screen `headerRight`.
  //
  // Round 2 fix: removed the custom `tabBarBackground` overlay (it was
  // intercepting touches on Properties/Me even with `pointerEvents="none"`
  // on the inner View — the wrapper RN inserts around tabBarBackground
  // still sat above the buttons on web). `tabBarStyle.backgroundColor`
  // already paints the tab bar, so the overlay was redundant. Also
  // dropped the web-only `height: 84` which on narrower preview widths
  // pushed the buttons under the safe area / outside the hit region.
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
        },
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
