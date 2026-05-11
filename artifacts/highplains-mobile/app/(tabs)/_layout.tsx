import { Feather } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useT } from "@/i18n";
import {
  flushNow,
  removeItem,
  retryNow,
  useFailingQueueItems,
  useQueueStatus,
} from "@/lib/upload-queue";

export default function TabLayout() {
  const colors = useColors();
  const { t } = useT();
  const router = useRouter();
  const isWeb = Platform.OS === "web";
  const queue = useQueueStatus();
  const failingItems = useFailingQueueItems();
  const [sheetOpen, setSheetOpen] = useState(false);

  const onAddFlag = () => {
    router.push("/flag/new");
  };

  // Tap on the chip:
  //  - Failing items present → open the failed-uploads sheet so the crew
  //    can retry/dismiss individual items (and a "Retry all" shortcut).
  //  - Pending only → kick the worker to flush immediately.
  const onPressSync = () => {
    if (queue.failing > 0) {
      setSheetOpen(true);
    } else {
      void flushNow();
    }
  };

  const syncTone =
    queue.failing > 0
      ? { bg: colors.destructive, fg: colors.primaryForeground, icon: "alert-triangle" as const }
      : queue.pending > 0
        ? { bg: colors.background, fg: colors.foreground, icon: "upload-cloud" as const }
        : null;

  return (
    <>
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
            <View style={styles.headerRightRow}>
              {syncTone ? (
                <Pressable
                  onPress={onPressSync}
                  accessibilityRole="button"
                  accessibilityLabel={
                    queue.failing > 0
                      ? t("header.queue.failed", { count: queue.failing })
                      : t("header.queue.pending", { count: queue.pending })
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
                  <Feather name={syncTone.icon} size={12} color={syncTone.fg} />
                  <Text style={[styles.syncText, { color: syncTone.fg }]}>
                    {queue.pending}
                  </Text>
                </Pressable>
              ) : null}
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
            style={[
              styles.sheet,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
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
                  <View
                    key={it.id}
                    style={[styles.sheetRow, { borderColor: colors.border }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.sheetRowTitle, { color: colors.foreground }]}>
                        {it.kind === "photo"
                          ? t("header.queue.itemPhoto")
                          : it.kind === "note"
                            ? t("header.queue.itemNote")
                            : t("header.queue.itemFlag")}
                      </Text>
                      <Text style={[styles.sheetRowMeta, { color: colors.mutedForeground }]} numberOfLines={2}>
                        {it.kind === "note"
                          ? it.body
                          : it.kind === "photo"
                            ? it.fileUri.split("/").pop()
                            : `${it.tag} (${it.fileUris.length} photo${it.fileUris.length === 1 ? "" : "s"})`}
                      </Text>
                    </View>
                    <View style={styles.sheetRowActions}>
                      <Pressable
                        onPress={() => void retryNow(it.id)}
                        accessibilityRole="button"
                        hitSlop={6}
                      >
                        <Text style={[styles.sheetAction, { color: colors.primary }]}>
                          {t("ticket.photos.retry")}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void removeItem(it.id)}
                        accessibilityRole="button"
                        hitSlop={6}
                      >
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
