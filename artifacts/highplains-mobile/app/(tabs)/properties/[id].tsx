import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { TabView, TabBar } from "react-native-tab-view";

import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/i18n";
import { apiRequest } from "@/lib/api";

type Contact = {
  id: string;
  name: string;
  role: string | null;
  isPrimary: boolean;
  phones: string[];
  emails: string[];
};

type Contract = {
  id: string;
  serviceType: string;
  billingPattern: string;
  status: "active" | "paused" | "ended";
  startDate: string | null;
  endDate: string | null;
  po: string | null;
  notes: string | null;
};

type SiteNote = {
  id: string;
  label: string;
  value: string;
  serviceType: string | null;
  sortOrder: number;
};

type MapSheet = {
  id: string;
  title: string;
  scopeDate: string;
  status: string;
  hasBaseImage: boolean;
  combinedPngPath: string | null;
  editorPath: string;
};

type CompletedVisit = {
  id: string;
  title: string;
  priority: "low" | "normal" | "high" | "urgent";
  mobileStatus: string;
  status: string | null;
  dueDate: string | null;
  completedAt: string | null;
  serviceType: string | null;
};

type PropertyPhoto = {
  ticketId: string;
  ticketTitle: string;
  path: string;
  takenAt: string | null;
};

type PropertyDetail = {
  id: string;
  name: string;
  customerNumber: string | null;
  address: string | null;
  street: string;
  city: string;
  state: string;
  zip: string;
  status: string;
  customerType: "commercial" | "hoa";
  ranking: "standard" | "preferred" | "key_account";
  complexityScore: string | null;
  acres: string | null;
  managementCompany: string | null;
  snowEnabled: boolean;
  tags: string[];
  locationLat: number | null;
  locationLng: number | null;
  siteNotesQuick: {
    gateCode: string | null;
    petStationCount: number | null;
    petStationLocations: string | null;
    irrigationControllerLocations: string | null;
    accessNotes: string | null;
    watchOutNotes: string | null;
  };
  contacts: Contact[];
  contracts: Contract[];
  siteNotes: SiteNote[];
  maps: MapSheet[];
  completedVisits: CompletedVisit[];
  photos: PropertyPhoto[];
};

const propertyKey = (id: string) => ["m-property", id] as const;

const BASE_URL = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";

