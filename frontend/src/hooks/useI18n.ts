/**
 * Lightweight i18n hook that loads locale JSON files from /locales/{lang}.json.
 * Falls back to en-US for missing keys.
 */

import { signal, computed } from "@preact/signals";

// ─── reactive state ────────────────────────────────────────────────────

export const currentLang = signal("en-US");

const _cache = new Map<string, Record<string, string | object>>();
const _dict = signal<Record<string, string | object>>({});
const _fallback = signal<Record<string, string | object>>({});

async function loadLocale(lang: string): Promise<Record<string, string | object>> {
  if (_cache.has(lang)) return _cache.get(lang)!;
  try {
    const res = await fetch(`/locales/${lang}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    _cache.set(lang, data);
    return data;
  } catch {
    console.warn(`[i18n] Could not load locale "${lang}"`);
    return {};
  }
}

/** Load or switch language. Call once on startup and when the user changes lang. */
export async function setLanguage(lang: string): Promise<void> {
  currentLang.value = lang;
  _dict.value = await loadLocale(lang);
  if (lang !== "en-US") {
    _fallback.value = await loadLocale("en-US");
  }
}

// ─── translation function ──────────────────────────────────────────────

/**
 * Translate a key. Supports {0}, {1} placeholders.
 * For plural objects ({ single, multiple }), pass the count as the first arg.
 */
export const t = computed(() => {
  const dict = _dict.value;
  const fb = _fallback.value;

  return (key: string, ...args: (string | number)[]): string => {
    let val: string | object | undefined = dict[key] ?? fb[key];
    if (val === undefined) return key;

    // Handle plural objects
    if (typeof val === "object" && val !== null && "single" in val) {
      const count = typeof args[0] === "number" ? args[0] : 1;
      val = count === 1 ? (val as any).single : (val as any).multiple;
    }

    let result = String(val);
    // Replace {0}, {1}, ... placeholders
    for (let i = 0; i < args.length; i++) {
      result = result.replace(`{${i}}`, String(args[i]));
    }
    return result;
  };
});

// Initialize with en-US on load
setLanguage("en-US");
