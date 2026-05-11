import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";
import { useT } from "@/i18n";
import { useOnline } from "@/lib/network";
import {
  flushNow,
  removeItem,
  retryNow,
  useFailingQueueItems,
  useQueueStatus,
} from "@/lib/upload-queue";

// Slice 8: every tab Stack mounts its own header. The shared right-side
// affordances (sync chip + "+ Flag" button, plus the failed-uploads sheet)
// used to live in the Tabs screenOptions.headerRight, but that rendered a
// duplicate header above each child Stack. Lifting them here lets each tab
// Stack opt into them via `<ScreenHeader.RightActions />` while keeping the
// behaviour identical.
function RightActionsImpl() {
  const colors = useColors();
  const { t } = useT();
  const router = useRouter();
  const queue = useQueueStatus();
  const failingItems = useFailingQueueItems();
  const online = useOnline();
  const [sheetOpen, setSheetOpen] = useState(false);

  const onAddFlag = () => {
    router.push("/flag/new");
  };

  const onPressSync = () => {
    if (queue.failing > 0) {
      setSheetOpen(true);
    } else {
      void flushNow();
    }
  };

  const syncTone =
    queue.failing > 0
      ? { bg: colors.warning, fg: colors.primaryForeground, icon: "alert-triangle" as const, label: String(queue.pending), dot: false }
      : !online
        ? { bg: colors.muted, fg: colors.mutedForeground, icon: "cloud-off" as const, label: queue.pending > 0 ? String(queue.pending) : "", dot: false }
        : queue.pending > 0
          ? { bg: colors.background, fg: colors.foreground, icon: "upload-cloud" as const, label: String(queue.pending), dot: false }
          : { bg: "transparent", fg: colors.success, icon: "check" as const, label: "", dot: true };

  return (
    <>
      <View style={styles.headerRightRow}>
        <Pressable
          onPress={onPressSync}
          accessibilityRole="button"
          accessibilityLabel={
            queue.failing > 0
              ? t("header.queue.failed", { count: queue.failing })
              : !online
                ? t("header.queue.offline")
                : queue.pending > 0
                  ? t("header.queue.pending", { count: queue.pending })
                  : t("header.queue.online")
          }
          style={({ pressed }) => [
            styles.syncChip,
            {
              backgroundColor: syncTone.bg,
              borderColor: queue.failing > 0 ? syncTone.bg : colors.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          {syncTone.dot ? (
            <View style={[styles.onlineDot, { backgroundColor: syncTone.fg }]} />
          ) : (
            <Feather name={syncTone.icon} size={12} color={syncTone.fg} />
          )}
          {syncTone.label ? (
            <Text style={[styles.syncText, { color: syncTone.fg }]}>{syncTone.label}</Text>
          ) : null}
        </Pressable>
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
      </View>

      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetOpen(false)}
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setSheetOpen(false)}
          accessibilityLabel={t("header.queue.close")}
        >
          <Pressable
            onPress={() => undefined}
            style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                {t("header.queue.sheetTitle")}
              </Text>
              <Pressable onPress={() => setSheetOpen(false)} hitSlop={10} accessibilityRole="button">
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>
            {failingItems.length === 0 ? (
              <Text style={[styles.sheetEmpty, { color: colors.mutedForeground }]}>
                {t("header.queue.sheetEmpty")}
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 360 }}>
                {failingItems.map((it) => (
                  <View key={it.id} style={[styles.sheetRow, { borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.sheetRowTitle, { color: colors.foreground }]}>
                        {it.kind === "photo"
                          ? t("header.queue.itemPhoto")
                          : it.kind === "note"
                            ? t("header.queue.itemNote")
                            : it.kind === "json"
                              ? it.op === "ticketComplete"
                                ? t("header.queue.itemTicketComplete")
                                : t("header.queue.itemWorkItem")
                              : t("header.queue.itemFlag")}
                      </Text>
                      <Text style={[styles.sheetRowMeta, { color: colors.mutedForeground }]} numberOfLines={2}>
                        {it.kind === "note"
                          ? it.body
                          : it.kind === "photo"
                            ? it.fileUri.split("/").pop()
                            : it.kind === "json"
                              ? it.path
                              : `${it.tag} (${it.fileUris.length} photo${it.fileUris.length === 1 ? "" : "s"})`}
                      </Text>
                    </View>
                    <View style={styles.sheetRowActions}>
                      <Pressable onPress={() => void retryNow(it.id)} accessibilityRole="button" hitSlop={6}>
                        <Text style={[styles.sheetAction, { color: colors.primary }]}>
                          {t("ticket.photos.retry")}
                        </Text>
                      </Pressable>
                      <Pressable onPress={() => void removeItem(it.id)} accessibilityRole="button" hitSlop={6}>
                        <Text style={[styles.sheetAction, { color: colors.destructive }]}>
                          {t("header.queue.dismiss")}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
            {failingItems.length > 0 ? (
              <Pressable
                onPress={() => void retryNow()}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.retryAllBtn,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Feather name="refresh-cw" size={14} color={colors.primaryForeground} />
                <Text style={[styles.retryAllText, { color: colors.primaryForeground }]}>
                  {t("header.queue.retryAll")}
                </Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export const ScreenHeader = {
  RightActions: RightActionsImpl,
};

const styles = StyleSheet.create({
  headerRightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginRight: 12,
  },
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  syncChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  syncText: { fontFamily: "Inter_700Bold", fontSize: 11 },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    padding: 18,
    paddingBottom: 28,
    gap: 12,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetTitle: { fontFamily: "Inter_700Bold", fontSize: 16 },
  sheetEmpty: { fontFamily: "Inter_400Regular", fontSize: 13, paddingVertical: 12 },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sheetRowTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  sheetRowMeta: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  sheetRowActions: { flexDirection: "row", gap: 14 },
  sheetAction: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  retryAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  retryAllText: { fontFamily: "Inter_700Bold", fontSize: 14 },
});
