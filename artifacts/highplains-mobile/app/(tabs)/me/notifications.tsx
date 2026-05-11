import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useT } from "@/i18n";
import { apiRequest } from "@/lib/api";
import { tryRegisterAndRemember } from "@/lib/push";

type Prefs = {
  newTicketAssignment: boolean;
  ticketReassignment: boolean;
  flagResponse: boolean;
};

type MeResponse = {
  notificationPrefs: Prefs;
  pushDeviceCount: number;
};

const ME_KEY = ["m-me"] as const;
const EVENTS: Array<keyof Prefs> = [
  "newTicketAssignment",
  "ticketReassignment",
  "flagResponse",
];

type PermState = "unknown" | "granted" | "denied" | "undetermined" | "unsupported";

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useT();
  const qc = useQueryClient();

  const meQuery = useQuery<MeResponse>({
    queryKey: ME_KEY,
    queryFn: () => apiRequest<MeResponse>("/api/m/me"),
    staleTime: 10_000,
  });

  const [permission, setPermission] = useState<PermState>("unknown");
  const checkPermission = useCallback(async () => {
    if (Platform.OS === "web") {
      setPermission("unsupported");
      return;
    }
    try {
      const s = await Notifications.getPermissionsAsync();
      if (s.granted) setPermission("granted");
      else if (s.canAskAgain === false) setPermission("denied");
      else setPermission("undetermined");
    } catch {
      setPermission("unsupported");
    }
  }, []);
  useEffect(() => {
    void checkPermission();
  }, [checkPermission]);

  // Local prefs mirror server prefs and update optimistically.
  const [localPrefs, setLocalPrefs] = useState<Prefs | null>(null);
  useEffect(() => {
    if (meQuery.data?.notificationPrefs) setLocalPrefs(meQuery.data.notificationPrefs);
  }, [meQuery.data?.notificationPrefs]);

  const saveMutation = useMutation({
    mutationFn: (prefs: Prefs) =>
      apiRequest("/api/m/me/notification-prefs", {
        method: "PATCH",
        body: JSON.stringify(prefs),
      }),
    onError: () => {
      // Revert local on failure and notify the user.
      if (meQuery.data?.notificationPrefs) setLocalPrefs(meQuery.data.notificationPrefs);
      Alert.alert(t("me.notifications.title"), t("me.notifications.saveError"));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ME_KEY }),
  });

  const togglePref = (event: keyof Prefs, value: boolean) => {
    const next = { ...(localPrefs ?? { newTicketAssignment: true, ticketReassignment: true, flagResponse: true }), [event]: value };
    setLocalPrefs(next);
    saveMutation.mutate(next);
  };

  const onEnablePush = async () => {
    const r = await tryRegisterAndRemember();
    if (r.ok) {
      qc.invalidateQueries({ queryKey: ME_KEY });
    }
    void checkPermission();
    if (!r.ok && r.reason === "permission_denied") {
      Alert.alert(
        t("me.notifications.title"),
        t("me.notifications.permissionDenied"),
        [
          { text: t("me.signOut.cancel"), style: "cancel" },
          { text: t("me.notifications.openSettings"), onPress: () => Linking.openSettings() },
        ],
      );
    } else if (!r.ok && r.reason === "unsupported") {
      Alert.alert(t("me.notifications.title"), t("me.notifications.unsupported"));
    } else if (!r.ok) {
      Alert.alert(t("me.notifications.title"), r.message ?? t("me.notifications.saveError"));
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t("me.notifications.title"),
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.foreground,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={12} style={{ paddingHorizontal: 4 }}>
              <Feather name="chevron-left" size={24} color={colors.foreground} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24, gap: 16 }}
      >
        {/* Permission card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            {t("me.notifications.subtitle")}
          </Text>
          {permission === "granted" ? (
            <Text style={[styles.body, { color: colors.mutedForeground, marginTop: 6 }]}>
              {t("me.notifications.permissionGranted")}
            </Text>
          ) : permission === "denied" ? (
            <>
              <Text style={[styles.body, { color: colors.mutedForeground, marginTop: 6 }]}>
                {t("me.notifications.permissionDenied")}
              </Text>
              <Pressable
                onPress={() => Linking.openSettings()}
                style={({ pressed }) => [
                  styles.cta,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }}>
                  {t("me.notifications.openSettings")}
                </Text>
              </Pressable>
            </>
          ) : permission === "unsupported" ? (
            <Text style={[styles.body, { color: colors.mutedForeground, marginTop: 6 }]}>
              {t("me.notifications.unsupported")}
            </Text>
          ) : (
            <>
              <Text style={[styles.body, { color: colors.mutedForeground, marginTop: 6 }]}>
                {t("me.notifications.permissionPrompt")}
              </Text>
              <Pressable
                onPress={onEnablePush}
                style={({ pressed }) => [
                  styles.cta,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }}>
                  {t("me.notifications.permissionEnable")}
                </Text>
              </Pressable>
            </>
          )}
          {meQuery.data ? (
            <Text style={[styles.bodySmall, { color: colors.mutedForeground, marginTop: 8 }]}>
              {t("me.notifications.deviceCount", { count: meQuery.data.pushDeviceCount })}
            </Text>
          ) : null}
          {Platform.OS === "ios" ? (
            <Text style={[styles.bodySmall, { color: colors.mutedForeground, marginTop: 4 }]}>
              {t("me.notifications.expoGoNote")}
            </Text>
          ) : null}
        </View>

        {/* Per-event toggles */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {meQuery.isLoading || !localPrefs ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            EVENTS.map((event, i) => (
              <View
                key={event}
                style={[
                  styles.toggleRow,
                  i < EVENTS.length - 1 ? { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth } : null,
                ]}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={[styles.toggleTitle, { color: colors.foreground }]}>
                    {t(`me.notifications.event.${event}`)}
                  </Text>
                  <Text style={[styles.toggleBody, { color: colors.mutedForeground }]}>
                    {t(`me.notifications.event.${event}.body`)}
                  </Text>
                </View>
                <Switch
                  value={localPrefs[event]}
                  onValueChange={(v) => togglePref(event, v)}
                  trackColor={{ true: colors.primary, false: colors.border }}
                  thumbColor={Platform.OS === "android" ? "#fff" : undefined}
                  disabled={saveMutation.isPending}
                />
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 18 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  body: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20 },
  bodySmall: { fontFamily: "Inter_400Regular", fontSize: 12 },
  cta: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
  },
  toggleTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  toggleBody: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2, lineHeight: 16 },
});
