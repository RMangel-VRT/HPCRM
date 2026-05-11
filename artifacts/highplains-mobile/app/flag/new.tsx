import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useT } from "@/i18n";

// Stub Flag composer used by every "+ Flag" entry point until the real
// composer ships. Accepts pre-fill query params (currently `propertyId` and
// `propertyName`) and renders them so supervisors can see what context the
// flag will carry. When the real composer lands, it will read the same
// `useLocalSearchParams` shape and the entry points won't need to change.
export default function NewFlagScreen() {
  const colors = useColors();
  const { t } = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ propertyId?: string; propertyName?: string; ticketId?: string }>();
  const hasPrefill = Boolean(params.propertyId || params.ticketId);

  return (
    <>
      <Stack.Screen options={{ title: t("flag.composerTitle") }} />
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.foreground }]}>{t("flag.comingSoonTitle")}</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>{t("flag.comingSoonBody")}</Text>

        {hasPrefill ? (
          <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>
              {t("flag.prefill.heading")}
            </Text>
            {params.propertyName ? (
              <View style={styles.kv}>
                <Text style={[styles.k, { color: colors.mutedForeground }]}>{t("flag.prefill.property")}</Text>
                <Text style={[styles.v, { color: colors.foreground }]}>{params.propertyName}</Text>
              </View>
            ) : null}
            {params.propertyId ? (
              <View style={styles.kv}>
                <Text style={[styles.k, { color: colors.mutedForeground }]}>{t("flag.prefill.propertyId")}</Text>
                <Text style={[styles.v, { color: colors.foreground }]} numberOfLines={1}>{params.propertyId}</Text>
              </View>
            ) : null}
            {params.ticketId ? (
              <View style={styles.kv}>
                <Text style={[styles.k, { color: colors.mutedForeground }]}>{t("flag.prefill.ticketId")}</Text>
                <Text style={[styles.v, { color: colors.foreground }]} numberOfLines={1}>{params.ticketId}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.btnText, { color: colors.primaryForeground }]}>{t("common.back")}</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 16 },
  title: { fontFamily: "Inter_700Bold", fontSize: 20 },
  body: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 8 },
  cardLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 0.5 },
  kv: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  k: { fontFamily: "Inter_500Medium", fontSize: 13 },
  v: { fontFamily: "Inter_600SemiBold", fontSize: 13, flex: 1, textAlign: "right" },
  btn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10, alignItems: "center", marginTop: 8 },
  btnText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
});
