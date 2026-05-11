import { useLocalSearchParams } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useT } from "@/i18n";

export default function PropertyDetailPlaceholder() {
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useT();

  return (
    <ScrollView style={[styles.flex, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          {t("property.placeholderTitle")}
        </Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          {t("property.placeholderBody")}
        </Text>
        <Text style={[styles.id, { color: colors.mutedForeground }]}>ID: {id}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 20 },
  card: { borderWidth: 1, borderRadius: 16, padding: 20, gap: 8 },
  title: { fontFamily: "Inter_700Bold", fontSize: 20 },
  body: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20 },
  id: { fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 8 },
});
