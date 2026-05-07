import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import React from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { PriorityPill } from "@/components/Pill";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/i18n";
import { apiRequest } from "@/lib/api";

type Ticket = {
  id: string;
  title: string;
  description?: string | null;
  notes?: string | null;
  priority?: string | null;
  workType?: string | null;
  customerId?: string | null;
  createdAt?: string;
  dueDate?: string | null;
  currentStatusId?: string | null;
};

export default function TicketDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { t } = useT();
  const q = useQuery({
    queryKey: [`/api/tickets/${id}`],
    queryFn: () => apiRequest<Ticket>(`/api/tickets/${id}`),
    enabled: !!id,
  });

  if (q.isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!q.data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground }}>{t("common.error")}</Text>
      </View>
    );
  }

  const ticket = q.data;
  return (
    <>
      <Stack.Screen options={{ title: ticket.title || "Ticket" }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 16, gap: 16 }}
      >
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>{ticket.title}</Text>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <PriorityPill priority={ticket.priority} />
            {ticket.workType ? (
              <View style={[styles.metaPill, { borderColor: colors.border }]}>
                <Feather name="tool" size={12} color={colors.mutedForeground} />
                <Text style={[styles.metaText, { color: colors.foreground }]}>{ticket.workType}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {ticket.description ? (
          <Section title={t("tickets.description")}>
            <Text style={[styles.body, { color: colors.foreground }]}>{ticket.description}</Text>
          </Section>
        ) : null}

        {ticket.notes ? (
          <Section title={t("tickets.notes")}>
            <Text style={[styles.body, { color: colors.foreground }]}>{ticket.notes}</Text>
          </Section>
        ) : null}

        <Section title="Details">
          <Detail label={t("tickets.created")} value={fmtDate(ticket.createdAt)} />
          {ticket.dueDate ? <Detail label={t("tickets.due")} value={fmtDate(ticket.dueDate)} /> : null}
        </Section>
      </ScrollView>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ gap: 8 }}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title.toUpperCase()}</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {children}
      </View>
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { borderWidth: 1, borderRadius: 12, padding: 14 },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  body: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  detailLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  detailValue: { fontSize: 13, fontFamily: "Inter_500Medium" },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  metaText: { fontSize: 11, fontFamily: "Inter_500Medium" },
});
