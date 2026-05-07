import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Link, Stack, useLocalSearchParams } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useT } from "@/i18n";
import { apiRequest } from "@/lib/api";

type Customer = {
  id: string;
  name: string;
  customerType?: string | null;
  email?: string | null;
  phone?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  notes?: string | null;
};

type Ticket = {
  id: string;
  title: string;
  priority?: string | null;
  currentStatus?: { name: string; color?: string } | null;
};

export default function CustomerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { t } = useT();

  const customerQ = useQuery({
    queryKey: [`/api/customers/${id}`],
    queryFn: () => apiRequest<Customer>(`/api/customers/${id}`),
    enabled: !!id,
  });
  const ticketsQ = useQuery({
    queryKey: [`/api/customers/${id}/tickets`],
    queryFn: () => apiRequest<Ticket[]>(`/api/customers/${id}/tickets`),
    enabled: !!id,
  });

  if (customerQ.isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const c = customerQ.data;
  if (!c) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground }}>{t("common.error")}</Text>
      </View>
    );
  }

  const address = [c.street, c.city, c.state, c.zip].filter(Boolean).join(", ");
  const tickets = ticketsQ.data ?? [];

  return (
    <>
      <Stack.Screen options={{ title: c.name }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 16, gap: 16 }}
      >
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>{c.name}</Text>
          {c.customerType ? (
            <Text style={[styles.sub, { color: colors.mutedForeground }]}>{c.customerType}</Text>
          ) : null}
        </View>

        {(c.email || c.phone) ? (
          <Section title={t("customer.contact")}>
            {c.phone ? <Row icon="phone" label={c.phone} /> : null}
            {c.email ? <Row icon="mail" label={c.email} /> : null}
          </Section>
        ) : null}

        {address ? (
          <Section title={t("customer.address")}>
            <Row icon="map-pin" label={address} />
          </Section>
        ) : null}

        <Section title={t("customer.tickets")}>
          {tickets.length === 0 ? (
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
              {t("tickets.empty")}
            </Text>
          ) : (
            tickets.slice(0, 20).map((tk) => (
              <Link key={tk.id} href={{ pathname: "/tickets/[id]", params: { id: tk.id } }} asChild>
                <Pressable
                  style={({ pressed }) => [
                    styles.ticketRow,
                    { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.ticketTitle, { color: colors.foreground }]}
                      numberOfLines={1}
                    >
                      {tk.title}
                    </Text>
                    <Text style={[styles.sub, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {tk.currentStatus?.name || "open"}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </Pressable>
              </Link>
            ))
          )}
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
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border, gap: 8 },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

function Row({ icon, label }: { icon: keyof typeof Feather.glyphMap; label: string }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Feather name={icon} size={14} color={colors.primary} />
      <Text style={{ color: colors.foreground, fontFamily: "Inter_400Regular", flex: 1 }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { borderWidth: 1, borderRadius: 12, padding: 14 },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  sub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  ticketRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ticketTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
