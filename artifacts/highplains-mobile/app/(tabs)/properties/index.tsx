import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useT } from "@/i18n";
import { apiRequest } from "@/lib/api";

type PropertySummary = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  customerType: "commercial" | "hoa" | null;
  ranking: "standard" | "preferred" | "key_account" | null;
};

type RecentEntry = PropertySummary & { viewedAt: string | null };

type PropertiesResponse = {
  recent: RecentEntry[];
  results: PropertySummary[];
};

type ListSection = { title: string; key: string; sticky?: boolean; data: PropertySummary[] };

const PROPERTIES_KEY = (q: string) => ["m-properties", q] as const;

export default function PropertiesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useT();
  const queryClient = useQueryClient();

  // Two-tier search state: `search` is the live input value (re-renders on
  // every keystroke), `debouncedSearch` drives the network query. 250ms keeps
  // the UI snappy without thrashing the API.
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  // Re-fetch on focus so a returning supervisor sees newly-viewed entries.
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["m-properties"] });
    }, [queryClient]),
  );

  const query = useQuery<PropertiesResponse>({
    queryKey: PROPERTIES_KEY(debouncedSearch),
    queryFn: () => {
      const qs = new URLSearchParams();
      if (debouncedSearch) qs.set("q", debouncedSearch);
      qs.set("limit", "100");
      return apiRequest<PropertiesResponse>(`/api/m/properties?${qs.toString()}`);
    },
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  });

  // Group results into A/B/C… buckets so the list reads like a phone book.
  // Property names that don't start with a letter fall under "#".
  const sections = useMemo<ListSection[]>(() => {
    const out: ListSection[] = [];
    const recent = query.data?.recent ?? [];
    const results = query.data?.results ?? [];
    if (!debouncedSearch && recent.length > 0) {
      out.push({ title: t("properties.recent"), key: "recent", data: recent });
    }
    const buckets = new Map<string, PropertySummary[]>();
    for (const r of results) {
      const ch = (r.name?.[0] ?? "").toUpperCase();
      const letter = /[A-Z]/.test(ch) ? ch : "#";
      if (!buckets.has(letter)) buckets.set(letter, []);
      buckets.get(letter)!.push(r);
    }
    const letters = [...buckets.keys()].sort((a, b) => {
      if (a === "#") return 1;
      if (b === "#") return -1;
      return a.localeCompare(b);
    });
    for (const l of letters) {
      out.push({ title: l, key: `letter-${l}`, sticky: true, data: buckets.get(l)! });
    }
    return out;
  }, [query.data, debouncedSearch, t]);

  const onPress = useCallback(
    (id: string) => {
      router.push(`/(tabs)/properties/${id}`);
    },
    [router],
  );

  const renderItem = ({ item }: { item: PropertySummary }) => (
    <Pressable
      onPress={() => onPress(item.id)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.muted : colors.card, borderColor: colors.border },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>
          {item.name}
        </Text>
        {item.address ? (
          <Text style={[styles.rowSub, { color: colors.mutedForeground }]} numberOfLines={1}>
            {item.address}
          </Text>
        ) : null}
      </View>
      {item.ranking === "key_account" ? (
        <View style={[styles.tag, { backgroundColor: colors.primary + "1A" }]}>
          <Text style={[styles.tagText, { color: colors.primary }]}>★</Text>
        </View>
      ) : null}
      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
    </Pressable>
  );

  const renderSectionHeader = ({ section }: { section: ListSection }) => (
    <View
      style={[
        section.sticky ? styles.letterHeader : styles.sectionHeader,
        { backgroundColor: colors.background, borderBottomColor: colors.border },
      ]}
    >
      <Text
        style={[
          section.sticky ? styles.letterHeaderText : styles.sectionHeaderText,
          { color: section.sticky ? colors.foreground : colors.mutedForeground },
        ]}
      >
        {section.sticky ? section.title : section.title.toUpperCase()}
      </Text>
    </View>
  );

  // Search bar lives OUTSIDE the SectionList so it stays pinned to the top
  // even when the list scrolls. Letter section headers stick within the list.
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.searchWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} style={{ marginRight: 8 }} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t("properties.searchPlaceholder")}
          placeholderTextColor={colors.mutedForeground}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={[styles.searchInput, { color: colors.foreground }]}
        />
        {search.length > 0 ? (
          <Pressable onPress={() => setSearch("")} hitSlop={10} style={{ marginLeft: 6 }}>
            <Feather name="x-circle" size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      {query.isLoading ? (
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <SectionList
          style={{ backgroundColor: colors.background }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          sections={sections}
          keyExtractor={(item, idx) => `${item.id}-${idx}`}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching && !query.isLoading}
              onRefresh={() => query.refetch()}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {t("properties.empty.title")}
              </Text>
              <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                {t("properties.empty.body")}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "transparent",
  },
  sectionHeader: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6 },
  sectionHeaderText: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 0.5 },
  letterHeader: {
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  letterHeaderText: { fontFamily: "Inter_700Bold", fontSize: 13 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  rowTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  rowSub: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 2 },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  tagText: { fontFamily: "Inter_700Bold", fontSize: 11 },
  empty: { margin: 20, padding: 20, borderWidth: 1, borderRadius: 16, gap: 8 },
  emptyTitle: { fontFamily: "Inter_600SemiBold", fontSize: 17 },
  emptyBody: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20 },
});
