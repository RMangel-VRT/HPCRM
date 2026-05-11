// Mobile v1 Slice 6: Expo Push API delivery + per-user subscription pruning.
//
// We POST to https://exp.host/--/api/v2/push/send (chunked at 100 messages
// per request, per Expo's spec) and prune any tokens whose response indicates
// the device is no longer reachable (`DeviceNotRegistered` /
// `InvalidCredentials`). The mobile client re-registers on next app launch.
//
// This module never throws to the caller — push is best-effort and must not
// block ticket / flag mutations. All errors are logged via the singleton
// pino logger.

import { and, eq, sql } from "drizzle-orm";

import { db } from "../db";
import { users } from "@workspace/db";
import { logger } from "../lib/logger";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK_SIZE = 100;

export type PushEvent = "newTicketAssignment" | "ticketReassignment" | "flagResponse";

export type PushPayload = {
  title: string;
  body: string;
  // Routed by the mobile app's notification handler — e.g. { ticketId } or
  // { flagId } so tapping the notification can deep-link to the right screen.
  data?: Record<string, unknown>;
};

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound: "default";
  priority: "high";
  channelId: "default";
};

type ExpoTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message: string; details?: { error?: string } };

type ExpoResponse = { data?: ExpoTicket[]; errors?: Array<{ message: string }> };

function isValidExpoToken(token: unknown): token is string {
  return typeof token === "string" && /^Expo(?:nent)?PushToken\[[^\]]+\]$/.test(token);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function sendChunk(messages: ExpoMessage[]): Promise<ExpoTicket[]> {
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn({ status: res.status, body: text.slice(0, 500) }, "Expo push HTTP error");
      return messages.map(() => ({ status: "error" as const, message: `HTTP ${res.status}` }));
    }
    const json = (await res.json()) as ExpoResponse;
    if (Array.isArray(json.data)) return json.data;
    logger.warn({ json }, "Expo push response missing data");
    return messages.map(() => ({ status: "error" as const, message: "no data" }));
  } catch (err) {
    logger.warn({ err }, "Expo push request failed");
    return messages.map(() => ({ status: "error" as const, message: String(err) }));
  }
}

// Remove a single token from a single user's push_subscriptions_json array.
// Idempotent — uses a JSONB filter so concurrent updates don't clobber.
async function pruneToken(userId: string, badToken: string): Promise<void> {
  try {
    await db
      .update(users)
      .set({
        pushSubscriptionsJson: sql`COALESCE(
          (SELECT jsonb_agg(elem)
             FROM jsonb_array_elements(${users.pushSubscriptionsJson}) AS elem
            WHERE elem->>'expoPushToken' <> ${badToken}),
          '[]'::jsonb
        )`,
      })
      .where(eq(users.id, userId));
  } catch (err) {
    logger.warn({ err, userId }, "Failed to prune dead push token");
  }
}

// Send a push to one user across all of their registered devices, respecting
// the user's per-event opt-in pref. Best-effort — never throws.
export async function sendPushToUser(
  userId: string,
  event: PushEvent,
  payload: PushPayload,
): Promise<void> {
  let row: { tokens: { expoPushToken: string }[] | null; prefs: Record<string, boolean> | null } | undefined;
  try {
    const [r] = await db
      .select({
        tokens: users.pushSubscriptionsJson,
        prefs: users.notificationPrefsJson,
      })
      .from(users)
      .where(eq(users.id, userId));
    row = r as typeof row;
  } catch (err) {
    logger.warn({ err, userId }, "sendPushToUser: failed to load user");
    return;
  }
  if (!row) return;
  const prefs = row.prefs ?? {};
  if (prefs[event] === false) return;

  const tokens = (row.tokens ?? [])
    .map((t) => t.expoPushToken)
    .filter(isValidExpoToken);
  if (tokens.length === 0) return;

  const messages: ExpoMessage[] = tokens.map((to) => ({
    to,
    title: payload.title,
    body: payload.body,
    data: { event, ...(payload.data ?? {}) },
    sound: "default",
    priority: "high",
    channelId: "default",
  }));

  for (const c of chunk(messages, CHUNK_SIZE)) {
    const tickets = await sendChunk(c);
    for (let i = 0; i < tickets.length; i++) {
      const t = tickets[i];
      if (t.status === "error") {
        const err = t.details?.error;
        if (err === "DeviceNotRegistered" || err === "InvalidCredentials") {
          await pruneToken(userId, c[i].to);
        } else {
          logger.warn({ userId, message: t.message, err }, "Expo push ticket error");
        }
      }
    }
  }
}

// Add or refresh a token on a user. Matches existing entries by `expoPushToken`
// so the same physical device updates rather than appearing twice.
export async function addPushSubscription(
  userId: string,
  expoPushToken: string,
  deviceLabel: string | null,
): Promise<void> {
  if (!isValidExpoToken(expoPushToken)) {
    throw new Error("Invalid Expo push token");
  }
  const nowIso = new Date().toISOString();
  await db
    .update(users)
    .set({
      pushSubscriptionsJson: sql`COALESCE(
        (SELECT jsonb_agg(elem)
           FROM jsonb_array_elements(${users.pushSubscriptionsJson}) AS elem
          WHERE elem->>'expoPushToken' <> ${expoPushToken}),
        '[]'::jsonb
      ) || ${JSON.stringify([{ expoPushToken, deviceLabel, addedAt: nowIso }])}::jsonb`,
    })
    .where(eq(users.id, userId));
}

export async function removePushSubscription(userId: string, expoPushToken: string): Promise<void> {
  await pruneToken(userId, expoPushToken);
}
