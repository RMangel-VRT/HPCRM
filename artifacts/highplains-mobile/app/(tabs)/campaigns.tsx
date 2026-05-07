import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Pill } from "@/components/Pill";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/i18n";
import { apiRequest } from "@/lib/api";

type Campaign = {
  id: string;
  title: string;
  status: string;
  category?: string;
  windowStart?: string;
  windowEnd?: string;
  totalItems?: number;
  completedItems?: number;
};

export default function CampaignsTab() {
  const colors = useColors();
  const { t } = useT();

  const q = useQuery({
    queryKey: ["/api/campaigns"],
    queryFn: () => apiRequest<Campaign[]>("/api/campaigns"),
  });

  if (q.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const data = (q.data ?? []).slice().sort((a, b) => {
    const order = { active: 0, planned: 1, completed: 2 } as Record<string, number>;
    return (order[a.status] ?? 9) - (order[b.status] ?? 9);
  });

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      data={data}
      keyExtractor={(c) => c.id}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      refreshControl={
        <RefreshControl
          refreshing={q.isFetching}
          onRefresh={() => q.refetch()}
          tintColor={colors.primary}
        />
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Feather name="flag" size={28} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {t("campaigns.empty")}
          </Text>
        </View>
      }
      renderItem={({ item }) => <CampaignCard campaign={item} />}
    />
  );
}

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const colors = useColors();
  const total = campaign.totalItems ?? 0;
  const done = campaign.completedItems ?? 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const statusTone =
    campaign.status === "active" ? "primary" : campaign.status === "completed" ? "success" : "neutral";
  return (
    <Link href={{ pathname: "/campaigns/[id]", params: { id: campaign.id } }} asChild>
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
        ]}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <Text style={[styles.title, { color: colors.foreground, flex: 1 }]} numberOfLines={2}>
            {campaign.title}
          </Text>
          <Pill label={campaign.status.toUpperCase()} tone={statusTone as any} />
        </View>
        {campaign.windowStart && campaign.windowEnd ? (
          <View style={[styles.metaRow, { marginTop: 6 }]}>
            <Feather name="calendar" size={12} color={colors.mutedForeground} />
            <Text style={[styles.meta, { color: colors.mutedForeground }]}>
              {fmtDate(campaign.windowStart)} – {fmtDate(campaign.windowEnd)}
            </Text>
          </View>
        ) : null}
        <View style={[styles.progressTrack, { backgroundColor: colors.muted, marginTop: 10 }]}>
          <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
        </View>
        <Text style={[styles.meta, { color: colors.mutedForeground, marginTop: 6 }]}>
          {done} / {total} · {pct}%
        </Text>
      </Pressable>
    </Link>
  );
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { borderWidth: 1, borderRadius: 12, padding: 14 },
  title: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  progressTrack: { height: 6, borderRadius: 999, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999 },
  empty: { alignItems: "center", padding: 40, gap: 10 },
  emptyText: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
