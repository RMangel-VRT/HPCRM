import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useLayoutEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Pill, PriorityPill } from "@/components/Pill";
import { StatusPill, type MobileStopStatus } from "@/components/StatusPill";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/i18n";
import { ApiError, apiRequest } from "@/lib/api";
import {
  enqueueJsonMutation,
  enqueueNote,
  enqueuePhoto,
  removeItem,
  retryNow,
  useTicketQueueItems,
  onItemUploaded,
  type QueueNoteItem,
  type QueuePhotoItem,
} from "@/lib/upload-queue";

// Skip-reason chip codes — kept in sync with the server's
// `MobileWorkItemSkipReason` enum in `lib/api-spec/openapi.yaml`.
const SKIP_REASON_CODES = [
  "out_of_supplies",
  "inaccessible",
  "weather",
  "customer_request",
  "other",
] as const;
type SkipReasonCode = (typeof SKIP_REASON_CODES)[number];

type WorkItem = {
  id: string;
  ticketId: string;
  label: string;
  instruction: string | null;
  photoRequired: boolean;
  sortOrder: number;
  isRequired: boolean;
  isComplete: boolean;
  completedAt: string | null;
  completedById: string | null;
  skipReason: string | null;
  skipNote: string | null;
};

type SiteNote = {
  id: string;
  label: string;
  value: string;
  serviceType: string | null;
  sortOrder: number;
};

type Customer = {
  id: string;
  name: string;
  address: string | null;
  locationLat: number | null;
  locationLng: number | null;
};

type TicketDetail = {
  id: string;
  title: string;
  description: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  mobileStatus: MobileStopStatus;
  serviceType: string | null;
  dueDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  completionNotes: string | null;
  completionOverrideNote: string | null;
  locationLabel: string | null;
  locationLat: number | null;
  locationLng: number | null;
  customer: Customer | null;
  siteNotes: SiteNote[];
  workItems: WorkItem[];
  photosCount: number;
  notesCount: number;
  // True when the supervisor is viewing a completed ticket from outside their
  // current crew (e.g. via the property History tab). Mutation controls are
  // hidden client-side; the API also rejects mutations server-side.
  readOnly?: boolean;
};

type MissingRequiredError = {
  code: "MISSING_REQUIRED";
  message: string;
  missing: WorkItem[];
};

const ticketKey = (id: string) => ["m-ticket", id] as const;

