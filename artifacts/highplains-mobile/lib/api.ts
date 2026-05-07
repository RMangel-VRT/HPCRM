import AsyncStorage from "@react-native-async-storage/async-storage";

const COOKIE_KEY = "hp.session.cookie";

const BASE_URL = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";

let cachedCookie: string | null = null;

export async function loadCookie(): Promise<string | null> {
  if (cachedCookie !== null) return cachedCookie;
  cachedCookie = (await AsyncStorage.getItem(COOKIE_KEY)) ?? null;
  return cachedCookie;
}

export async function saveCookie(cookie: string | null): Promise<void> {
  cachedCookie = cookie;
  if (cookie) {
    await AsyncStorage.setItem(COOKIE_KEY, cookie);
  } else {
    await AsyncStorage.removeItem(COOKIE_KEY);
  }
}

function parseSetCookie(setCookie: string | null): string | null {
  if (!setCookie) return null;
  const first = setCookie.split(",").find((c) => c.includes("connect.sid")) ?? setCookie;
  const pair = first.split(";")[0]?.trim();
  return pair || null;
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
  const cookie = await loadCookie();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (cookie) headers["Cookie"] = cookie;

  const res = await fetch(url, { ...options, headers, credentials: "include" });

  const setCookieHeader =
    typeof (res.headers as any).get === "function"
      ? res.headers.get("set-cookie")
      : null;
  const newCookie = parseSetCookie(setCookieHeader);
  if (newCookie) await saveCookie(newCookie);

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const text = await res.text();
      if (text) message = text;
    } catch {}
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}
