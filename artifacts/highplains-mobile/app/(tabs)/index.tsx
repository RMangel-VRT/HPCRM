import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import React from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { Logo } from "@/components/Logo";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/i18n";
import { apiRequest } from "@/lib/api";

type TicketSummary = {
  id: string;
  title: string;
  priority?: string | null;
  currentStatus?: { id: string; name: string; color?: string; isFinal?: boolean } | null;
  customer?: { name: string } | null;
};

type CampaignSummary = {
  id: string;
  title: string;
  status: string;
  windowStart?: string;
  windowEnd?: string;
  totalItems?: number;
  completedItems?: number;
};

export default function HomeScreen() {
  const colors = useColors();
  const { user, signOut } = useAuth();
  const { t } = useT();

  const ticketsQ = useQuery({
    queryKey: ["/api/tickets/my"],
    queryFn: () => apiRequest<TicketSummary[]>("/api/tickets/my"),
  });
  const campaignsQ = useQuery({
    queryKey: ["/api/campaigns"],
    queryFn: () => apiRequest<CampaignSummary[]>("/api/campaigns"),
  });

  const tickets = ticketsQ.data ?? [];
  const campaigns = campaignsQ.data ?? [];

  const isFinal = (s?: string | null) => {
    const n = (s || "").toLowerCase();
    return n === "completed" || n === "closed" || n === "done";
  };

  const active = tickets.filter((t) => !isFinal(t.currentStatus?.name));
  const urgent = active.filter((t) => t.priority === "urgent" || t.priority === "high");
  const completed = tickets.filter((t) => isFinal(t.currentStatus?.name));
  const activeCampaigns = campaigns.filter((c) => c.status === "active");

  const refreshing = ticketsQ.isFetching || campaignsQ.isFetching;
  const onRefresh = () => {
    ticketsQ.refetch();
    campaignsQ.refetch();
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, gap: 16 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      <View style={styles.greetRow}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
          <Logo size={44} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.hello, { color: colors.mutedForeground }]}>
              {t("home.greeting")}
            </Text>
            <Text style={[styles.userName, { color: colors.foreground }]} numberOfLines={1}>
              {user?.name || "—"}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={signOut}
          style={({ pressed }) => [
            styles.signOutBtn,
            { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Feather name="log-out" size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <View style={styles.statRow}>
        <Stat label={t("home.activeTickets")} value={active.length} icon="clipboard" />
        <Stat label={t("home.urgent")} value={urgent.length} icon="alert-triangle" tone="danger" />
        <Stat label={t("home.completed")} value={completed.length} icon="check-circle" tone="success" />
      </View>

      <Section title={t("home.myTickets")} icon="clipboard">
        {active.length === 0 ? (
          <EmptyText>{t("home.empty")}</EmptyText>
        ) : (
          active.slice(0, 6).map((tk) => (
            <Link key={tk.id} href={{ pathname: "/tickets/[id]", params: { id: tk.id } }} asChild>
              <Pressable
                style={({ pressed }) => [
                  styles.row,
                  { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {tk.title}
                  </Text>
                  <Text style={[styles.rowSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {tk.customer?.name || "—"} · {tk.currentStatus?.name || "open"}
                  </Text>
                </View>
                {tk.priority === "urgent" || tk.priority === "high" ? (
                  <View style={[styles.dot, { backgroundColor: colors.destructive }]} />
                ) : null}
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </Pressable>
            </Link>
          ))
        )}
      </Section>

      {activeCampaigns.length > 0 ? (
        <Section title={t("home.activeCampaigns")} icon="flag">
          {activeCampaigns.slice(0, 4).map((c) => {
            const total = c.totalItems ?? 0;
            const done = c.completedItems ?? 0;
            const pct = total ? Math.round((done / total) * 100) : 0;
            return (
              <Link key={c.id} href={{ pathname: "/campaigns/[id]", params: { id: c.id } }} asChild>
                <Pressable
                  style={({ pressed }) => [
                    styles.row,
                    { borderColor: colors.border, opacity: pressed ? 0.7 : 1, flexDirection: "column", alignItems: "stretch" },
                  ]}
                >
                  <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {c.title}
                  </Text>
                  <View style={[styles.progressTrack, { backgroundColor: colors.muted, marginTop: 8 }]}>
                    <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
                  </View>
                  <Text style={[styles.rowSub, { color: colors.mutedForeground, marginTop: 6 }]}>
                    {done} / {total} · {pct}%
                  </Text>
                </Pressable>
              </Link>
            );
          })}
        </Section>
      ) : null}
    </ScrollView>
  );
}

function Stat({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: number;
  icon: keyof typeof Feather.glyphMap;
  tone?: "neutral" | "danger" | "success";
}) {
  const colors = useColors();
  const accent =
    tone === "danger" ? colors.destructive : tone === "success" ? colors.success : colors.primary;
  return (
    <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Feather name={icon} size={18} color={accent} />
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: keyof typeof Feather.glyphMap;
  children: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Feather name={icon} size={16} color={colors.primary} />
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      </View>
      <View style={{ gap: 8 }}>{children}</View>
    </View>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.empty, { borderColor: colors.border }]}>
      <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  greetRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  hello: { fontSize: 12, fontFamily: "Inter_500Medium" },
  userName: { fontSize: 18, fontFamily: "Inter_700Bold" },
  signOutBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  statRow: { flexDirection: "row", gap: 8 },
  stat: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  statValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_700Bold", letterSpacing: 0.3, textTransform: "uppercase" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  rowTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  progressTrack: { height: 6, borderRadius: 999, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999 },
  empty: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
  },
});
