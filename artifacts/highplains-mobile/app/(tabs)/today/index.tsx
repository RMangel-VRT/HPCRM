import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PriorityPill } from "@/components/Pill";
import { StatusPill, type MobileStopStatus } from "@/components/StatusPill";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/i18n";
import { ApiError, apiRequest } from "@/lib/api";
import { warmSyncFromAggregator } from "@/lib/persisted-query-client";

type TodayStop = {
  id: string;
  title: string;
  priority: "low" | "normal" | "high" | "urgent";
  mobileStatus: MobileStopStatus;
  routeOrder: number | null;
  dueDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  customerName: string | null;
  customerAddress: string | null;
  locationLabel: string | null;
};

type TodayResponse = {
  date: string;
  crewId: string | null;
  crewName: string | null;
  summary: {
    total: number;
    notStarted: number;
    inProgress: number;
    complete: number;
    skipped: number;
    flagged: number;
  };
  stops: TodayStop[];
};

const TODAY_KEY = ["m-today"] as const;

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const INFO_COLOR = "#2563eb";

function formatTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatDateLabel(date: string): string {
  // date is YYYY-MM-DD; build a Date in local TZ for friendlier formatting.
  const [y, m, d] = date.split("-").map((p) => Number.parseInt(p, 10));
  const local = new Date(y, (m ?? 1) - 1, d ?? 1);
  if (Number.isNaN(local.getTime())) return date;
  return local.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default function TodayScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { t } = useT();
  const queryClient = useQueryClient();
  const [startingId, setStartingId] = useState<string | null>(null);

  // Slice 6: the Me-tab week strip can deep-link in here scoped to a past
  // date (e.g. ?date=2026-05-09). Past dates render read-only — we still
  // show the stops, but tapping doesn't auto-start them.
  const params = useLocalSearchParams<{ date?: string | string[] }>();
  const dateParam = Array.isArray(params.date) ? params.date[0] : params.date;
  const validDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;
  const todayKey = todayYmd();
  const isPastDay = !!validDate && validDate < todayKey;
  const isOtherDay = !!validDate && validDate !== todayKey;
  const queryKey = validDate ? ([...TODAY_KEY, validDate] as const) : TODAY_KEY;
  const requestPath = validDate ? `/api/m/today?date=${validDate}` : "/api/m/today";

  const query = useQuery<TodayResponse>({
    queryKey,
    queryFn: () => apiRequest<TodayResponse>(requestPath),
    staleTime: 30_000,
  });

  // Refetch when the tab regains focus so a returning supervisor sees fresh data.
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey });
    }, [queryClient, queryKey]),
  );

  const onStopPress = useCallback(
    async (stop: TodayStop) => {
      // Past-day view is read-only: never auto-start, just open detail.
      if (isPastDay) {
        router.push(`/(tabs)/today/tickets/${stop.id}` as never);
        return;
      }
      // Fire-and-forget start: silently flip not_started → in_progress on the
      // server. We optimistically mark it locally so the pill updates immediately,
      // then navigate. Errors revert by invalidating the query.
      if (stop.mobileStatus === "not_started") {
        setStartingId(stop.id);
        const nowIso = new Date().toISOString();
        queryClient.setQueryData<TodayResponse | undefined>(queryKey, (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            summary: {
              ...prev.summary,
              notStarted: Math.max(0, prev.summary.notStarted - 1),
              inProgress: prev.summary.inProgress + 1,
            },
            stops: prev.stops.map((s) =>
              s.id === stop.id
                ? { ...s, mobileStatus: "in_progress", startedAt: s.startedAt ?? nowIso }
                : s,
            ),
          };
        });
        try {
          await apiRequest(`/api/m/tickets/${stop.id}/start`, { method: "POST" });
        } catch (e) {
          if (!(e instanceof ApiError) || e.status !== 401) {
            queryClient.invalidateQueries({ queryKey });
          }
        } finally {
          setStartingId(null);
        }
      }
      router.push(`/(tabs)/today/tickets/${stop.id}` as never);
    },
    [queryClient, queryKey, router, isPastDay],
  );

  const data = query.data;
  const isInitialLoading = query.isLoading && !data;
  const hasData = !!data;
  const showInlineErrorBanner = query.isError && hasData;

  // Day-summary line: "X of Y stops complete · Started HH:MM AM"
  // or "Day not started" when nothing has been started.
  const daySummaryLine = useMemo(() => {
    if (!data) return null;
    const { summary, stops } = data;
    const earliestStart = stops
      .map((s) => s.startedAt)
      .filter((v): v is string => !!v)
      .sort()[0];
    if (!earliestStart) {
      return t("today.dayNotStarted");
    }
    const startLabel = formatTime(earliestStart);
    const base = `${summary.complete} ${t("today.ofWord")} ${summary.total} ${t("today.stopsComplete")}`;
    return startLabel ? `${base} · ${t("today.startedAt")} ${startLabel}` : base;
  }, [data, t]);

  // First in-progress stop is the "active" stop (info-color border).
  const activeStopId = useMemo(
    () => data?.stops.find((s) => s.mobileStatus === "in_progress")?.id ?? null,
    [data],
  );

  const renderHeader = () => (
    <View style={styles.headerWrap}>
      <Text style={[styles.dateLabel, { color: colors.mutedForeground }]}>
        {data ? formatDateLabel(data.date) : ""}
      </Text>
      <Text style={[styles.greeting, { color: colors.foreground }]}>
        {`${t("today.greeting")}${user?.name ? `, ${user.name.split(" ")[0]}` : ""}`}
      </Text>
      {data?.crewName ? (
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
          {`${t("today.crewLabel")}: ${data.crewName}`}
        </Text>
      ) : null}

      {isOtherDay ? (
        <View
          style={[
            styles.errorBanner,
            { backgroundColor: colors.primary + "12", borderColor: colors.primary + "55" },
          ]}
        >
          <Feather name={isPastDay ? "lock" : "calendar"} size={16} color={colors.primary} />
          <Text style={[styles.errorText, { color: colors.foreground }]} numberOfLines={2}>
            {isPastDay ? t("today.readOnlyBanner") : t("today.futureBanner")}
          </Text>
          <Pressable
            onPress={() => router.replace("/(tabs)/today" as never)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.errorRetry,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.errorRetryText, { color: colors.primaryForeground }]}>
              {t("today.backToToday")}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {data && data.summary.total > 0 && daySummaryLine ? (
        <Text style={[styles.daySummary, { color: colors.foreground }]}>{daySummaryLine}</Text>
      ) : null}

      {showInlineErrorBanner ? (
        <View style={[styles.errorBanner, { backgroundColor: "#fee2e2", borderColor: "#fecaca" }]}>
          <Feather name="alert-triangle" size={16} color={colors.destructive} />
          <Text style={[styles.errorText, { color: colors.destructive }]} numberOfLines={2}>
            {t("today.errorBanner")}
          </Text>
          <Pressable
            onPress={() => query.refetch()}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.errorRetry,
              { backgroundColor: colors.destructive, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.errorRetryText, { color: "#fff" }]}>{t("common.retry")}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  const renderEmpty = () => {
    if (isInitialLoading) {
      return (
        <View style={styles.skeletonList}>
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} index={i} />
          ))}
        </View>
      );
    }
    if (query.isError && !hasData) {
      return (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.destructive }]}>{t("common.error")}</Text>
          <Text style={[styles.cardBody, { color: colors.mutedForeground }]}>
            {t("today.errorBanner")}
          </Text>
          <Pressable
            onPress={() => query.refetch()}
            style={({ pressed }) => [
              styles.retryBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>
              {t("common.retry")}
            </Text>
          </Pressable>
        </View>
      );
    }
    if (data && !data.crewId) {
      const onRefresh = () => {
        void warmSyncFromAggregator();
        void query.refetch();
      };
      const onSignOut = () => {
        Alert.alert(
          t("me.signOut.title"),
          t("me.signOut.body"),
          [
            { text: t("me.signOut.cancel"), style: "cancel" },
            {
              text: t("me.signOut.confirm"),
              style: "destructive",
              onPress: () => {
                void signOut();
              },
            },
          ],
          { cancelable: true },
        );
      };
      return (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            {t("today.noCrew.title")}
          </Text>
          <Text style={[styles.cardBody, { color: colors.mutedForeground }]}>
            {t("today.noCrew.body")}
          </Text>
          <Text style={[styles.cardBody, { color: colors.mutedForeground, fontStyle: "italic" }]}>
            {t("today.noCrew.refreshHint")}
          </Text>
          <Pressable
            onPress={onRefresh}
            accessibilityRole="button"
            accessibilityLabel={t("today.noCrew.refresh")}
            style={({ pressed }) => [
              styles.retryBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            {query.isFetching ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.retryText, { color: colors.primaryForeground }]}>
                {t("today.noCrew.refresh")}
              </Text>
            )}
          </Pressable>
          <Pressable
            onPress={onSignOut}
            accessibilityRole="button"
            accessibilityLabel={t("me.signOut.confirm")}
            style={({ pressed }) => [
              styles.signOutBtn,
              { borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.signOutText, { color: colors.destructive }]}>
              {t("me.signOut.confirm")}
            </Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>{t("today.empty.title")}</Text>
        <Text style={[styles.cardBody, { color: colors.mutedForeground }]}>
          {t("today.empty.body")}
        </Text>
      </View>
    );
  };

  return (
    <FlatList
      style={[styles.flex, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      data={data?.stops ?? []}
      keyExtractor={(s) => s.id}
      ListHeaderComponent={renderHeader}
      ListEmptyComponent={renderEmpty}
      refreshControl={
        <RefreshControl
          refreshing={query.isFetching && !isInitialLoading}
          onRefresh={() => {
            // Pull-to-refresh — warm every m-* cache from /api/m/sync first
            // (cheap on the server, populates Week + Recent + Me alongside
            // Today), then refetch this screen so any hydration mismatch
            // resolves immediately.
            void warmSyncFromAggregator();
            void query.refetch();
          }}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
      renderItem={({ item, index }) => (
        <StopCard
          stop={item}
          index={index}
          starting={startingId === item.id}
          isActive={item.id === activeStopId}
          onPress={() => onStopPress(item)}
        />
      )}
    />
  );
}

function SkeletonCard({ index }: { index: number }) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.stop,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: 1 - index * 0.15 },
      ]}
    >
      <View style={[styles.skeletonBadge, { backgroundColor: colors.muted }]} />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={[styles.skeletonLine, { backgroundColor: colors.muted, width: "70%" }]} />
        <View style={[styles.skeletonLine, { backgroundColor: colors.muted, width: "45%" }]} />
        <View style={[styles.skeletonLine, { backgroundColor: colors.muted, width: "55%", height: 10 }]} />
      </View>
    </View>
  );
}

