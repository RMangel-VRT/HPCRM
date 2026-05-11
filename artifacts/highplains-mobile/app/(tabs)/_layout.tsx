import { Feather } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import React from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useT } from "@/i18n";

export default function TabLayout() {
  const colors = useColors();
  const { t } = useT();
  const router = useRouter();
  const isWeb = Platform.OS === "web";

  const onAddFlag = () => {
    router.push("/flag/new");
  };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { fontFamily: "Inter_700Bold", color: colors.foreground },
        tabBarLabelStyle: { fontFamily: "Inter_500Medium", fontSize: 11 },
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () => (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
        ),
        headerRight: () => (
          <Pressable
            onPress={onAddFlag}
            accessibilityRole="button"
            accessibilityLabel={t("flag.add")}
            style={({ pressed }) => [
              styles.headerBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Feather name="flag" size={14} color={colors.primaryForeground} />
            <View style={{ width: 4 }} />
            <Feather name="plus" size={14} color={colors.primaryForeground} />
          </Pressable>
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

const styles = StyleSheet.create({
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    marginRight: 12,
  },
});
