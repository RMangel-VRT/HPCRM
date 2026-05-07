import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import React from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { Pill } from "@/components/Pill";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/i18n";
import { apiRequest } from "@/lib/api";

type Campaign = {
  id: string;
  title: string;
  status: string;
  description?: string | null;
  category?: string;
  windowStart?: string;
  windowEnd?: string;
  items?: Array<{
    id: string;
    customerName: string;
    customerCity?: string | null;
    status: string;
    notes?: string | null;
  }>;
  totalItems?: number;
  completedItems?: number;
};

export default function CampaignDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { t } = useT();
  const q = useQuery({
    queryKey: [`/api/campaigns/${id}`],
    queryFn: () => apiRequest<Campaign>(`/api/campaigns/${id}`),
    enabled: !!id,
  });

  if (q.isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const c = q.data;
  if (!c) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground }}>{t("common.error")}</Text>
      </View>
    );
  }

  const items = c.items ?? [];
  const total = items.length || c.totalItems || 0;
  const done = items.filter((i) => i.status === "completed").length || c.completedItems || 0;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <>
      <Stack.Screen options={{ title: c.title }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 16, gap: 16 }}
      >
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Pill label={c.status.toUpperCase()} tone={c.status === "active" ? "primary" : "neutral"} />
            {c.category ? <Pill label={c.category.toUpperCase()} /> : null}
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>{c.title}</Text>
          {c.description ? (
            <Text style={[styles.body, { color: colors.mutedForeground, marginTop: 6 }]}>
              {c.description}
            </Text>
          ) : null}

          {c.windowStart && c.windowEnd ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
              <Feather name="calendar" size={12} color={colors.mutedForeground} />
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 12 }}>
                {fmtDate(c.windowStart)} – {fmtDate(c.windowEnd)}
              </Text>
            </View>
          ) : null}

          <Text style={{ marginTop: 14, fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>
            {t("campaigns.progress")}
          </Text>
          <View style={[styles.progressTrack, { backgroundColor: colors.muted, marginTop: 6 }]}>
            <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
          </View>
          <Text style={{ marginTop: 6, fontSize: 12, color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>
            {done} / {total} · {pct}%
          </Text>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
            {t("campaigns.items").toUpperCase()}
          </Text>
          {items.length === 0 ? (
            <Text style={{ color: colors.mutedForeground }}>—</Text>
          ) : (
            items.map((it) => (
              <View
                key={it.id}
                style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={1}>
                    {it.customerName}
                  </Text>
                  {it.customerCity ? (
                    <Text style={[styles.itemSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {it.customerCity}
                    </Text>
                  ) : null}
                </View>
                <Pill
                  label={it.status === "completed" ? t("campaigns.itemCompleted") : t("campaigns.itemPending")}
                  tone={it.status === "completed" ? "success" : "neutral"}
                />
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </>
  );
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { borderWidth: 1, borderRadius: 12, padding: 14 },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  body: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  itemName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  itemSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  progressTrack: { height: 6, borderRadius: 999, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999 },
});
