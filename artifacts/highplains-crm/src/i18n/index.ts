import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en";
import es from "./locales/es";
import { conversationsEn, conversationsEs } from "./locales/threads";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en, conversations: conversationsEn },
    es: { translation: es, conversations: conversationsEs },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
