import type { Locale } from "./dictionaries";

const KEY = "xp.locale";

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "es";
}

export function getStoredLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return isLocale(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function detectDefaultLocale(): Locale {
  if (typeof navigator === "undefined") return "es";
  const lang = navigator.language?.toLowerCase() || "";
  return lang.startsWith("en") ? "en" : "es";
}

export function getLocale(): Locale {
  return getStoredLocale() ?? detectDefaultLocale();
}

export function setLocale(locale: Locale) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, locale);
  window.dispatchEvent(new Event("xp-locale"));
}
