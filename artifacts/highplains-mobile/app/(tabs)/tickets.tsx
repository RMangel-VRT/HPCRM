import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { PriorityPill } from "@/components/Pill";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/i18n";
import { apiRequest } from "@/lib/api";

type Ticket = {
  id: string;
  title: string;
  priority?: string | null;
  workType?: string | null;
  currentStatus?: { id: string; name: string; color?: string; isFinal?: boolean } | null;
  customer?: { name: string } | null;
  createdAt?: string;
};

export default function TicketsTab() {
  const colors = useColors();
  const { t } = useT();
  const [q, setQ] = useState("");

  const ticketsQ = useQuery({
    queryKey: ["/api/tickets/my"],
    queryFn: () => apiRequest<Ticket[]>("/api/tickets/my"),
  });

  const filtered = useMemo(() => {
    const all = ticketsQ.data ?? [];
    const term = q.trim().toLowerCase();
    if (!term) return all;
    return all.filter(
      (tk) =>
        tk.title?.toLowerCase().includes(term) ||
        tk.customer?.name?.toLowerCase().includes(term),
    );
  }, [ticketsQ.data, q]);

  if (ticketsQ.isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.searchRow, { borderBottomColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={t("customers.search")}
          placeholderTextColor={colors.mutedForeground}
          style={[styles.search, { color: colors.foreground }]}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        refreshControl={
          <RefreshControl
            refreshing={ticketsQ.isFetching}
            onRefresh={() => ticketsQ.refetch()}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="inbox" size={28} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {t("tickets.empty")}
            </Text>
          </View>
        }
        renderItem={({ item }) => <TicketRow ticket={item} />}
      />
    </View>
  );
}

function TicketRow({ ticket }: { ticket: Ticket }) {
  const colors = useColors();
  const status = ticket.currentStatus;
  const statusColor = status?.color || colors.mutedForeground;
  return (
    <Link href={{ pathname: "/tickets/[id]", params: { id: ticket.id } }} asChild>
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
        ]}
      >
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
            {ticket.title}
          </Text>
          {ticket.customer?.name ? (
            <View style={styles.metaRow}>
              <Feather name="user" size={12} color={colors.mutedForeground} />
              <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
                {ticket.customer.name}
              </Text>
            </View>
          ) : null}
          <View style={{ flexDirection: "row", gap: 6, alignItems: "center", marginTop: 4 }}>
            <PriorityPill priority={ticket.priority} />
            {status?.name ? (
              <View style={[styles.statusPill, { borderColor: statusColor }]}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.statusText, { color: colors.foreground }]}>{status.name}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  search: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", paddingVertical: 4 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  title: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  empty: { alignItems: "center", padding: 40, gap: 10 },
  emptyText: { fontSize: 14, fontFamily: "Inter_500Medium", textAlign: "center" },
});
