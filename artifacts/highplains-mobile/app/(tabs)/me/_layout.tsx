import { Stack } from "expo-router";
import React from "react";

import { ScreenHeader } from "@/components/ScreenHeader";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/i18n";

export default function MeStackLayout() {
  const colors = useColors();
  const { t } = useT();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
        headerTitleStyle: { fontFamily: "Inter_700Bold", color: colors.foreground },
        // Slice 8: leave headerBackTitle unset so iOS uses the previous
        // screen's title ("Me") for the back button label on child screens.
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerShown: true,
          title: t("tabs.me"),
          headerRight: () => <ScreenHeader.RightActions />,
        }}
      />
      <Stack.Screen name="notifications" />
    </Stack>
  );
}
