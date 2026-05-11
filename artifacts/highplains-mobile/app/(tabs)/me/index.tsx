import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/i18n";
import { apiRequest } from "@/lib/api";

const ROLE_LABELS: Record<string, string> = {
  crew_supervisor: "Crew Supervisor",
  field_manager: "Field Manager",
  landscape_supervisor: "Landscape Supervisor",
  admin: "Admin",
  office: "Office",
  field: "Field",
  chemical_manager: "Chemical Manager",
  irrigation_manager: "Irrigation Manager",
  shop_manager: "Shop Manager",
  mapping: "Mapping",
};

type WeekDay = { date: string; total: number; complete: number; flagged: number };
type WeekResponse = {
  startDate: string;
  endDate: string;
  crewId: string | null;
  days: WeekDay[];
};

type RecentItem = {
  id: string;
  title: string;
  completedAt: string | null;
  customerName: string | null;
};
type RecentResponse = { items: RecentItem[] };

type MeResponse = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  language?: "en" | "es";
  activeRole: string;
  crewId: string | null;
  crewName: string | null;
  notificationPrefs: {
    newTicketAssignment: boolean;
    ticketReassignment: boolean;
    flagResponse: boolean;
  };
  pushDeviceCount: number;
};

const ME_KEY = ["m-me"] as const;
const WEEK_KEY = ["m-me-week"] as const;
const RECENT_KEY = ["m-me-recent"] as const;

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayYmd(): string {
  return ymd(new Date());
}
function shortDay(date: string, lang: "en" | "es"): { weekday: string; dayNum: string } {
  const [y, m, d] = date.split("-").map((p) => Number.parseInt(p, 10));
  const local = new Date(y, (m ?? 1) - 1, d ?? 1);
  return {
    weekday: local.toLocaleDateString(lang === "es" ? "es" : "en", { weekday: "short" }),
    dayNum: String(local.getDate()),
  };
}
function formatRelative(iso: string | null, lang: "en" | "es"): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(lang === "es" ? "es" : "en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function MeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { user, signOut, signingIn } = useAuth();
  const { t, lang, setLang } = useT();

  const meQuery = useQuery<MeResponse>({
    queryKey: ME_KEY,
    queryFn: () => apiRequest<MeResponse>("/api/m/me"),
    staleTime: 30_000,
  });

  const weekQuery = useQuery<WeekResponse>({
    queryKey: WEEK_KEY,
    queryFn: () => apiRequest<WeekResponse>("/api/m/me/week"),
    staleTime: 30_000,
  });

  const recentQuery = useQuery<RecentResponse>({
    queryKey: RECENT_KEY,
    queryFn: () => apiRequest<RecentResponse>("/api/m/me/recent-completions?limit=10"),
    staleTime: 30_000,
  });

  useFocusEffect(
    useCallback(() => {
      qc.invalidateQueries({ queryKey: ME_KEY });
      qc.invalidateQueries({ queryKey: WEEK_KEY });
      qc.invalidateQueries({ queryKey: RECENT_KEY });
    }, [qc]),
  );

  // Push registration lives in AuthContext (post-sign-in + warm-launch),
  // so this screen just renders state.

  const [loggingOut, setLoggingOut] = useState(false);
  const onLogout = () => {
    Alert.alert(
      t("me.signOut.title"),
      t("me.signOut.body"),
      [
        { text: t("me.signOut.cancel"), style: "cancel" },
        {
          text: t("me.signOut.confirm"),
          style: "destructive",
          onPress: async () => {
            setLoggingOut(true);
            try {
              await signOut();
            } finally {
              setLoggingOut(false);
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  const refreshing =
    (meQuery.isFetching && !meQuery.isLoading) ||
    (weekQuery.isFetching && !weekQuery.isLoading);

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24, paddingTop: insets.top + 8 }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            qc.invalidateQueries({ queryKey: ME_KEY });
            qc.invalidateQueries({ queryKey: WEEK_KEY });
            qc.invalidateQueries({ queryKey: RECENT_KEY });
          }}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      {/* Header card */}
      <View style={[styles.headerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: colors.primary + "1A" }]}>
          <Text style={[styles.avatarText, { color: colors.primary }]}>
            {(user?.name ?? "?").trim().charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: colors.foreground }]}>{user?.name ?? "—"}</Text>
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>
            {ROLE_LABELS[user?.activeRole ?? ""] ?? user?.activeRole ?? ""}
          </Text>
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>
            {meQuery.data?.crewName ? `${t("me.crew")}: ${meQuery.data.crewName}` : t("me.noCrew")}
          </Text>
          {user?.email ? (
            <Text style={[styles.meta, { color: colors.mutedForeground }]}>{user.email}</Text>
          ) : null}
        </View>
      </View>

      {/* Week strip */}
      <WeekStrip
        data={weekQuery.data}
        loading={weekQuery.isLoading}
        lang={lang}
        onSelectDate={(date) => {
          // Tap a day to jump to Today scoped to that date. Past days render
          // read-only on the Today screen; today/future render normal.
          if (date === todayYmd()) {
            router.push("/(tabs)/today" as never);
          } else {
            router.push({ pathname: "/(tabs)/today", params: { date } } as never);
          }
        }}
      />

      {/* Recent completions */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          {t("me.recent.title")}
        </Text>
        {recentQuery.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
        ) : (recentQuery.data?.items ?? []).length === 0 ? (
          <Text style={[styles.meta, { color: colors.mutedForeground, marginTop: 6 }]}>
            {t("me.recent.empty")}
          </Text>
        ) : (
          <View style={{ marginTop: 6 }}>
            {recentQuery.data!.items.map((it) => (
              <Pressable
                key={it.id}
                onPress={() => router.push(`/(tabs)/today/tickets/${it.id}` as never)}
                style={({ pressed }) => [styles.recentRow, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Feather name="check-circle" size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.recentTitle, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {it.title}
                  </Text>
                  <Text style={[styles.recentMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {[it.customerName, formatRelative(it.completedAt, lang)]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Notifications row */}
      <Pressable
        onPress={() => router.push("/(tabs)/me/notifications" as never)}
        style={({ pressed }) => [
          styles.linkRow,
          { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Feather name="bell" size={20} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.linkTitle, { color: colors.foreground }]}>
            {t("me.notifications.title")}
          </Text>
          <Text style={[styles.linkSub, { color: colors.mutedForeground }]} numberOfLines={1}>
            {t("me.notifications.deviceCount", { count: meQuery.data?.pushDeviceCount ?? 0 })}
          </Text>
        </View>
        <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
      </Pressable>

      {/* Language */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          {t("me.language")}
        </Text>
        <View style={styles.row}>
          {(["en", "es"] as const).map((code) => {
            const active = lang === code;
            return (
              <Pressable
                key={code}
                onPress={() => setLang(code)}
                style={({ pressed }) => [
                  styles.langBtn,
                  {
                    backgroundColor: active ? colors.primary : colors.background,
                    borderColor: active ? colors.primary : colors.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    color: active ? colors.primaryForeground : colors.foreground,
                  }}
                >
                  {code === "en" ? "English" : "Español"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Sign out */}
      <Pressable
        onPress={onLogout}
        disabled={loggingOut || signingIn}
        style={({ pressed }) => [
          styles.logout,
          {
            backgroundColor: colors.destructive,
            opacity: pressed || loggingOut ? 0.85 : 1,
          },
        ]}
      >
        {loggingOut ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }}>
            {t("me.logout")}
          </Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

function WeekStrip({
  data,
  loading,
  lang,
  onSelectDate,
}: {
  data: WeekResponse | undefined;
  loading: boolean;
  lang: "en" | "es";
  onSelectDate: (date: string) => void;
}) {
  const colors = useColors();
  const { t } = useT();
  const today = todayYmd();

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
        {t("me.week.title")}
      </Text>
      {loading && !data ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
      ) : !data || data.days.every((d) => d.total === 0) ? (
        <Text style={[styles.meta, { color: colors.mutedForeground, marginTop: 6 }]}>
          {t("me.week.empty")}
        </Text>
      ) : (
        <View style={styles.weekRow}>
          {data.days.map((d) => {
            const { weekday, dayNum } = shortDay(d.date, lang);
            const isToday = d.date === today;
            const pct = d.total > 0 ? Math.min(100, Math.round((d.complete / d.total) * 100)) : 0;
            return (
              <Pressable
                key={d.date}
                onPress={() => onSelectDate(d.date)}
                style={({ pressed }) => [
                  styles.weekCell,
                  {
                    borderColor: isToday ? colors.primary : colors.border,
                    backgroundColor: isToday ? colors.primary + "12" : "transparent",
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${weekday} ${dayNum}, ${d.total} stops`}
              >
                <Text style={[styles.weekDow, { color: colors.mutedForeground }]}>
                  {weekday.toUpperCase().slice(0, 3)}
                </Text>
                <Text style={[styles.weekDayNum, { color: colors.foreground }]}>
                  {dayNum}
                </Text>
                <Text style={[styles.weekTotal, { color: colors.foreground }]}>
                  {d.total}
                </Text>
                <View style={[styles.weekBarTrack, { backgroundColor: colors.border }]}>
                  <View
                    style={[
                      styles.weekBarFill,
                      { width: `${pct}%`, backgroundColor: colors.primary },
                    ]}
                  />
                </View>
                {d.flagged > 0 ? (
                  <Text style={[styles.weekFlag, { color: colors.destructive }]}>
                    {`${d.flagged}⚑`}
                  </Text>
                ) : (
                  <Text style={styles.weekFlag}> </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 20, gap: 16 },
  headerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: "Inter_700Bold", fontSize: 22 },
  card: { borderWidth: 1, borderRadius: 16, padding: 18, gap: 4 },
  name: { fontFamily: "Inter_700Bold", fontSize: 20 },
  meta: { fontFamily: "Inter_400Regular", fontSize: 13 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15, marginBottom: 4 },
  row: { flexDirection: "row", gap: 12, marginTop: 8 },
  langBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 12,
  },
  logout: {
    marginTop: 4,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  weekRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10, gap: 4 },
  weekCell: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 2,
    alignItems: "center",
    gap: 2,
  },
  weekDow: { fontFamily: "Inter_500Medium", fontSize: 10, letterSpacing: 0.5 },
  weekDayNum: { fontFamily: "Inter_700Bold", fontSize: 16 },
  weekTotal: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  weekBarTrack: {
    width: "85%",
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    marginTop: 2,
  },
  weekBarFill: { height: "100%", borderRadius: 2 },
  weekFlag: { fontFamily: "Inter_600SemiBold", fontSize: 10, marginTop: 1 },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  recentTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  recentMeta: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  linkTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  linkSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
});
