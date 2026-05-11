import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/i18n";

const ROLE_LABELS: Record<string, string> = {
  crew_supervisor: "Crew Supervisor",
  field_manager: "Field Manager",
  landscape_supervisor: "Landscape Supervisor",
  admin: "Admin",
  office: "Office",
  field: "Field",
  chemical_manager: "Chemical Manager",
  irrigation_manager: "Irrigation Manager",
  shop_manager: "Shop Manager",
  mapping: "Mapping",
};

export default function MeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, signOut, signingIn } = useAuth();
  const { t, lang, setLang } = useT();
  const [loggingOut, setLoggingOut] = React.useState(false);

  const onLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
    >
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.name, { color: colors.foreground }]}>{user?.name ?? "—"}</Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          {ROLE_LABELS[user?.activeRole ?? ""] ?? user?.activeRole ?? ""}
        </Text>
        {user?.email ? (
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>{user.email}</Text>
        ) : null}
        {user?.phone ? (
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>{user.phone}</Text>
        ) : null}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          {t("me.language")}
        </Text>
        <View style={styles.row}>
          {(["en", "es"] as const).map((code) => {
            const active = lang === code;
            return (
              <Pressable
                key={code}
                onPress={() => setLang(code)}
                style={({ pressed }) => [
                  styles.langBtn,
                  {
                    backgroundColor: active ? colors.primary : colors.background,
                    borderColor: active ? colors.primary : colors.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    color: active ? colors.primaryForeground : colors.foreground,
                  }}
                >
                  {code === "en" ? "English" : "Español"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable
        onPress={onLogout}
        disabled={loggingOut || signingIn}
        style={({ pressed }) => [
          styles.logout,
          {
            backgroundColor: colors.destructive,
            opacity: pressed || loggingOut ? 0.85 : 1,
          },
        ]}
      >
        {loggingOut ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }}>
            {t("me.logout")}
          </Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 20, gap: 16 },
  card: { borderWidth: 1, borderRadius: 16, padding: 20, gap: 6 },
  name: { fontFamily: "Inter_700Bold", fontSize: 22 },
  meta: { fontFamily: "Inter_400Regular", fontSize: 14 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, marginBottom: 8 },
  row: { flexDirection: "row", gap: 12 },
  langBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 12,
  },
  logout: {
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
});
