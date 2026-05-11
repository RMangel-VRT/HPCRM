import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "hp.mobile.token";

const BASE_URL = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";

let cachedToken: string | null = null;

const useSecureStore = Platform.OS !== "web";

export async function loadToken(): Promise<string | null> {
  if (cachedToken !== null) return cachedToken;
  cachedToken = useSecureStore
    ? ((await SecureStore.getItemAsync(TOKEN_KEY)) ?? null)
    : ((await AsyncStorage.getItem(TOKEN_KEY)) ?? null);
  return cachedToken;
}

export async function saveToken(token: string | null): Promise<void> {
  cachedToken = token;
  if (token) {
    if (useSecureStore) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await AsyncStorage.setItem(TOKEN_KEY, token);
  } else {
    if (useSecureStore) await SecureStore.deleteItemAsync(TOKEN_KEY);
    else await AsyncStorage.removeItem(TOKEN_KEY);
  }
}

// Centralized handler invoked when an authenticated request returns 401.
// AuthContext registers a callback that clears local user state and routes to /login.
type UnauthorizedHandler = () => void | Promise<void>;
let onUnauthorized: UnauthorizedHandler | null = null;
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null): void {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  status: number;
  // Parsed JSON body when the server returned `application/json` (e.g. a 409
  // with `{ code, message, missing }`). Callers branch on `err.body?.code`
  // instead of trying to parse `err.message`, which is just the human string.
  body: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
  const token = await loadToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let body: unknown = undefined;
    try {
      const text = await res.text();
      if (text) {
        try {
          const j = JSON.parse(text);
          body = j;
          message = (j && typeof j === "object" && "message" in j && typeof j.message === "string")
            ? j.message
            : text;
        } catch {
          message = text;
        }
      }
    } catch {}

    // 401 from any *authenticated* request means our stored token is no longer valid.
    // Clear it and notify the auth layer so it can redirect to /login.
    // We deliberately skip this for the login endpoint itself — bad credentials are
    // a 401 too, but they shouldn't kick a not-yet-authenticated user to "/login".
    const isLoginCall = path.includes("/api/m/auth/login");
    if (res.status === 401 && token && !isLoginCall) {
      await saveToken(null);
      try {
        await onUnauthorized?.();
      } catch {}
    }

    throw new ApiError(message, res.status, body);
  }

  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}
