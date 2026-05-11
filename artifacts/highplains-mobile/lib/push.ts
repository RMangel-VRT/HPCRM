// Mobile v1 Slice 6: Expo push registration and lifecycle.
//
// On app start (after sign-in) we ask the OS for permission, fetch the
// device's Expo push token, and POST it to `/api/m/me/push-subscriptions`.
// Tokens are idempotent on the server, so calling this on every launch is
// safe and self-healing if the token rotates.
//
// EXPO GO LIMITATION: Remote push notifications are not supported in Expo
// Go on iOS (SDK 53+). Calling `getExpoPushTokenAsync` there will throw —
// we swallow the error and log it. Use a development build (`expo-dev-
// client`) or a production build to test push end-to-end on iOS.

import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { ApiError, apiRequest } from "./api";

let configured = false;

function configureHandler() {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "default",
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: "#1a4d1a",
    vibrationPattern: [0, 250, 250, 250],
  });
}

function getProjectId(): string | undefined {
  const easProjectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof easProjectId === "string" && easProjectId.length > 0) return easProjectId;
  // EAS preview / dev clients populate easConfig as well.
  const fromEasConfig = (Constants as unknown as { easConfig?: { projectId?: string } })
    .easConfig?.projectId;
  return fromEasConfig;
}

async function ensurePermission(): Promise<boolean> {
  const settings = await Notifications.getPermissionsAsync();
  if (
    settings.granted ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return true;
  }
  const next = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  });
  return Boolean(
    next.granted ||
      next.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL,
  );
}

export type RegisterResult =
  | { ok: true; token: string }
  | { ok: false; reason: "permission_denied" | "unsupported" | "error"; message?: string };

export async function registerPushToken(
  options: { deviceLabel?: string | null } = {},
): Promise<RegisterResult> {
  configureHandler();
  await ensureAndroidChannel();

  if (!Device.isDevice) {
    return { ok: false, reason: "unsupported", message: "Push requires a physical device" };
  }

  const granted = await ensurePermission();
  if (!granted) return { ok: false, reason: "permission_denied" };

  let token: string;
  try {
    const projectId = getProjectId();
    const result = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    token = result.data;
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  try {
    await apiRequest("/api/m/me/push-subscriptions", {
      method: "POST",
      body: JSON.stringify({
        expoPushToken: token,
        deviceLabel: options.deviceLabel ?? Device.modelName ?? Platform.OS,
      }),
    });
    return { ok: true, token };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, reason: "error", message: err.message };
    }
    return { ok: false, reason: "error", message: String(err) };
  }
}

export async function unregisterPushToken(token: string): Promise<void> {
  try {
    await apiRequest("/api/m/me/push-subscriptions", {
      method: "DELETE",
      body: JSON.stringify({ expoPushToken: token }),
    });
  } catch {
    // Best-effort — if the token is already gone the server returns 200 anyway.
  }
}

// Last token we registered this session, for sign-out cleanup.
let lastRegisteredToken: string | null = null;
export function getLastRegisteredToken(): string | null {
  return lastRegisteredToken;
}
export async function tryRegisterAndRemember(): Promise<RegisterResult> {
  const r = await registerPushToken();
  if (r.ok) lastRegisteredToken = r.token;
  return r;
}
