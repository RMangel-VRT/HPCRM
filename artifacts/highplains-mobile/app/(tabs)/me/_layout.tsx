import { Stack } from "expo-router";
import React from "react";

import { useColors } from "@/hooks/useColors";

export default function MeStackLayout() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="notifications" />
    </Stack>
  );
}
