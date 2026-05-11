import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import { Alert, AppState, type AppStateStatus } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/i18n";
import { loadInitialLang } from "@/i18n";
import { installNetworkBridge, useOnline } from "@/lib/network";
import { persistOptions, queryClient, warmSyncFromAggregator } from "@/lib/persisted-query-client";
import { onItemFailed } from "@/lib/upload-queue";

SplashScreen.preventAutoHideAsync();

// Mirror device connectivity into React Query + the upload queue. Safe to
// call at module init — installs once.
installNetworkBridge();

function AuthGate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colors = useColors();
  const online = useOnline();
  const { t } = useT();
  const lastWarmedAt = useRef(0);

  // Slice 7: app-level handler for queued JSON mutations the server
  // permanently rejects (4xx on replay). This must live above any
  // particular screen so the rollback + user-facing error fire even if
  // the supervisor isn't on the affected ticket when the queue drains
  // (e.g. they enqueued a complete on ticket A then walked to ticket B
  // while still offline). We invalidate the affected ticket and the
  // Today list so any optimistic state revisits the server, and Alert
  // the original message so the supervisor knows to act.
  useEffect(() => {
    return onItemFailed((it, err) => {
      if (it.kind !== "json") return;
      void queryClient.invalidateQueries({ queryKey: ["m-ticket", it.ticketId] });
      void queryClient.invalidateQueries({ queryKey: ["m-today"] });
      const serverMsg =
        err.body && typeof err.body === "object" && "message" in err.body
          && typeof (err.body as { message: unknown }).message === "string"
          ? (err.body as { message: string }).message
          : err.message;
      Alert.alert(t("common.error"), serverMsg || t("header.queue.rejected"));
    });
  }, [t]);

  useEffect(() => {
    if (loading) return;
    const inAuthScreen = segments[0] === "login";
    if (!user && !inAuthScreen) {
      router.replace("/login");
    } else if (user && inAuthScreen) {
      router.replace("/(tabs)/today");
    }
  }, [user, loading, segments, router]);

  // Slice 7: warm every m-* React Query cache from /api/m/sync in one
  // round-trip on (a) successful login and (b) app foreground transitions.
  // Throttled to once per 30s so a quick background→foreground bounce
  // doesn't hammer the API.
  useEffect(() => {
    if (!user || !online) return;
    const warm = () => {
      const now = Date.now();
      if (now - lastWarmedAt.current < 30_000) return;
      lastWarmedAt.current = now;
      void warmSyncFromAggregator();
    };
    warm();
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s === "active") warm();
    });
    return () => sub.remove();
  }, [user, online]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
        headerTitleStyle: { fontFamily: "Inter_600SemiBold" },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="flag/new" options={{ presentation: "modal", headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [langReady, setLangReady] = useState(false);

  useEffect(() => {
    loadInitialLang().finally(() => setLangReady(true));
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && langReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, langReady]);

  if ((!fontsLoaded && !fontError) || !langReady) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            {/* Slice 8: keep the provider mounted (existing imports rely on it)
                but disable the floating keyboard toolbar — the chevron handle
                it overlays on every screen broke the visual polish, and no
                screen needs its Done/next/prev affordances. */}
            <KeyboardProvider enabled={false}>
              <AuthProvider>
                <AuthGate />
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </PersistQueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