function StopCard({
  stop,
  index,
  starting,
  isActive,
  onPress,
}: {
  stop: TodayStop;
  index: number;
  starting: boolean;
  isActive: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const { t } = useT();
  const order = stop.routeOrder ?? index + 1;
  const subtitle = stop.customerName ?? stop.locationLabel ?? "";
  const address = stop.customerAddress ?? "";
  const scheduledTime = formatTime(stop.dueDate);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.stop,
        {
          backgroundColor: colors.card,
          borderColor: isActive ? INFO_COLOR : colors.border,
          borderWidth: isActive ? 2 : 1,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={stop.title}
    >
      <View style={[styles.orderBadge, { backgroundColor: colors.primary + "1A" }]}>
        <Text style={[styles.orderText, { color: colors.primary }]}>{order}</Text>
      </View>

      <View style={styles.stopBody}>
        <View style={styles.stopHeaderRow}>
          {scheduledTime ? (
            <Text style={[styles.scheduledTime, { color: colors.foreground }]}>
              {scheduledTime}
            </Text>
          ) : (
            <Text style={[styles.scheduledTime, { color: colors.mutedForeground }]}>
              {t("today.unscheduled")}
            </Text>
          )}
          {!!subtitle && (
            <Text
              style={[styles.stopCustomer, { color: colors.mutedForeground }]}
              numberOfLines={1}
            >
              · {subtitle}
            </Text>
          )}
        </View>

        <Text style={[styles.stopTitle, { color: colors.foreground }]} numberOfLines={2}>
          {stop.title}
        </Text>

        {!!address && (
          <Text style={[styles.stopAddress, { color: colors.mutedForeground }]} numberOfLines={1}>
            {address}
          </Text>
        )}

        <View style={styles.pillsRow}>
          <StatusPill status={stop.mobileStatus} />
          <PriorityPill priority={stop.priority} />
          {starting && (
            <ActivityIndicator size="small" color={colors.mutedForeground} style={{ marginLeft: 4 }} />
          )}
        </View>
      </View>

      <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 20, gap: 12 },
  headerWrap: { gap: 6, marginBottom: 8 },
  dateLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  greeting: { fontFamily: "Inter_700Bold", fontSize: 26 },
  sub: { fontFamily: "Inter_400Regular", fontSize: 14 },
  daySummary: { fontFamily: "Inter_600SemiBold", fontSize: 14, marginTop: 6 },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  errorText: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 13 },
  errorRetry: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  errorRetryText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  card: { borderWidth: 1, borderRadius: 16, padding: 20, gap: 8, marginTop: 8 },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 17 },
  cardBody: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20 },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  retryText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  signOutBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  signOutText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  stop: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  orderBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  orderText: { fontFamily: "Inter_700Bold", fontSize: 14 },
  stopBody: { flex: 1, gap: 4 },
  stopHeaderRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4 },
  scheduledTime: { fontFamily: "Inter_700Bold", fontSize: 13 },
  stopTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  stopCustomer: { fontFamily: "Inter_500Medium", fontSize: 13 },
  stopAddress: { fontFamily: "Inter_400Regular", fontSize: 12 },
  pillsRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 6 },
  skeletonList: { gap: 12, marginTop: 8 },
  skeletonBadge: { width: 36, height: 36, borderRadius: 18 },
  skeletonLine: { height: 12, borderRadius: 6 },
});
