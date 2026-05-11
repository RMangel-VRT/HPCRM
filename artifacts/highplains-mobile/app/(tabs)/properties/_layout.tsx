import { Stack } from "expo-router";
import React from "react";

import { ScreenHeader } from "@/components/ScreenHeader";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/i18n";

export default function PropertiesStackLayout() {
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
        // screen's title ("Properties") for the back button label on [id].
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerShown: true,
          title: t("tabs.properties"),
          headerRight: () => <ScreenHeader.RightActions />,
        }}
      />
      <Stack.Screen name="[id]" options={{ headerShown: true, title: "Property" }} />
    </Stack>
  );
}
