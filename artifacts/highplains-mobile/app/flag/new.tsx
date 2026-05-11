import { Feather } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/i18n";
import { apiRequest } from "@/lib/api";
import { enqueueFlag } from "@/lib/upload-queue";

// Mirrors lib/db/src/flag-tags.ts. Inlined here so the mobile artifact
// doesn't need to depend on @workspace/db (and pull in pg/drizzle types).
// Treated as a fallback — the runtime authority is GET /api/m/flag-tags
// (same source: lib/db/src/flag-tags.ts), fetched once on mount and used to
// hydrate this list so the office can roll out a new tag without shipping
// a mobile build.
type TagOption = { value: string; label: string; color: string };
const FALLBACK_FLAG_TAGS: readonly TagOption[] = [
  { value: "irrigation_issue",     label: "Irrigation issue",     color: "#2563eb" },
  { value: "property_damage",      label: "Property damage",      color: "#dc2626" },
  { value: "access_problem",       label: "Access problem",       color: "#d97706" },
  { value: "customer_interaction", label: "Customer interaction", color: "#7c3aed" },
  { value: "material_needed",      label: "Material needed",      color: "#0d9488" },
  { value: "safety_concern",       label: "Safety concern",       color: "#b91c1c" },
  { value: "question",             label: "Question",             color: "#475569" },
  { value: "other",                label: "Other",                color: "#6b7280" },
];
const FLAG_NOTE_MAX_LENGTH = 280;

// Mobile v1 Slice 4 — flag composer.
//
// Modal screen reachable from any "+ Flag" entry point. Captures:
//   • exactly one tag (chip palette from FLAG_TAGS)
//   • ≥1 photo (camera or library, resized to 1600 long-edge / EXIF stripped)
//   • optional note (≤280 chars)
//   • optional property (auto-filled from ticket context, or searchable when
//     entered with no context)
//
// On submit it enqueues a `flag` item to the upload queue (which posts to
// /api/m/flags as multipart). Going through the queue gives us free
// offline-friendly retry/idempotency identical to slice 3 photos/notes.

type LocalPhoto = { uri: string; width?: number; height?: number };

type PropertySearchResult = {
  id: string;
  name: string;
  street: string | null;
  city: string | null;
  state: string | null;
};

function showSentToast(message: string) {
  if (Platform.OS === "android") {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert(message);
  }
}

async function pickAndResize(
  source: "camera" | "library",
): Promise<LocalPhoto | null> {
  const perm = source === "camera"
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const result = source === "camera"
    ? await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
        exif: false,
      })
    : await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
        exif: false,
      });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const longEdge = 1600;
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
  return { uri: manipulated.uri, width: manipulated.width, height: manipulated.height };
}