export default function PropertyDetailScreen() {
  const colors = useColors();
  const { t } = useT();
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const propertyId = String(id);
  const layout = useWindowDimensions();

  const query = useQuery<PropertyDetail>({
    queryKey: propertyKey(propertyId),
    queryFn: () => apiRequest<PropertyDetail>(`/api/m/properties/${propertyId}`),
    staleTime: 30_000,
  });

  const data = query.data;

  // Record a "view" once the data lands so the Properties tab's Recent
  // section reflects what the supervisor just opened.
  useEffect(() => {
    if (!data?.id) return;
    apiRequest(`/api/m/properties/${data.id}/view`, { method: "POST" }).catch(() => {});
  }, [data?.id]);

  const onNavigate = useCallback(() => {
    if (!data) return;
    const lat = data.locationLat;
    const lng = data.locationLng;
    let url: string;
    if (typeof lat === "number" && typeof lng === "number") {
      url = Platform.select({
        ios: `maps:0,0?q=${encodeURIComponent(data.name)}@${lat},${lng}`,
        android: `geo:0,0?q=${lat},${lng}(${encodeURIComponent(data.name)})`,
        default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
      })!;
    } else if (data.address) {
      const q = encodeURIComponent(data.address);
      url = Platform.select({
        ios: `maps:0,0?q=${q}`,
        android: `geo:0,0?q=${q}`,
        default: `https://www.google.com/maps/search/?api=1&query=${q}`,
      })!;
    } else {
      Alert.alert(t("property.navigate.unavailable"));
      return;
    }
    Linking.openURL(url).catch(() => {
      Alert.alert(t("property.navigate.unavailable"));
    });
  }, [data, t]);

  const onFlag = useCallback(() => {
    if (!data) return;
    // Flag composer is the shared `/flag/new` stub today. Passing
    // propertyId/propertyName as query params means once the real composer
    // ships it can read them via useLocalSearchParams without changing
    // any entry point.
    router.push({
      pathname: "/flag/new",
      params: { propertyId: data.id, propertyName: data.name },
    });
  }, [data, router]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: data?.name ?? t("property.headerFallback"),
      headerRight: () => (
        <View style={styles.headerActions}>
          <Pressable
            onPress={onNavigate}
            style={({ pressed }) => [
              styles.headerBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
            accessibilityLabel={t("property.navigate")}
          >
            <Feather name="navigation" size={14} color={colors.primaryForeground} />
            <Text style={[styles.headerBtnText, { color: colors.primaryForeground }]}>
              {t("property.navigate")}
            </Text>
          </Pressable>
          <Pressable
            onPress={onFlag}
            style={({ pressed }) => [
              styles.headerBtn,
              {
                backgroundColor: "transparent",
                borderColor: colors.primary,
                borderWidth: 1,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
            accessibilityLabel={t("property.flag")}
          >
            <Feather name="flag" size={12} color={colors.primary} />
            <Text style={[styles.headerBtnText, { color: colors.primary }]}>
              + {t("property.flag")}
            </Text>
          </Pressable>
        </View>
      ),
    });
  }, [navigation, data, colors, onNavigate, onFlag, t]);

  const [tabIndex, setTabIndex] = useState(0);
  const routes = useMemo(
    () => [
      { key: "overview", title: t("property.tab.overview") },
      { key: "siteNotes", title: t("property.tab.siteNotes") },
      { key: "services", title: t("property.tab.services") },
      { key: "map", title: t("property.tab.map") },
      { key: "history", title: t("property.tab.history") },
      { key: "photos", title: t("property.tab.photos") },
    ],
    [t],
  );

  if (query.isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (query.isError || !data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>
          {t("common.error")}
        </Text>
        <Pressable
          onPress={() => query.refetch()}
          style={[styles.retry, { backgroundColor: colors.primary }]}
        >
          <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }}>
            {t("common.retry")}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <TabView
      navigationState={{ index: tabIndex, routes }}
      onIndexChange={setTabIndex}
      initialLayout={{ width: layout.width }}
      lazy
      renderTabBar={(props) => (
        <TabBar
          {...props}
          scrollEnabled
          activeColor={colors.primary}
          inactiveColor={colors.mutedForeground}
          indicatorStyle={{ backgroundColor: colors.primary }}
          style={{ backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border }}
          tabStyle={{ width: "auto", paddingHorizontal: 16 }}
        />
      )}
      renderScene={({ route }) => {
        switch (route.key) {
          case "overview":
            return <OverviewTab data={data} />;
          case "siteNotes":
            return <SiteNotesTab data={data} />;
          case "services":
            return <ServicesTab data={data} />;
          case "map":
            return <MapTab data={data} />;
          case "history":
            return <HistoryTab data={data} onTicket={(tid) => router.push(`/(tabs)/today/tickets/${tid}`)} />;
          case "photos":
            return <PhotosTab data={data} />;
          default:
            return null;
        }
      }}
    />
  );
}

// ---------------- Tab: Overview ----------------
function OverviewTab({ data }: { data: PropertyDetail }) {
  const colors = useColors();
  const { t } = useT();

  const facts: Array<{ label: string; value: string | null }> = [
    { label: t("property.field.address"), value: data.address },
    { label: t("property.field.customerType"), value: data.customerType },
    { label: t("property.field.ranking"), value: data.ranking },
    { label: t("property.field.complexity"), value: data.complexityScore },
    { label: t("property.field.acres"), value: data.acres },
    { label: t("property.field.managementCompany"), value: data.managementCompany },
    { label: t("property.field.snow"), value: data.snowEnabled ? t("common.yes") : t("common.no") },
    { label: t("property.field.customerNumber"), value: data.customerNumber },
  ];

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.tabContent}>
      <Section title={t("property.section.facts")}>
        {facts.map((f) =>
          f.value ? (
            <View key={f.label} style={[styles.factRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.factLabel, { color: colors.mutedForeground }]}>{f.label}</Text>
              <Text style={[styles.factValue, { color: colors.foreground }]}>{String(f.value)}</Text>
            </View>
          ) : null,
        )}
      </Section>

      {data.contacts.length > 0 ? (
        <Section title={t("property.section.contacts")}>
          {data.contacts.map((ct) => (
            <View key={ct.id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                {ct.name}
                {ct.isPrimary ? "  ★" : ""}
              </Text>
              {ct.role ? (
                <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{ct.role}</Text>
              ) : null}
              {ct.phones.map((p) => (
                <Pressable key={p} onPress={() => Linking.openURL(`tel:${p}`)}>
                  <Text style={[styles.link, { color: colors.primary }]}>📞 {p}</Text>
                </Pressable>
              ))}
              {ct.emails.map((e) => (
                <Pressable key={e} onPress={() => Linking.openURL(`mailto:${e}`)}>
                  <Text style={[styles.link, { color: colors.primary }]}>✉️ {e}</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </Section>
      ) : null}

      {data.tags.length > 0 ? (
        <Section title={t("property.section.tags")}>
          <View style={styles.tagsRow}>
            {data.tags.map((tag) => (
              <View key={tag} style={[styles.tagPill, { backgroundColor: colors.muted }]}>
                <Text style={[styles.tagPillText, { color: colors.foreground }]}>{tag}</Text>
              </View>
            ))}
          </View>
        </Section>
      ) : null}
    </ScrollView>
  );
}

// ---------------- Tab: Site Notes ----------------
function SiteNotesTab({ data }: { data: PropertyDetail }) {
  const colors = useColors();
  const { t } = useT();
  const q = data.siteNotesQuick;
  const quickRows: Array<{ label: string; value: string | null }> = [
    { label: t("property.quick.gateCode"), value: q.gateCode },
    {
      label: t("property.quick.petStations"),
      value: q.petStationCount != null ? String(q.petStationCount) : null,
    },
    { label: t("property.quick.petLocations"), value: q.petStationLocations },
    { label: t("property.quick.irrigation"), value: q.irrigationControllerLocations },
    { label: t("property.quick.access"), value: q.accessNotes },
    { label: t("property.quick.watchOut"), value: q.watchOutNotes },
  ];
  const hasQuick = quickRows.some((r) => r.value);

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.tabContent}>
      {hasQuick ? (
        <Section title={t("property.section.quickNotes")}>
          {quickRows.map((r) =>
            r.value ? (
              <View key={r.label} style={[styles.factRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.factLabel, { color: colors.mutedForeground }]}>{r.label}</Text>
                <Text style={[styles.factValue, { color: colors.foreground }]}>{r.value}</Text>
              </View>
            ) : null,
          )}
        </Section>
      ) : null}

      {data.siteNotes.length > 0 ? (
        <Section title={t("property.section.curatedNotes")}>
          {data.siteNotes.map((n) => (
            <View key={n.id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <View style={styles.noteHeaderRow}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>{n.label}</Text>
                {n.serviceType ? (
                  <View style={[styles.tagPill, { backgroundColor: colors.muted }]}>
                    <Text style={[styles.tagPillText, { color: colors.foreground }]}>{n.serviceType}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.noteValue, { color: colors.foreground }]}>{n.value}</Text>
            </View>
          ))}
        </Section>
      ) : !hasQuick ? (
        <EmptyCard
          title={t("property.empty.siteNotes.title")}
          body={t("property.empty.siteNotes.body")}
        />
      ) : null}
    </ScrollView>
  );
}

// ---------------- Tab: Services ----------------
function ServicesTab({ data }: { data: PropertyDetail }) {
  const colors = useColors();
  const { t } = useT();

  if (data.contracts.length === 0) {
    return (
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.tabContent}>
        <EmptyCard
          title={t("property.empty.services.title")}
          body={t("property.empty.services.body")}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.tabContent}>
      {data.contracts.map((c) => (
        <View key={c.id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={styles.noteHeaderRow}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>{c.serviceType}</Text>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor:
                    c.status === "active"
                      ? colors.primary + "1A"
                      : c.status === "paused"
                        ? "#fef3c7"
                        : colors.muted,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusPillText,
                  {
                    color:
                      c.status === "active"
                        ? colors.primary
                        : c.status === "paused"
                          ? "#92400e"
                          : colors.mutedForeground,
                  },
                ]}
              >
                {c.status.toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
            {c.billingPattern}
            {c.startDate ? ` · ${c.startDate}` : ""}
            {c.endDate ? ` → ${c.endDate}` : ""}
          </Text>
          {c.po ? (
            <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>PO: {c.po}</Text>
          ) : null}
          {c.notes ? (
            <View style={[styles.exclusionsBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <Text style={[styles.exclusionsLabel, { color: colors.mutedForeground }]}>
                {t("property.services.notIncluded").toUpperCase()}
              </Text>
              <Text style={[styles.exclusionsText, { color: colors.foreground }]}>{c.notes}</Text>
            </View>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

// ---------------- Tab: Map ----------------
function MapTab({ data }: { data: PropertyDetail }) {
  const colors = useColors();
  const { t } = useT();

  if (data.maps.length === 0) {
    return (
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.tabContent}>
        <EmptyCard
          title={t("property.empty.maps.title")}
          body={t("property.empty.maps.body")}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.tabContent}>
      {data.maps.map((m) => (
        <MapSheetCard key={m.id} sheet={m} t={t} />
      ))}
    </ScrollView>
  );
}

// Renders one visual scope sheet card, with an inline error fallback for the
// auth-gated PNG so users see a clear placeholder + "Open editor" CTA instead
// of a broken image when the bearer-token request 401s on the export route.
function MapSheetCard({ sheet, t }: { sheet: MapSheet; t: (k: string) => string }) {
  const colors = useColors();
  const [errored, setErrored] = useState(false);
  const imgUrl = sheet.combinedPngPath ? `${BASE_URL}${sheet.combinedPngPath}` : null;
  const editorUrl = `${BASE_URL}${sheet.editorPath}`;
  const showImage = imgUrl && !errored;
  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={styles.noteHeaderRow}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>{sheet.title}</Text>
        <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{sheet.scopeDate}</Text>
      </View>
      {showImage ? (
        <Image
          source={{ uri: imgUrl! }}
          style={styles.mapImage}
          resizeMode="cover"
          accessibilityLabel={sheet.title}
          onError={() => setErrored(true)}
        />
      ) : (
        <View style={[styles.mapPlaceholder, { backgroundColor: colors.muted }]}>
          <Feather name="map" size={24} color={colors.mutedForeground} />
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium", marginTop: 6 }}>
            {errored ? t("property.map.unavailable") : t("property.map.noImage")}
          </Text>
        </View>
      )}
      <Pressable
        onPress={() => {
          Linking.openURL(editorUrl).catch(() => Alert.alert(t("property.map.editorUnavailable")));
        }}
        style={({ pressed }) => [
          styles.openEditorBtn,
          { borderColor: colors.primary, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Feather name="external-link" size={14} color={colors.primary} />
        <Text style={[styles.openEditorText, { color: colors.primary }]}>
          {t("property.map.openEditor")}
        </Text>
      </Pressable>
    </View>
  );
}

// ---------------- Tab: History ----------------
// Shows completed visits, reverse chronological by completedAt (server-sorted).
function HistoryTab({ data, onTicket }: { data: PropertyDetail; onTicket: (id: string) => void }) {
  const colors = useColors();
  const { t } = useT();

  if (data.completedVisits.length === 0) {
    return (
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.tabContent}>
        <EmptyCard title={t("property.empty.history.title")} body={t("property.empty.history.body")} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.tabContent}>
      {data.completedVisits.map((tk) => (
        <Pressable
          key={tk.id}
          onPress={() => onTicket(tk.id)}
          style={({ pressed }) => [
            styles.card,
            {
              borderColor: colors.border,
              backgroundColor: pressed ? colors.muted : colors.card,
            },
          ]}
        >
          <View style={styles.noteHeaderRow}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
              {tk.title}
            </Text>
            {tk.completedAt ? (
              <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                {new Date(tk.completedAt).toLocaleDateString()}
              </Text>
            ) : null}
          </View>
          <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
            {tk.serviceType ?? tk.status ?? "—"}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

// ---------------- Tab: Photos ----------------
// 3-column grid; tap any tile to open a fullscreen lightbox viewer.
function PhotosTab({ data }: { data: PropertyDetail }) {
  const colors = useColors();
  const { t } = useT();
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  if (data.photos.length === 0) {
    return (
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.tabContent}>
        <EmptyCard title={t("property.empty.photos.title")} body={t("property.empty.photos.body")} />
      </ScrollView>
    );
  }

  const resolveUri = (path: string) => (path.startsWith("http") ? path : `${BASE_URL}${path}`);
  const active = activeIdx != null ? data.photos[activeIdx] : null;

  return (
    <>
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.tabContent}>
        <View style={styles.photoGrid}>
          {data.photos.map((p, i) => (
            <PhotoTile
              key={`${p.path}-${i}`}
              uri={resolveUri(p.path)}
              label={p.ticketTitle}
              onPress={() => setActiveIdx(i)}
            />
          ))}
        </View>
      </ScrollView>

      <Modal
        visible={active != null}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveIdx(null)}
        statusBarTranslucent
      >
        <View style={styles.lightboxBackdrop}>
          <StatusBar barStyle="light-content" />
          {active ? (
            <>
              <LightboxImage uri={resolveUri(active.path)} t={t} />
              <View style={styles.lightboxCaptionWrap}>
                <Text style={styles.lightboxCaption} numberOfLines={2}>
                  {active.ticketTitle}
                  {active.takenAt ? ` · ${new Date(active.takenAt).toLocaleDateString()}` : ""}
                </Text>
              </View>
              <Pressable
                onPress={() => setActiveIdx(null)}
                hitSlop={20}
                style={styles.lightboxClose}
                accessibilityLabel={t("common.close")}
              >
                <Feather name="x" size={24} color="#fff" />
              </Pressable>
            </>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

// PhotoTile / LightboxImage: tiny wrappers that swap in a placeholder if the
// auth-gated image fails to load (mobile bearer tokens currently can't reach
// the web-session-only object-storage URLs — see follow-up #425).
function PhotoTile({ uri, label, onPress }: { uri: string; label: string; onPress: () => void }) {
  const colors = useColors();
  const [errored, setErrored] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      style={[styles.photoCell, { borderColor: colors.border }]}
      accessibilityRole="imagebutton"
      accessibilityLabel={label}
    >
      {errored ? (
        <View style={[styles.photoFallback, { backgroundColor: colors.muted }]}>
          <Feather name="image" size={20} color={colors.mutedForeground} />
        </View>
      ) : (
        <Image
          source={{ uri }}
          style={styles.photoImg}
          resizeMode="cover"
          onError={() => setErrored(true)}
        />
      )}
    </Pressable>
  );
}

function LightboxImage({ uri, t }: { uri: string; t: (k: string) => string }) {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return (
      <View style={styles.lightboxFallback}>
        <Feather name="image" size={48} color="#fff" />
        <Text style={styles.lightboxFallbackText}>{t("property.photos.unavailable")}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={styles.lightboxImg}
      resizeMode="contain"
      onError={() => setErrored(true)}
    />
  );
}

// ---------------- Helpers ----------------
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title.toUpperCase()}</Text>
      <View style={{ gap: 8 }}>{children}</View>
    </View>
  );
}

function EmptyCard({ title, body }: { title: string; body: string }) {
  const colors = useColors();
  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Text style={[styles.cardTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  retry: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  headerActions: { flexDirection: "row", gap: 8, marginRight: 12 },
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  headerBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },

  tabContent: { padding: 16, paddingBottom: 48 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 0.5, marginBottom: 8 },

  factRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 12,
  },
  factLabel: { fontFamily: "Inter_500Medium", fontSize: 13, flex: 1 },
  factValue: { fontFamily: "Inter_600SemiBold", fontSize: 13, flex: 1.5, textAlign: "right" },

  card: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 6 },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15, flexShrink: 1 },
  cardSub: { fontFamily: "Inter_400Regular", fontSize: 13 },
  link: { fontFamily: "Inter_500Medium", fontSize: 14, marginTop: 4 },

  noteHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  noteValue: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20, marginTop: 4 },

  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tagPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  tagPillText: { fontFamily: "Inter_500Medium", fontSize: 12 },

  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusPillText: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.5 },

  mapImage: { width: "100%", aspectRatio: 16 / 10, borderRadius: 8, marginTop: 8 },
  mapPlaceholder: {
    width: "100%",
    aspectRatio: 16 / 10,
    borderRadius: 8,
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  // 3-column grid: each cell is ~32% wide so 3 fit per row with gaps.
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  photoCell: { width: "32%", borderWidth: 1, borderRadius: 10, overflow: "hidden" },
  photoImg: { width: "100%", aspectRatio: 1 },
  photoFallback: { width: "100%", aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  lightboxFallback: { alignItems: "center", justifyContent: "center", gap: 12 },
  lightboxFallbackText: { color: "#fff", fontFamily: "Inter_500Medium", fontSize: 14 },

  lightboxBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  lightboxImg: { width: "100%", height: "85%" },
  lightboxCaptionWrap: {
    position: "absolute",
    bottom: 32,
    left: 16,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 8,
  },
  lightboxCaption: { color: "#fff", fontFamily: "Inter_500Medium", fontSize: 13, textAlign: "center" },
  lightboxClose: {
    position: "absolute",
    top: 48,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },

  exclusionsBox: { marginTop: 8, padding: 10, borderWidth: 1, borderRadius: 8, gap: 4 },
  exclusionsLabel: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.5 },
  exclusionsText: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18 },

  openEditorBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
  },
  openEditorText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
});
