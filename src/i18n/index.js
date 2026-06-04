import i18next from "i18next";

import en from "../locales/en.json";
import ru from "../locales/ru.json";

export const SUPPORTED_LANGS = ["en", "ru"];

/**
 * Initialise i18next.
 *
 * `initial` is the language pulled from `settings.language` on the Rust side
 * — it's the source of truth, not localStorage. Falls back to "en" if Rust
 * returns something unsupported (e.g. legacy data).
 */
export async function initI18n(initial = "en") {
  const lng = SUPPORTED_LANGS.includes(initial) ? initial : "en";
  await i18next.init({
    lng,
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGS,
    resources: {
      en: { translation: en },
      ru: { translation: ru },
    },
    interpolation: { escapeValue: false },
  });
  document.documentElement.lang = lng;
  return i18next;
}

export function applyTranslations(root) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const translated = i18next.t(key);
    if (translated && translated !== key) {
      el.textContent = translated;
    }
  });
}

/** Raw translate. Returns the key itself if not found. */
export function t(key, opts) {
  return i18next.t(key, opts);
}

export { i18next };
