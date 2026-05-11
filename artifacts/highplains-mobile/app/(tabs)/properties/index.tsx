import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useT } from "@/i18n";

export default function PropertiesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
    >
      <Text style={[styles.title, { color: colors.foreground }]}>{t("properties.title")}</Text>
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
        {t("properties.subtitle")}
      </Text>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>
          {t("properties.empty.title")}
        </Text>
        <Text style={[styles.cardBody, { color: colors.mutedForeground }]}>
          {t("properties.empty.body")}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 20, gap: 12 },
  title: { fontFamily: "Inter_700Bold", fontSize: 24 },
  sub: { fontFamily: "Inter_400Regular", fontSize: 15 },
  card: { borderWidth: 1, borderRadius: 16, padding: 20, marginTop: 8, gap: 8 },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 17 },
  cardBody: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20 },
});
