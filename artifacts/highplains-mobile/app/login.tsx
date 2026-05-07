import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Logo } from "@/components/Logo";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/i18n";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signIn, signingIn, error } = useAuth();
  const { t, lang, setLang } = useT();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const onSubmit = async () => {
    setLocalError(null);
    try {
      await signIn(username.trim(), password);
    } catch {
      setLocalError(t("login.error"));
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.flex, { backgroundColor: colors.background }]}
    >
      <View
        style={[
          styles.container,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 },
        ]}
      >
        <View style={styles.header}>
          <Logo size={84} />
          <Text style={[styles.brand, { color: colors.foreground }]}>HIGH PLAINS</Text>
          <Text style={[styles.brandSub, { color: colors.mutedForeground }]}>
            Property Maintenance
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t("login.welcome")}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {t("login.subtitle")}
          </Text>

          <Text style={[styles.label, { color: colors.foreground }]}>{t("login.username")}</Text>
          <TextInput
            style={[
              styles.input,
              { borderColor: colors.input, color: colors.foreground, backgroundColor: colors.background },
            ]}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!signingIn}
            placeholderTextColor={colors.mutedForeground}
          />

          <Text style={[styles.label, { color: colors.foreground }]}>{t("login.password")}</Text>
          <TextInput
            style={[
              styles.input,
              { borderColor: colors.input, color: colors.foreground, backgroundColor: colors.background },
            ]}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!signingIn}
            placeholderTextColor={colors.mutedForeground}
          />

          {(localError || error) ? (
            <Text style={[styles.error, { color: colors.destructive }]}>
              {localError || error}
            </Text>
          ) : null}

          <Pressable
            onPress={onSubmit}
            disabled={signingIn || !username || !password}
            style={({ pressed }) => [
              styles.button,
              {
                backgroundColor: colors.primary,
                opacity: signingIn || !username || !password ? 0.6 : pressed ? 0.85 : 1,
              },
            ]}
          >
            {signingIn ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
                {t("login.signIn")}
              </Text>
            )}
          </Pressable>
        </View>

        <View style={styles.langRow}>
          {(["en", "es"] as const).map((l) => (
            <Pressable key={l} onPress={() => setLang(l)} style={styles.langBtn}>
              <Text
                style={{
                  color: lang === l ? colors.primary : colors.mutedForeground,
                  fontWeight: lang === l ? "700" : "500",
                  fontFamily: lang === l ? "Inter_700Bold" : "Inter_500Medium",
                }}
              >
                {l === "en" ? "English" : "Español"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 24, justifyContent: "center" },
  header: { alignItems: "center", marginBottom: 32, gap: 8 },
  brand: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: 2, marginTop: 12 },
  brandSub: { fontSize: 13, fontFamily: "Inter_500Medium", letterSpacing: 1 },
  card: { borderWidth: 1, borderRadius: 12, padding: 20, gap: 8 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 8 },
  label: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  error: { marginTop: 8, fontSize: 13, fontFamily: "Inter_500Medium" },
  button: {
    marginTop: 16,
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  langRow: { flexDirection: "row", justifyContent: "center", gap: 16, marginTop: 24 },
  langBtn: { paddingHorizontal: 8, paddingVertical: 4 },
});
