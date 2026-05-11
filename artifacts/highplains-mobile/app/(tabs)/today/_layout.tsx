import { Stack } from "expo-router";
import React from "react";

import { ScreenHeader } from "@/components/ScreenHeader";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/i18n";

export default function TodayStackLayout() {
  const colors = useColors();
  const { t } = useT();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
        headerTitleStyle: { fontFamily: "Inter_700Bold", color: colors.foreground },
        // Slice 8: do NOT set headerBackTitle here — leaving it unset lets
        // iOS automatically use the previous screen's title for the back
        // button label ("Today" on tickets/[id], "Properties" on
        // properties/[id]).
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerShown: true,
          title: t("tabs.today"),
          headerRight: () => <ScreenHeader.RightActions />,
        }}
      />
      <Stack.Screen name="tickets/[id]" options={{ headerShown: true, title: "Ticket" }} />
    </Stack>
  );
}