export default function NewFlagScreen() {
  const colors = useColors();
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    propertyId?: string;
    propertyName?: string;
    ticketId?: string;
  }>();

  // Pre-filled property comes through as router params (the ticket detail
  // composer entry sets these). Otherwise the supervisor picks one.
  const prefilledPropertyId = params.propertyId ?? null;
  const prefilledPropertyName = params.propertyName ?? null;

  const [tag, setTag] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [tagOptions, setTagOptions] = useState<readonly TagOption[]>(FALLBACK_FLAG_TAGS);

  // No-context property picker state.
  const [pickedProperty, setPickedProperty] = useState<{ id: string; name: string } | null>(
    prefilledPropertyId && prefilledPropertyName
      ? { id: prefilledPropertyId, name: prefilledPropertyName }
      : null,
  );
  const [propertyQuery, setPropertyQuery] = useState("");
  const [propertyResults, setPropertyResults] = useState<PropertySearchResult[]>([]);
  const [propertySearching, setPropertySearching] = useState(false);

  // Hydrate tag list from the server on mount; if the call fails we keep
  // the inlined fallback so the screen still works offline.
  useEffect(() => {
    let cancelled = false;
    apiRequest<{ tags: TagOption[] }>("/api/m/flag-tags")
      .then((r) => {
        if (!cancelled && Array.isArray(r?.tags) && r.tags.length > 0) {
          setTagOptions(r.tags);
        }
      })
      .catch(() => {
        // keep fallback
      });
    return () => { cancelled = true; };
  }, []);

  // Debounced property search.
  useEffect(() => {
    if (pickedProperty) return;
    const q = propertyQuery.trim();
    if (q.length < 1) {
      setPropertyResults([]);
      return;
    }
    let cancelled = false;
    setPropertySearching(true);
    const handle = setTimeout(() => {
      apiRequest<PropertySearchResult[]>(
        `/api/m/properties/search?q=${encodeURIComponent(q)}`,
      )
        .then((r) => { if (!cancelled) setPropertyResults(Array.isArray(r) ? r : []); })
        .catch(() => { if (!cancelled) setPropertyResults([]); })
        .finally(() => { if (!cancelled) setPropertySearching(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [propertyQuery, pickedProperty]);

  const noteLen = note.length;
  const noteRemaining = FLAG_NOTE_MAX_LENGTH - noteLen;
  const canSubmit = !!tag && photos.length >= 1 && noteLen <= FLAG_NOTE_MAX_LENGTH && !submitting;

  const onAddPhoto = useCallback(async (source: "camera" | "library") => {
    try {
      const p = await pickAndResize(source);
      if (!p) return;
      setPhotos((prev) => [...prev, p]);
    } catch (err) {
      Alert.alert(t("common.error"), err instanceof Error ? err.message : String(err));
    }
  }, [t]);

  const onPickPhoto = useCallback(() => {
    Alert.alert(t("flag.photo.addTitle"), undefined, [
      { text: t("flag.photo.takePhoto"), onPress: () => void onAddPhoto("camera") },
      { text: t("flag.photo.chooseLibrary"), onPress: () => void onAddPhoto("library") },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }, [onAddPhoto, t]);

  const onRemovePhoto = useCallback((idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const onSubmit = useCallback(async () => {
    if (!tag || photos.length === 0) return;
    setSubmitting(true);
    try {
      await enqueueFlag({
        tag,
        note: note.trim() ? note.trim() : null,
        propertyId: pickedProperty?.id ?? null,
        ticketId: params.ticketId ?? null,
        sourceFileUris: photos.map((p) => p.uri),
      });
      // The queue tries the upload immediately; in the common online case
      // it lands within a tick. We don't block the UI on that — surface a
      // friendly toast and dismiss the modal.
      showSentToast(t("flag.sentToast"));
      router.back();
    } catch (err) {
      setSubmitting(false);
      Alert.alert(t("common.error"), err instanceof Error ? err.message : String(err));
    }
  }, [tag, photos, note, pickedProperty, params.ticketId, router, t]);

  const ctxLine = useMemo(() => {
    const parts: string[] = [];
    if (pickedProperty?.name) parts.push(pickedProperty.name);
    if (params.ticketId) parts.push(t("flag.prefill.ticketBadge"));
    return parts.length > 0 ? parts.join(" · ") : null;
  }, [pickedProperty, params.ticketId, t]);

  // Show the property picker only when we don't already have one pre-filled
  // from the ticket-detail entry point.
  const showPropertyPicker = !prefilledPropertyId;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.flex, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button">
            <Text style={[styles.headerLink, { color: colors.primary }]}>{t("common.cancel")}</Text>
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {t("flag.composerTitle")}
          </Text>
          <Pressable
            onPress={() => void onSubmit()}
            disabled={!canSubmit}
            hitSlop={10}
            accessibilityRole="button"
          >
            {submitting ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text
                style={[
                  styles.headerLink,
                  styles.headerLinkBold,
                  { color: canSubmit ? colors.primary : colors.mutedForeground },
                ]}
              >
                {t("flag.submit")}
              </Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          {ctxLine ? (
            <Text style={[styles.context, { color: colors.mutedForeground }]} numberOfLines={1}>
              {ctxLine}
            </Text>
          ) : null}

          {showPropertyPicker ? (
            <>
              <Text style={[styles.section, { color: colors.foreground }]}>{t("flag.property.label")}</Text>
              {pickedProperty ? (
                <View style={[styles.pickedRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.pickedText, { color: colors.foreground }]} numberOfLines={1}>
                    {pickedProperty.name}
                  </Text>
                  <Pressable
                    onPress={() => { setPickedProperty(null); setPropertyQuery(""); }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t("flag.property.clear")}
                  >
                    <Feather name="x" size={16} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              ) : (
                <>
                  <TextInput
                    value={propertyQuery}
                    onChangeText={setPropertyQuery}
                    placeholder={t("flag.property.searchPlaceholder")}
                    placeholderTextColor={colors.mutedForeground}
                    autoCorrect={false}
                    autoCapitalize="none"
                    style={[
                      styles.searchInput,
                      { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card },
                    ]}
                  />
                  {propertySearching ? (
                    <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                      {t("flag.property.searching")}
                    </Text>
                  ) : null}
                  {propertyResults.length > 0 ? (
                    <View style={[styles.resultList, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      {propertyResults.map((r) => (
                        <Pressable
                          key={r.id}
                          onPress={() => {
                            setPickedProperty({ id: r.id, name: r.name });
                            setPropertyQuery("");
                            setPropertyResults([]);
                          }}
                          style={({ pressed }) => [
                            styles.resultRow,
                            { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
                          ]}
                          accessibilityRole="button"
                        >
                          <Text style={[styles.resultName, { color: colors.foreground }]} numberOfLines={1}>
                            {r.name}
                          </Text>
                          {r.street ? (
                            <Text style={[styles.resultAddr, { color: colors.mutedForeground }]} numberOfLines={1}>
                              {r.street}{r.city ? `, ${r.city}` : ""}{r.state ? `, ${r.state}` : ""}
                            </Text>
                          ) : null}
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                    {t("flag.property.optional")}
                  </Text>
                </>
              )}
            </>
          ) : null}

          <Text style={[styles.section, { color: colors.foreground }]}>{t("flag.tag.label")}</Text>
          <View style={styles.chips}>
            {tagOptions.map((opt) => {
              const selected = tag === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setTag(opt.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      borderColor: selected ? opt.color : colors.border,
                      backgroundColor: selected ? opt.color : colors.card,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: selected ? "#fff" : colors.foreground },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.section, { color: colors.foreground }]}>{t("flag.photos.label")}</Text>
          <View style={styles.photoRow}>
            {photos.map((p, idx) => (
              <View key={`${p.uri}-${idx}`} style={styles.thumbWrap}>
                <Image source={{ uri: p.uri }} style={styles.thumb} />
                <Pressable
                  onPress={() => onRemovePhoto(idx)}
                  hitSlop={6}
                  style={[styles.thumbRemove, { backgroundColor: colors.destructive }]}
                  accessibilityRole="button"
                  accessibilityLabel={t("flag.photos.remove")}
                >
                  <Feather name="x" size={12} color="#fff" />
                </Pressable>
              </View>
            ))}
            {photos.length < 8 ? (
              <Pressable
                onPress={onPickPhoto}
                style={[
                  styles.addPhoto,
                  { borderColor: colors.border, backgroundColor: colors.card },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t("flag.photo.addTitle")}
              >
                <Feather name="camera" size={22} color={colors.mutedForeground} />
                <Text style={[styles.addPhotoText, { color: colors.mutedForeground }]}>
                  {t("flag.photos.add")}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {photos.length === 0 ? (
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              {t("flag.photos.required")}
            </Text>
          ) : null}

          <Text style={[styles.section, { color: colors.foreground }]}>{t("flag.note.label")}</Text>
          <TextInput
            value={note}
            onChangeText={(v) => setNote(v.slice(0, FLAG_NOTE_MAX_LENGTH + 50))}
            placeholder={t("flag.note.placeholder")}
            placeholderTextColor={colors.mutedForeground}
            multiline
            numberOfLines={4}
            style={[
              styles.noteInput,
              {
                color: colors.foreground,
                borderColor: noteRemaining < 0 ? colors.destructive : colors.border,
                backgroundColor: colors.card,
              },
            ]}
          />
          <Text
            style={[
              styles.counter,
              { color: noteRemaining < 0 ? colors.destructive : colors.mutedForeground },
            ]}
          >
            {noteRemaining} {t("flag.note.remaining")}
          </Text>
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLink: { fontFamily: "Inter_500Medium", fontSize: 15 },
  headerLinkBold: { fontFamily: "Inter_600SemiBold" },
  headerTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16 },
  content: { padding: 16, gap: 12 },
  context: { fontFamily: "Inter_500Medium", fontSize: 13 },
  section: { fontFamily: "Inter_600SemiBold", fontSize: 14, marginTop: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  thumbWrap: { position: "relative" },
  thumb: { width: 80, height: 80, borderRadius: 8 },
  thumbRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  addPhoto: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  addPhotoText: { fontFamily: "Inter_500Medium", fontSize: 11 },
  hint: { fontFamily: "Inter_400Regular", fontSize: 12 },
  noteInput: {
    minHeight: 96,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlignVertical: "top",
  },
  counter: { fontFamily: "Inter_400Regular", fontSize: 12, alignSelf: "flex-end" },
  searchInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  pickedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pickedText: { fontFamily: "Inter_500Medium", fontSize: 14, flex: 1, marginRight: 8 },
  resultList: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  resultRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultName: { fontFamily: "Inter_500Medium", fontSize: 14 },
  resultAddr: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
});
