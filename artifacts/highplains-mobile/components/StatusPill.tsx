import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useT } from "@/i18n";

export type MobileStopStatus =
  | "not_started"
  | "in_progress"
  | "complete"
  | "skipped"
  | "flagged";

const I18N_KEY: Record<MobileStopStatus, string> = {
  not_started: "today.status.notStarted",
  in_progress: "today.status.inProgress",
  complete: "today.status.complete",
  skipped: "today.status.skipped",
  flagged: "today.status.flagged",
};

export function StatusPill({ status }: { status: MobileStopStatus }) {
  const colors = useColors();
  const { t } = useT();

  let bg = colors.muted;
  let fg = colors.mutedForeground;
  switch (status) {
    case "in_progress":
      bg = colors.primary + "1A";
      fg = colors.primary;
      break;
    case "complete":
      bg = "#dcfce7";
      fg = colors.success;
      break;
    case "skipped":
      bg = "#fef3c7";
      fg = colors.warning;
      break;
    case "flagged":
      bg = "#fee2e2";
      fg = colors.destructive;
      break;
    case "not_started":
    default:
      bg = colors.muted;
      fg = colors.mutedForeground;
      break;
  }

  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg }]}>{t(I18N_KEY[status])}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  text: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.4,
  },
});
