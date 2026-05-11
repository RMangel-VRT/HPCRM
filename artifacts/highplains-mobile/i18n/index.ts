import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

import en from "./en";
import es from "./es";

export type Lang = "en" | "es";

const LANG_KEY = "hp.lang";

const dictionaries: Record<Lang, Record<string, string>> = { en, es };

let currentLang: Lang = "en";
const listeners = new Set<(l: Lang) => void>();

export async function loadInitialLang(): Promise<Lang> {
  const stored = (await AsyncStorage.getItem(LANG_KEY)) as Lang | null;
  if (stored === "en" || stored === "es") {
    currentLang = stored;
  }
  return currentLang;
}

export async function setLang(lang: Lang): Promise<void> {
  currentLang = lang;
  await AsyncStorage.setItem(LANG_KEY, lang);
  listeners.forEach((l) => l(lang));
}

export function getLang(): Lang {
  return currentLang;
}

export function t(key: string, vars?: Record<string, string | number>, fallback?: string): string {
  const raw = dictionaries[currentLang][key] ?? dictionaries.en[key] ?? fallback ?? key;
  if (!vars) return raw;
  return raw.replace(/\{\{(\w+)\}\}/g, (_, k: string) =>
    vars[k] !== undefined ? String(vars[k]) : `{{${k}}}`,
  );
}

export function useT() {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const fn = () => setVersion((v) => v + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return { t, lang: currentLang, setLang };
}
