"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import en from "@/locales/en.json";
import zh from "@/locales/zh.json";
import fr from "@/locales/fr.json";
import de from "@/locales/de.json";
import ja from "@/locales/ja.json";
import ko from "@/locales/ko.json";

export type LocaleCode = "en" | "zh" | "fr" | "de" | "ja" | "ko";

type LocaleMeta = {
  short: "US" | "CN" | "FR" | "DE" | "JP" | "KR";
  flag: string;
  menuLabel: string;
};

export const localeMeta: Record<LocaleCode, LocaleMeta> = {
  en: { short: "US", flag: "🇺🇸", menuLabel: "English" },
  zh: { short: "CN", flag: "🇨🇳", menuLabel: "简体中文" },
  fr: { short: "FR", flag: "🇫🇷", menuLabel: "Français" },
  de: { short: "DE", flag: "🇩🇪", menuLabel: "Deutsch" },
  ja: { short: "JP", flag: "🇯🇵", menuLabel: "日本語" },
  ko: { short: "KR", flag: "🇰🇷", menuLabel: "한국어" },
};

type Dict = Record<string, unknown>;

const dictionaries: Record<LocaleCode, Dict> = { en, zh, fr, de, ja, ko };

const LOCALE_KEY = "ark_locale";
const LOCALE_COOKIE = "ark_locale";

type I18nContextValue = {
  locale: LocaleCode;
  setLocale: (locale: LocaleCode) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readByPath(source: Dict, key: string): string | null {
  const direct = (source as Record<string, unknown>)[key];
  if (typeof direct === "string") return direct;

  const parts = key.split(".");
  let current: unknown = source;
  for (const part of parts) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : null;
}

function isLocaleCode(value: string | null): value is LocaleCode {
  return value === "en" || value === "zh" || value === "fr" || value === "de" || value === "ja" || value === "ko";
}

function readCookieLocale(): LocaleCode | null {
  if (typeof document === "undefined") return null;
  const found = document.cookie
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${LOCALE_COOKIE}=`));
  if (!found) return null;
  const value = decodeURIComponent(found.slice(LOCALE_COOKIE.length + 1));
  return isLocaleCode(value) ? value : null;
}

function persistLocale(locale: LocaleCode) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LOCALE_KEY, locale);
  }
  if (typeof document !== "undefined") {
    document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.documentElement.setAttribute("lang", locale);
  }
}

function getInitialLocale(initial?: LocaleCode): LocaleCode {
  if (typeof window === "undefined") return initial ?? "en";
  const fromStorage = window.localStorage.getItem(LOCALE_KEY);
  if (isLocaleCode(fromStorage)) return fromStorage;
  return readCookieLocale() ?? initial ?? "en";
}

export function I18nProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: LocaleCode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(() => getInitialLocale(initialLocale));

  useEffect(() => {
    persistLocale(locale);

    const onStorage = () => {
      const value = window.localStorage.getItem(LOCALE_KEY);
      if (isLocaleCode(value) && value !== locale) {
        setLocaleState(value);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [locale]);

  const setLocale = (next: LocaleCode) => {
    setLocaleState(next);
    persistLocale(next);
  };

  const t = useCallback((key: string): string => {
    const dict = dictionaries[locale] ?? dictionaries.en;
    return readByPath(dict, key) ?? readByPath(dictionaries.en, key) ?? key;
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside <I18nProvider>");
  return value;
}
