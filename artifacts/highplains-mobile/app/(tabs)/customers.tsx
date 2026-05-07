import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import React, { useState } from "react";
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

import { useColors } from "@/hooks/useColors";
import { useT } from "@/i18n";
import { apiRequest } from "@/lib/api";

type Customer = {
  id: string;
  name: string;
  city?: string | null;
  state?: string | null;
  customerType?: string | null;
};

type Page = { customers: Customer[]; total: number };

export default function CustomersTab() {
  const colors = useColors();
  const { t } = useT();
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["/api/customers", search],
    queryFn: () => {
      const qs = new URLSearchParams({ page: "1", limit: "100" });
      if (search.trim()) qs.set("search", search.trim());
      return apiRequest<Page>(`/api/customers?${qs.toString()}`);
    },
  });

  const customers = q.data?.customers ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.searchRow, { borderBottomColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t("customers.search")}
          placeholderTextColor={colors.mutedForeground}
          style={[styles.search, { color: colors.foreground }]}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>
      {q.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          refreshControl={
            <RefreshControl
              refreshing={q.isFetching}
              onRefresh={() => q.refetch()}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="users" size={28} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {t("customers.empty")}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Link href={{ pathname: "/customers/[id]", params: { id: item.id } }} asChild>
              <Pressable
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
                ]}
              >
                <View style={[styles.avatar, { backgroundColor: colors.primary + "1A" }]}>
                  <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold" }}>
                    {(item.name || "?").trim().charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.sub, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {[item.city, item.state].filter(Boolean).join(", ") || item.customerType || ""}
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </Pressable>
            </Link>
          )}
        />
      )}
    </View>
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  sub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  empty: { alignItems: "center", padding: 40, gap: 10 },
  emptyText: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
