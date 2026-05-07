import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "#b91c1c",
  high: "#c2410c",
  normal: "#374151",
  low: "#6b7363",
};

export function Pill({
  label,
  tone = "neutral",
  color,
}: {
  label: string;
  tone?: "neutral" | "primary" | "success" | "warning" | "danger";
  color?: string;
}) {
  const colors = useColors();
  let bg = colors.muted;
  let fg = colors.mutedForeground;
  if (color) {
    bg = color + "22";
    fg = color;
  } else if (tone === "primary") {
    bg = colors.primary + "1A";
    fg = colors.primary;
  } else if (tone === "success") {
    bg = "#dcfce7";
    fg = "#15803d";
  } else if (tone === "warning") {
    bg = "#fef3c7";
    fg = "#b45309";
  } else if (tone === "danger") {
    bg = "#fee2e2";
    fg = "#b91c1c";
  }
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function PriorityPill({ priority }: { priority?: string | null }) {
  const p = (priority || "normal").toLowerCase();
  return <Pill label={p.toUpperCase()} color={PRIORITY_COLOR[p] || PRIORITY_COLOR.normal} />;
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 11,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
});