export default function TicketDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const ticketId = String(id);
  const { t } = useT();

  const [skipTarget, setSkipTarget] = useState<WorkItem | null>(null);
  const [skipReasonCode, setSkipReasonCode] = useState<SkipReasonCode | null>(null);
  const [skipNote, setSkipNote] = useState("");
  const [completionNotes, setCompletionNotes] = useState("");
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [missing, setMissing] = useState<WorkItem[] | null>(null);
  const [overrideNote, setOverrideNote] = useState("");

  const query = useQuery<TicketDetail>({
    queryKey: ticketKey(ticketId),
    queryFn: () => apiRequest<TicketDetail>(`/api/m/tickets/${ticketId}`),
    staleTime: 15_000,
  });

  const data = query.data;
  // Slice 7: queued-JSON rejection rollback (invalidate + alert) is now
  // handled globally in app/_layout.tsx so it fires whether or not this
  // screen is mounted when the queue drains.

  const router = useRouter();
  const onPressFlag = useCallback(() => {
    router.push({
      pathname: "/flag/new",
      params: {
        ticketId,
        ...(data?.customer?.id ? { propertyId: data.customer.id } : {}),
        ...(data?.customer?.name ? { propertyName: data.customer.name } : {}),
      },
    });
  }, [router, ticketId, data?.customer?.id, data?.customer?.name]);

  // Slice 8: only set the screen title from the loaded ticket. The duplicate
  // headerRight "+ Flag" affordance was removed — the pinned bottom action
  // bar already exposes "Flag" (see ticket.flag.button), one affordance per
  // screen is enough.
  useLayoutEffect(() => {
    navigation.setOptions({
      title: query.data?.title ?? "Ticket",
    });
  }, [navigation, query.data?.title]);

  const patchItemMutation = useMutation({
    mutationFn: async (vars: {
      id: string;
      isComplete?: boolean;
      skipReason?: SkipReasonCode | null;
      skipNote?: string | null;
    }) => {
      const body: Record<string, unknown> = {};
      if (vars.isComplete !== undefined) body.isComplete = vars.isComplete;
      if (vars.skipReason !== undefined) body.skipReason = vars.skipReason;
      if (vars.skipNote !== undefined) body.skipNote = vars.skipNote;
      try {
        return await apiRequest<WorkItem>(`/api/m/work-items/${vars.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } catch (err) {
        // ApiError → real server response (4xx/5xx); let onError handle it
        // (e.g. PHOTO_REQUIRED rollback). Anything else is a network failure
        // — enqueue and keep the optimistic UI in place; the queue worker
        // will retry once we're back online.
        if (err instanceof ApiError) throw err;
        await enqueueJsonMutation({
          ticketId,
          op: "workItemPatch",
          method: "PATCH",
          path: `/api/m/work-items/${vars.id}`,
          body,
        });
        return null;
      }
    },
    onMutate: async (vars) => {
      setPendingItemId(vars.id);
      await queryClient.cancelQueries({ queryKey: ticketKey(ticketId) });
      const prev = queryClient.getQueryData<TicketDetail>(ticketKey(ticketId));
      if (prev) {
        queryClient.setQueryData<TicketDetail>(ticketKey(ticketId), {
          ...prev,
          workItems: prev.workItems.map((w) =>
            w.id === vars.id
              ? {
                  ...w,
                  isComplete: vars.isComplete ?? w.isComplete,
                  skipReason: vars.skipReason !== undefined ? vars.skipReason : w.skipReason,
                  skipNote: vars.skipNote !== undefined ? vars.skipNote : w.skipNote,
                  completedAt: vars.isComplete ? new Date().toISOString() : w.completedAt,
                }
              : w,
          ),
        });
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(ticketKey(ticketId), ctx.prev);
      // Slice 3: server enforces a photo before completing a photo-required
      // work item. The inline "Add a photo first" affordance on the row is
      // the primary UX; this alert is the fallback for the rare race where a
      // queued photo failed to upload between render and the toggle tap.
      if (
        err instanceof ApiError &&
        err.status === 422 &&
        err.body &&
        typeof err.body === "object" &&
        (err.body as { code?: string }).code === "PHOTO_REQUIRED"
      ) {
        Alert.alert(t("ticket.workItems.photoRequired"), t("ticket.workItems.photoMissing"));
      }
    },
    onSettled: (updated) => {
      setPendingItemId(null);
      if (updated) {
        queryClient.setQueryData<TicketDetail>(ticketKey(ticketId), (prev) =>
          prev
            ? { ...prev, workItems: prev.workItems.map((w) => (w.id === updated.id ? updated : w)) }
            : prev,
        );
      }
      // Note: we deliberately don't invalidate here on a null result — that
      // would clobber the offline-optimistic cache while the queued PATCH is
      // still in flight. The queue worker invalidates via successListeners on
      // the next online tick.
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (vars: { overrideMissing?: boolean; overrideNote?: string }) => {
      const body = {
        completionNotes: completionNotes.trim() || undefined,
        overrideMissing: vars.overrideMissing ?? false,
        overrideNote: vars.overrideNote ?? undefined,
      };
      try {
        return await apiRequest<{
          id: string;
          mobileStatus: MobileStopStatus;
          completedAt: string | null;
          completionOverrideNote: string | null;
        }>(`/api/m/tickets/${ticketId}/complete`, {
          method: "POST",
          body: JSON.stringify(body),
        });
      } catch (err) {
        // Real server response (e.g. 409 MISSING_REQUIRED) → re-throw so
        // onError can show the override modal. Network failure → queue and
        // optimistically synthesize a "complete" response; the worker will
        // re-POST once we're online.
        if (err instanceof ApiError) throw err;
        await enqueueJsonMutation({
          ticketId,
          op: "ticketComplete",
          method: "POST",
          path: `/api/m/tickets/${ticketId}/complete`,
          body,
        });
        return {
          id: ticketId,
          mobileStatus: "complete" as MobileStopStatus,
          completedAt: new Date().toISOString(),
          completionOverrideNote: vars.overrideNote ?? null,
        };
      }
    },
    onSuccess: (resp) => {
      setMissing(null);
      setOverrideNote("");
      queryClient.setQueryData<TicketDetail>(ticketKey(ticketId), (prev) =>
        prev
          ? {
              ...prev,
              mobileStatus: resp.mobileStatus,
              completedAt: resp.completedAt,
              completionNotes: completionNotes.trim() || prev.completionNotes,
              completionOverrideNote: resp.completionOverrideNote,
            }
          : prev,
      );
      queryClient.invalidateQueries({ queryKey: ["m-today"] });
      Alert.alert(t("ticket.complete.success"));
    },
    onError: async (err: unknown) => {
      // The server returns 409 with `{ code: "MISSING_REQUIRED", missing: [...] }`
      // when required items are still open. We branch on the structured `body`
      // attached to ApiError (NOT err.message — which is just the human string).
      if (err instanceof ApiError && err.status === 409 && err.body && typeof err.body === "object") {
        const b = err.body as Partial<MissingRequiredError>;
        if (b.code === "MISSING_REQUIRED" && Array.isArray(b.missing)) {
          setMissing(b.missing);
          return;
        }
      }
      Alert.alert(t("common.error"), err instanceof Error ? err.message : String(err));
    },
  });

  const onPressNavigate = useCallback(async () => {
    if (!data) return;
    const lat = data.customer?.locationLat ?? data.locationLat;
    const lng = data.customer?.locationLng ?? data.locationLng;
    let url: string | null = null;
    if (lat != null && lng != null) {
      url = Platform.OS === "ios" ? `maps:0,0?q=${lat},${lng}` : `geo:0,0?q=${lat},${lng}`;
    } else if (data.customer?.address) {
      const q = encodeURIComponent(data.customer.address);
      url = Platform.OS === "ios" ? `maps:0,0?q=${q}` : `geo:0,0?q=${q}`;
    }
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      const fallback = `https://www.google.com/maps/search/?api=1&query=${
        lat != null && lng != null ? `${lat},${lng}` : encodeURIComponent(data.customer?.address ?? "")
      }`;
      Linking.openURL(fallback).catch(() => undefined);
    }
  }, [data]);

  const openSkip = (item: WorkItem) => {
    setSkipTarget(item);
    setSkipReasonCode((item.skipReason as SkipReasonCode | null) ?? null);
    setSkipNote(item.skipNote ?? "");
  };

  const closeSkip = () => {
    setSkipTarget(null);
    setSkipReasonCode(null);
    setSkipNote("");
  };

  const submitSkip = () => {
    if (!skipTarget || !skipReasonCode) return;
    // The "other" chip requires a follow-up note (the server enforces this too,
    // but we block here so the user gets immediate feedback).
    if (skipReasonCode === "other" && skipNote.trim().length === 0) return;
    patchItemMutation.mutate({
      id: skipTarget.id,
      skipReason: skipReasonCode,
      skipNote: skipNote.trim() || null,
      isComplete: false,
    });
    closeSkip();
  };

  const undoSkip = (item: WorkItem) => {
    patchItemMutation.mutate({ id: item.id, skipReason: null, skipNote: null });
  };

  const toggleComplete = (item: WorkItem) => {
    patchItemMutation.mutate({ id: item.id, isComplete: !item.isComplete });
  };

  const requiredMissingCount = useMemo(() => {
    if (!data) return 0;
    return data.workItems.filter(
      (w) => w.isRequired && !w.isComplete && !(w.skipReason && w.skipReason.trim().length > 0),
    ).length;
  }, [data]);

  // `readOnly` from the API takes precedence: a supervisor who navigates to a
  // completed cross-crew ticket from the property History tab gets the same
  // mutation-disabled treatment as their own completed tickets.
  const completed = data?.mobileStatus === "complete" || data?.readOnly === true;
  const completing = completeMutation.isPending;

  // Mirrors the server's photo-required rule (workItemMissingRequiredPhoto):
  // a photo only "counts" if it was captured during the current visit, i.e.
  // capturedAt >= ticket.startedAt. If startedAt is unknown, any photo
  // counts (matches the server fallback). Both server photos and queued
  // photos captured this session are considered so a freshly-snapped shot
  // immediately clears the warning.
  const serverPhotosQuery = useQuery<ServerPhoto[]>({
    queryKey: ["m-ticket-photos", ticketId],
    queryFn: () => apiRequest<ServerPhoto[]>(`/api/m/tickets/${ticketId}/photos`),
    staleTime: 30_000,
  });
  const ticketQueueItems = useTicketQueueItems(ticketId);
  const ticketHasPhoto = useMemo(
    () =>
      hasSessionPhoto(
        data?.startedAt ?? null,
        serverPhotosQuery.data ?? [],
        ticketQueueItems.filter((q): q is QueuePhotoItem | QueueNoteItem => q.kind !== "flag"),
      ),
    [data?.startedAt, serverPhotosQuery.data, ticketQueueItems],
  );

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 140 }]}
        keyboardShouldPersistTaps="handled"
      >
        {query.isLoading && !data ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : query.isError && !data ? (
          <ErrorCard onRetry={() => query.refetch()} />
        ) : data ? (
          <>
            {/* Header */}
            <View style={styles.headerRow}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={[styles.title, { color: colors.foreground }]}>{data.title}</Text>
                {data.customer ? (
                  <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                    {data.customer.name}
                  </Text>
                ) : null}
                {data.customer?.address ? (
                  <Text style={[styles.address, { color: colors.mutedForeground }]} numberOfLines={2}>
                    {data.customer.address}
                  </Text>
                ) : null}
                <View style={styles.pillsRow}>
                  <StatusPill status={data.mobileStatus} />
                  <PriorityPill priority={data.priority} />
                  {data.serviceType ? <Pill label={data.serviceType.replace(/_/g, " ")} /> : null}
                </View>
              </View>
              <Pressable
                onPress={onPressNavigate}
                accessibilityRole="button"
                accessibilityLabel={t("ticket.navigate")}
                style={({ pressed }) => [
                  styles.navigateBtn,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Feather name="navigation" size={16} color={colors.primaryForeground} />
                <Text style={[styles.navigateText, { color: colors.primaryForeground }]}>
                  {t("ticket.navigate")}
                </Text>
              </Pressable>
            </View>

            {data.description ? (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.body, { color: colors.foreground }]}>{data.description}</Text>
              </View>
            ) : null}

            {/* Site notes — hidden entirely when there's nothing curated for
                this property + service-type combination, per Slice 2 spec. */}
            {data.siteNotes.length > 0 ? (
              <>
                <SectionTitle label={t("ticket.siteNotes")} />
                <SiteNotesCard notes={data.siteNotes} />
              </>
            ) : null}

            {/* Work items */}
            <SectionTitle label={t("ticket.workItems")} />
            {data.workItems.length === 0 ? (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.muted, { color: colors.mutedForeground }]}>
                  {t("ticket.workItems.empty")}
                </Text>
              </View>
            ) : (
              <View style={styles.workItemsList}>
                {data.workItems.map((item) => (
                  <WorkItemRow
                    key={item.id}
                    item={item}
                    pending={pendingItemId === item.id}
                    disabled={completed}
                    hasPhoto={ticketHasPhoto}
                    onToggle={() => toggleComplete(item)}
                    onSkip={() => openSkip(item)}
                    onUndoSkip={() => undoSkip(item)}
                    onAddPhoto={() => void captureAndEnqueuePhoto(ticketId, t)}
                  />
                ))}
              </View>
            )}

            <SectionTitle label={t("ticket.photos")} />
            <PhotosCard ticketId={ticketId} />

            <SectionTitle label={t("ticket.notes")} />
            <NotesCard ticketId={ticketId} />
          </>
        ) : null}
      </ScrollView>

      {/* Sticky bottom action bar */}
      {data ? (
        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: colors.card,
              borderTopColor: colors.border,
              paddingBottom: insets.bottom + 12,
            },
          ]}
        >
          {completed ? (
            <Text style={[styles.completedNote, { color: colors.success }]}>
              {t("ticket.complete.alreadyDone")}
            </Text>
          ) : (
            <View style={styles.bottomBarRow}>
              <Pressable
                onPress={onPressFlag}
                accessibilityRole="button"
                accessibilityLabel={t("ticket.flag.button")}
                style={({ pressed }) => [
                  styles.flagBtn,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Feather name="flag" size={16} color={colors.destructive} />
                <Text style={[styles.flagText, { color: colors.foreground }]}>
                  {t("ticket.flag.button")}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => completeMutation.mutate({ overrideMissing: false })}
                disabled={completing}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.completeBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity: pressed || completing ? 0.85 : 1,
                    flex: 1,
                  },
                ]}
              >
                {completing ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <>
                    <Feather name="check-circle" size={18} color={colors.primaryForeground} />
                    <Text style={[styles.completeText, { color: colors.primaryForeground }]}>
                      {t("ticket.complete.button")}
                      {requiredMissingCount > 0 ? `  (${requiredMissingCount})` : ""}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          )}
        </View>
      ) : null}

      {/* Skip-with-reason chip sheet */}
      <Modal visible={!!skipTarget} transparent animationType="slide" onRequestClose={closeSkip}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalRoot}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeSkip} />
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("ticket.skip.title")}</Text>
            <Text style={[styles.modalBody, { color: colors.mutedForeground }]}>
              {t("ticket.skip.body")}
            </Text>
            {skipTarget ? (
              <Text style={[styles.modalLabel, { color: colors.foreground }]} numberOfLines={2}>
                {skipTarget.label}
              </Text>
            ) : null}
            <View style={styles.chipRow}>
              {SKIP_REASON_CODES.map((code) => {
                const selected = skipReasonCode === code;
                return (
                  <Pressable
                    key={code}
                    onPress={() => setSkipReasonCode(code)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        backgroundColor: selected ? colors.primary : colors.background,
                        borderColor: selected ? colors.primary : colors.border,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: selected ? colors.primaryForeground : colors.foreground },
                      ]}
                    >
                      {t(`ticket.skip.reason.${code}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              value={skipNote}
              onChangeText={setSkipNote}
              placeholder={t("ticket.skip.notePlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              multiline
              style={[
                styles.modalInput,
                {
                  borderColor: colors.border,
                  color: colors.foreground,
                  backgroundColor: colors.background,
                },
              ]}
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={closeSkip}
                style={({ pressed }) => [
                  styles.modalSecondary,
                  { borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={[styles.modalSecondaryText, { color: colors.foreground }]}>
                  {t("ticket.skip.cancel")}
                </Text>
              </Pressable>
              <Pressable
                onPress={submitSkip}
                disabled={
                  !skipReasonCode ||
                  (skipReasonCode === "other" && skipNote.trim().length === 0)
                }
                style={({ pressed }) => [
                  styles.modalPrimary,
                  {
                    backgroundColor: colors.primary,
                    opacity:
                      !skipReasonCode || (skipReasonCode === "other" && skipNote.trim().length === 0)
                        ? 0.5
                        : pressed
                          ? 0.85
                          : 1,
                  },
                ]}
              >
                <Text style={[styles.modalPrimaryText, { color: colors.primaryForeground }]}>
                  {t("ticket.skip.save")}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Missing-required confirmation modal w/ required override note */}
      <Modal
        visible={!!missing}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setMissing(null);
          setOverrideNote("");
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalRoot}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              setMissing(null);
              setOverrideNote("");
            }}
          />
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.destructive }]}>
              {t("ticket.complete.confirmTitle")}
            </Text>
            <Text style={[styles.modalBody, { color: colors.mutedForeground }]}>
              {t("ticket.complete.confirmBody")}
            </Text>
            <View style={styles.missingList}>
              {missing?.map((m) => (
                <View key={m.id} style={styles.missingRow}>
                  <Feather name="alert-circle" size={16} color={colors.destructive} />
                  <Text style={[styles.missingText, { color: colors.foreground }]}>{m.label}</Text>
                </View>
              ))}
            </View>
            <Text style={[styles.modalLabel, { color: colors.foreground }]}>
              {t("ticket.complete.overrideNoteLabel")}
            </Text>
            <TextInput
              value={overrideNote}
              onChangeText={setOverrideNote}
              placeholder={t("ticket.complete.overrideNotePlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              multiline
              autoFocus
              style={[
                styles.modalInput,
                {
                  borderColor: colors.border,
                  color: colors.foreground,
                  backgroundColor: colors.background,
                },
              ]}
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  setMissing(null);
                  setOverrideNote("");
                }}
                style={({ pressed }) => [
                  styles.modalSecondary,
                  { borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={[styles.modalSecondaryText, { color: colors.foreground }]}>
                  {t("ticket.complete.cancel")}
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  completeMutation.mutate({ overrideMissing: true, overrideNote: overrideNote.trim() })
                }
                disabled={overrideNote.trim().length === 0 || completing}
                style={({ pressed }) => [
                  styles.modalPrimary,
                  {
                    backgroundColor: colors.destructive,
                    opacity:
                      overrideNote.trim().length === 0 || completing ? 0.5 : pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text style={[styles.modalPrimaryText, { color: "#fff" }]}>
                  {t("ticket.complete.confirmButton")}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function SectionTitle({ label }: { label: string }) {
  const colors = useColors();
  return (
    <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
      {label.toUpperCase()}
    </Text>
  );
}

function SiteNotesCard({ notes }: { notes: SiteNote[] }) {
  const colors = useColors();
  const { t } = useT();

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {notes.length === 0 ? (
        <Text style={[styles.muted, { color: colors.mutedForeground }]}>
          {t("ticket.siteNotes.empty")}
        </Text>
      ) : (
        <View style={{ gap: 12 }}>
          {notes.map((n) => (
            <View key={n.id} style={{ gap: 2 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{n.label}</Text>
              <Text style={[styles.fieldValue, { color: colors.foreground }]}>{n.value}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function WorkItemRow({
  item,
  pending,
  disabled,
  hasPhoto,
  onToggle,
  onSkip,
  onUndoSkip,
  onAddPhoto,
}: {
  item: WorkItem;
  pending: boolean;
  disabled: boolean;
  hasPhoto: boolean;
  onToggle: () => void;
  onSkip: () => void;
  onUndoSkip: () => void;
  onAddPhoto: () => void;
}) {
  const colors = useColors();
  const { t } = useT();
  const skipped = !!item.skipReason && !item.isComplete;
  const skipReasonLabel = item.skipReason
    ? t(`ticket.skip.reason.${item.skipReason}` as const)
    : null;

  return (
    <View
      style={[
        styles.workItemRow,
        {
          backgroundColor: colors.card,
          borderColor:
            item.isRequired && !item.isComplete && !skipped ? colors.destructive + "55" : colors.border,
        },
      ]}
    >
      <Pressable
        onPress={onToggle}
        disabled={disabled || pending}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.isComplete }}
        style={({ pressed }) => [
          styles.checkbox,
          {
            borderColor: item.isComplete ? colors.success : colors.border,
            backgroundColor: item.isComplete ? colors.success : "transparent",
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        {item.isComplete ? <Feather name="check" size={16} color="#fff" /> : null}
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        <Text
          style={[
            styles.workItemLabel,
            {
              color: colors.foreground,
              // Both completed and skipped items render with strikethrough +
              // muted opacity so the crew can see at a glance which items are
              // still actionable.
              textDecorationLine: item.isComplete || skipped ? "line-through" : "none",
              opacity: item.isComplete || skipped ? 0.55 : 1,
            },
          ]}
        >
          {item.label}
        </Text>
        {item.instruction ? (
          <Text style={[styles.instruction, { color: colors.mutedForeground }]}>
            {item.instruction}
          </Text>
        ) : null}
        <View style={styles.workItemMeta}>
          {item.isRequired ? <Pill label={t("ticket.workItems.required")} tone="danger" /> : null}
          {item.photoRequired ? (
            <View
              style={[
                styles.photoBadge,
                {
                  borderColor: !hasPhoto && !item.isComplete ? colors.destructive : colors.border,
                  backgroundColor: colors.background,
                },
              ]}
            >
              <Feather
                name="camera"
                size={11}
                color={!hasPhoto && !item.isComplete ? colors.destructive : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.photoBadgeText,
                  {
                    color:
                      !hasPhoto && !item.isComplete ? colors.destructive : colors.mutedForeground,
                  },
                ]}
              >
                {t("ticket.workItems.photoRequired")}
              </Text>
            </View>
          ) : null}
          {skipped ? <Pill label={t("ticket.workItems.skipped")} tone="warning" /> : null}
          {skipped && skipReasonLabel ? (
            <Pill label={skipReasonLabel} />
          ) : null}
          {pending ? <ActivityIndicator size="small" color={colors.mutedForeground} /> : null}
        </View>
        {skipped && item.skipNote ? (
          <Text style={[styles.skipReason, { color: colors.mutedForeground }]} numberOfLines={3}>
            {item.skipNote}
          </Text>
        ) : null}
        {item.photoRequired && !hasPhoto && !item.isComplete && !skipped ? (
          <View style={styles.addPhotoHintRow}>
            <Text style={[styles.skipReason, { color: colors.destructive }]}>
              {t("ticket.workItems.addPhotoFirst")}
            </Text>
            <Pressable onPress={onAddPhoto} hitSlop={6}>
              <Text style={[styles.linkText, { color: colors.primary }]}>
                {t("ticket.workItems.addPhotoShortcut")}
              </Text>
            </Pressable>
          </View>
        ) : null}
        {!item.isComplete && !disabled ? (
          skipped ? (
            <Pressable onPress={onUndoSkip} hitSlop={6}>
              <Text style={[styles.linkText, { color: colors.primary }]}>
                {t("ticket.workItems.unskip")}
              </Text>
            </Pressable>
          ) : (
            <Pressable onPress={onSkip} hitSlop={6}>
              <Text style={[styles.linkText, { color: colors.mutedForeground }]}>
                {t("ticket.workItems.skip")}
              </Text>
            </Pressable>
          )
        ) : null}
      </View>
    </View>
  );
}

type ServerPhoto = {
  id: string;
  ticketId: string;
  storageKey: string;
  signedUrl: string | null;
  contentType: string;
  width: number | null;
  height: number | null;
  byteSize: number | null;
  capturedAt: string | null;
  createdAt: string;
  uploadedByUserId: string | null;
};

type ServerNote = {
  id: string;
  ticketId: string;
  body: string;
  authorUserId: string | null;
  createdAt: string;
};

/**
 * Returns `true` if a photo for this ticket was captured during the current
 * visit (capturedAt ≥ ticket.startedAt). Mirrors the server-side rule in
 * `workItemMissingRequiredPhoto`. If `startedAt` is null any photo counts.
 */
function hasSessionPhoto(
  startedAt: string | null,
  serverPhotos: { capturedAt: string | null }[],
  queued: (QueuePhotoItem | QueueNoteItem)[],
): boolean {
  const queuedPhotos = queued.filter((q): q is QueuePhotoItem => q.kind === "photo");
  const startMs = startedAt ? new Date(startedAt).getTime() : Number.NaN;
  if (!startedAt || Number.isNaN(startMs)) {
    return serverPhotos.length > 0 || queuedPhotos.length > 0;
  }
  return (
    serverPhotos.some((p) => p.capturedAt !== null && new Date(p.capturedAt).getTime() >= startMs) ||
    queuedPhotos.some((q) => new Date(q.capturedAt).getTime() >= startMs)
  );
}

/**
 * Capture a photo with the camera, resize/strip EXIF, and enqueue it for
 * upload. Shared by the Photos card and the work-item row's "+ Photo"
 * shortcut so both affordances follow the same code path.
 */
async function captureAndEnqueuePhoto(
  ticketId: string,
  t: (k: string) => string,
): Promise<void> {
  try {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t("ticket.photos"), t("ticket.photos.permissionDenied"));
      return;
    }
    const captured = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      exif: false,
    });
    if (captured.canceled || !captured.assets?.[0]) return;
    const asset = captured.assets[0];
    // Resize to 2048 long edge + recompress JPEG → strips EXIF, caps bytes.
    const longEdge = 2048;
    const ratio =
      asset.width && asset.height
        ? Math.min(1, longEdge / Math.max(asset.width, asset.height))
        : 1;
    const targetW = asset.width ? Math.round(asset.width * ratio) : undefined;
    const manipulated = await ImageManipulator.manipulateAsync(
      asset.uri,
      targetW ? [{ resize: { width: targetW } }] : [],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
    );
    await enqueuePhoto({
      ticketId,
      sourceFileUri: manipulated.uri,
      contentType: "image/jpeg",
    });
  } catch (err) {
    Alert.alert(t("common.error"), err instanceof Error ? err.message : String(err));
  }
}

function PhotosCard({ ticketId }: { ticketId: string }) {
  const colors = useColors();
  const { t } = useT();
  const queryClient = useQueryClient();
  const queueItems = useTicketQueueItems(ticketId);
  const queuedPhotos = useMemo(
    () => queueItems.filter((i): i is QueuePhotoItem => i.kind === "photo"),
    [queueItems],
  );
  const photosQuery = useQuery<ServerPhoto[]>({
    queryKey: ["m-ticket-photos", ticketId],
    queryFn: () => apiRequest<ServerPhoto[]>(`/api/m/tickets/${ticketId}/photos`),
    staleTime: 30_000,
  });
  // Refetch as each photo lands on the server (so confirmations appear
  // immediately for multi-photo batches), and again once the queue fully
  // drains as a safety net.
  const queueLen = queueItems.length;
  React.useEffect(() => {
    if (queueLen === 0) {
      void queryClient.invalidateQueries({ queryKey: ["m-ticket-photos", ticketId] });
      void queryClient.invalidateQueries({ queryKey: ticketKey(ticketId) });
    }
  }, [queueLen, queryClient, ticketId]);
  React.useEffect(() => {
    return onItemUploaded((it) => {
      if (it.kind !== "photo" || it.ticketId !== ticketId) return;
      void queryClient.invalidateQueries({ queryKey: ["m-ticket-photos", ticketId] });
    });
  }, [queryClient, ticketId]);

  const [viewerUri, setViewerUri] = useState<string | null>(null);

  const onAdd = useCallback(() => {
    void captureAndEnqueuePhoto(ticketId, t);
  }, [ticketId, t]);

  const onDelete = useCallback(
    (photoId: string) => {
      Alert.alert(t("ticket.photos.delete"), t("ticket.photos.deleteConfirm"), [
        { text: t("ticket.skip.cancel"), style: "cancel" },
        {
          text: t("ticket.photos.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await apiRequest(`/api/m/photos/${photoId}`, { method: "DELETE" });
              await queryClient.invalidateQueries({ queryKey: ["m-ticket-photos", ticketId] });
              await queryClient.invalidateQueries({ queryKey: ticketKey(ticketId) });
            } catch (err) {
              Alert.alert(t("common.error"), err instanceof Error ? err.message : String(err));
            }
          },
        },
      ]);
    },
    [t, queryClient, ticketId],
  );

  const photos = photosQuery.data ?? [];

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, gap: 12 }]}>
      <Pressable
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel={t("ticket.photos.add")}
        style={({ pressed }) => [
          styles.stubBtn,
          {
            backgroundColor: colors.background,
            borderColor: colors.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Feather name="camera" size={16} color={colors.primary} />
        <Text style={[styles.stubBtnLabel, { color: colors.foreground }]}>
          {t("ticket.photos.add")}
        </Text>
        <View style={[styles.stubCount, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.stubCountText, { color: colors.mutedForeground }]}>
            {photos.length + queuedPhotos.length}
          </Text>
        </View>
      </Pressable>

      {photos.length === 0 && queuedPhotos.length === 0 ? (
        <Text style={[styles.muted, { color: colors.mutedForeground }]}>
          {t("ticket.photos.empty")}
        </Text>
      ) : (
        <View style={styles.photoGrid}>
          {queuedPhotos.map((p) => {
            const failing = p.attempts > 0;
            return (
              <View key={p.id} style={styles.photoTile}>
                <Image
                  source={{ uri: p.fileUri }}
                  style={[styles.photoThumb, { borderColor: colors.border }]}
                />
                <View
                  style={[
                    styles.photoOverlay,
                    {
                      backgroundColor: failing
                        ? "rgba(127,29,29,0.7)"
                        : "rgba(0,0,0,0.45)",
                    },
                  ]}
                >
                  {failing ? (
                    <Pressable
                      onPress={() => void retryNow(p.id)}
                      accessibilityRole="button"
                      hitSlop={6}
                    >
                      <Text style={styles.photoOverlayText}>{t("ticket.photos.retry")}</Text>
                    </Pressable>
                  ) : (
                    <>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={styles.photoOverlayText}>{t("ticket.photos.uploading")}</Text>
                    </>
                  )}
                </View>
                {failing ? (
                  <Pressable
                    onPress={() => void removeItem(p.id)}
                    accessibilityRole="button"
                    accessibilityLabel={t("ticket.photos.delete")}
                    style={[styles.photoDeleteBtn, { backgroundColor: colors.card }]}
                    hitSlop={6}
                  >
                    <Feather name="x" size={12} color={colors.destructive} />
                  </Pressable>
                ) : null}
              </View>
            );
          })}
          {photos.map((p) => (
            <View key={p.id} style={styles.photoTile}>
              <Pressable
                onPress={() => p.signedUrl && setViewerUri(p.signedUrl)}
                accessibilityRole="imagebutton"
                accessibilityLabel={t("ticket.photos")}
                disabled={!p.signedUrl}
                style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
              >
                {p.signedUrl ? (
                  <Image
                    source={{ uri: p.signedUrl }}
                    style={[styles.photoThumb, { borderColor: colors.border }]}
                  />
                ) : (
                  <View style={[styles.photoThumb, { borderColor: colors.border, backgroundColor: colors.background }]} />
                )}
              </Pressable>
              <Pressable
                onPress={() => onDelete(p.id)}
                accessibilityRole="button"
                accessibilityLabel={t("ticket.photos.delete")}
                style={[styles.photoDeleteBtn, { backgroundColor: colors.card }]}
                hitSlop={6}
              >
                <Feather name="x" size={12} color={colors.destructive} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <Modal
        visible={!!viewerUri}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerUri(null)}
      >
        <Pressable
          style={styles.viewerBackdrop}
          onPress={() => setViewerUri(null)}
          accessibilityLabel={t("ticket.photos.viewerClose")}
        >
          {viewerUri ? (
            <Image
              source={{ uri: viewerUri }}
              style={styles.viewerImage}
              resizeMode="contain"
            />
          ) : null}
          <Pressable
            onPress={() => setViewerUri(null)}
            accessibilityRole="button"
            accessibilityLabel={t("ticket.photos.viewerClose")}
            style={styles.viewerClose}
            hitSlop={10}
          >
            <Feather name="x" size={22} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function NotesCard({ ticketId }: { ticketId: string }) {
  const colors = useColors();
  const { t } = useT();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const queueItems = useTicketQueueItems(ticketId);
  const queuedNotes = useMemo(
    () => queueItems.filter((i): i is QueueNoteItem => i.kind === "note"),
    [queueItems],
  );
  const notesQuery = useQuery<ServerNote[]>({
    queryKey: ["m-ticket-notes", ticketId],
    queryFn: () => apiRequest<ServerNote[]>(`/api/m/tickets/${ticketId}/notes`),
    staleTime: 30_000,
  });
  const queueLen = queueItems.length;
  React.useEffect(() => {
    if (queueLen === 0) {
      void queryClient.invalidateQueries({ queryKey: ["m-ticket-notes", ticketId] });
      void queryClient.invalidateQueries({ queryKey: ticketKey(ticketId) });
    }
  }, [queueLen, queryClient, ticketId]);

  const onSave = useCallback(async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    await enqueueNote({ ticketId, body });
  }, [draft, ticketId]);

  const notes = notesQuery.data ?? [];

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, gap: 10 }]}>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onBlur={() => {
          // Auto-save on blur — saves crews from losing a note when they tap
          // away to navigate or scroll. The button still works as a
          // discoverable "Save" affordance.
          if (draft.trim().length > 0) void onSave();
        }}
        placeholder={t("ticket.notes.placeholder")}
        placeholderTextColor={colors.mutedForeground}
        multiline
        style={[
          styles.notesInput,
          { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background },
        ]}
      />
      <Pressable
        onPress={onSave}
        disabled={draft.trim().length === 0}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.modalPrimary,
          {
            alignSelf: "flex-end",
            backgroundColor: colors.primary,
            opacity: draft.trim().length === 0 ? 0.5 : pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text style={[styles.modalPrimaryText, { color: colors.primaryForeground }]}>
          {t("ticket.notes.save")}
        </Text>
      </Pressable>

      {queuedNotes.length === 0 && notes.length === 0 ? (
        <Text style={[styles.muted, { color: colors.mutedForeground }]}>
          {t("ticket.notes.empty")}
        </Text>
      ) : (
        <View style={{ gap: 10 }}>
          {queuedNotes.map((n) => {
            const failing = n.attempts > 0;
            return (
              <View
                key={n.id}
                style={[
                  styles.noteRow,
                  { borderColor: failing ? colors.destructive + "55" : colors.border },
                ]}
              >
                <Text style={[styles.body, { color: colors.foreground }]}>{n.body}</Text>
                <View style={styles.noteMetaRow}>
                  <Text style={[styles.noteMeta, { color: failing ? colors.destructive : colors.mutedForeground }]}>
                    {failing ? t("ticket.notes.failed") : t("ticket.notes.queued")}
                  </Text>
                  {failing ? (
                    <Pressable onPress={() => void retryNow(n.id)} hitSlop={6}>
                      <Text style={[styles.linkText, { color: colors.primary }]}>
                        {t("ticket.photos.retry")}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
          {notes.map((n) => (
            <View
              key={n.id}
              style={[styles.noteRow, { borderColor: colors.border }]}
            >
              <Text style={[styles.body, { color: colors.foreground }]}>{n.body}</Text>
              <Text style={[styles.noteMeta, { color: colors.mutedForeground }]}>
                {new Date(n.createdAt).toLocaleString()}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function ErrorCard({ onRetry }: { onRetry: () => void }) {
  const colors = useColors();
  const { t } = useT();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.destructive, fontSize: 16 }]}>{t("common.error")}</Text>
      <Pressable
        onPress={onRetry}
        style={({ pressed }) => [
          styles.retryBtn,
          { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={[styles.retryText, { color: colors.primaryForeground }]}>{t("common.retry")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 20, gap: 14 },
  loadingWrap: { paddingVertical: 60, alignItems: "center" },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  title: { fontFamily: "Inter_700Bold", fontSize: 20 },
  subtitle: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  address: { fontFamily: "Inter_400Regular", fontSize: 13 },
  pillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  navigateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  navigateText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  flagBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
  },
  flagText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14 },
  body: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20 },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.8,
    marginTop: 4,
    marginBottom: 2,
  },
  muted: { fontFamily: "Inter_400Regular", fontSize: 13 },
  fieldLabel: { fontFamily: "Inter_500Medium", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 },
  fieldValue: { fontFamily: "Inter_500Medium", fontSize: 14, lineHeight: 20 },
  workItemsList: { gap: 8 },
  workItemRow: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  workItemLabel: { fontFamily: "Inter_500Medium", fontSize: 14, lineHeight: 20 },
  instruction: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18 },
  workItemMeta: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  photoBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  photoBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 10, letterSpacing: 0.3 },
  skipReason: { fontFamily: "Inter_400Regular", fontSize: 12, fontStyle: "italic" },
  linkText: { fontFamily: "Inter_600SemiBold", fontSize: 12, marginTop: 2 },
  notesInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 90,
    textAlignVertical: "top",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  completeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  completeText: { fontFamily: "Inter_700Bold", fontSize: 15 },
  completedNote: { fontFamily: "Inter_600SemiBold", fontSize: 14, textAlign: "center", paddingVertical: 12 },
  bottomBarRow: { flexDirection: "row", gap: 10, alignItems: "stretch" },
  stubBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  stubBtnLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14, flex: 1 },
  stubCount: {
    minWidth: 28,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
  },
  stubCountText: { fontFamily: "Inter_700Bold", fontSize: 12 },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  photoTile: { width: 96, height: 96, position: "relative" },
  addPhotoHintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 4,
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerImage: { width: "100%", height: "100%" },
  viewerClose: {
    position: "absolute",
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoThumb: { width: 96, height: 96, borderRadius: 10, borderWidth: 1 },
  photoOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  photoOverlayText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: "#fff",
    letterSpacing: 0.3,
  },
  photoDeleteBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  noteRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  noteMetaRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  noteMeta: { fontFamily: "Inter_500Medium", fontSize: 11, letterSpacing: 0.3 },
  retryBtn: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, alignSelf: "flex-start" },
  retryText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },

  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 12,
  },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 17 },
  modalBody: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20 },
  modalLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  modalInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    minHeight: 90,
    textAlignVertical: "top",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  modalActions: { flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 4 },
  modalSecondary: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  modalSecondaryText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  modalPrimary: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  modalPrimaryText: { fontFamily: "Inter_700Bold", fontSize: 13 },
  missingList: { gap: 6, marginVertical: 4 },
  missingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  missingText: { fontFamily: "Inter_500Medium", fontSize: 13, flex: 1 },
});
