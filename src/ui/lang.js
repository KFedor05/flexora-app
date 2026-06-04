/**
 * Language controller. Persists choice via `update_settings` and reapplies
 * translations live. Mirrors the shape of theme.js so settings.js can treat
 * both groups uniformly.
 */

import * as api from "../api/index.js";
import { i18next, SUPPORTED_LANGS, applyTranslations } from "../i18n/index.js";

export function getLang() {
  return i18next.language;
}

export async function setLang(lng) {
  if (!SUPPORTED_LANGS.includes(lng)) return;
  await i18next.changeLanguage(lng);
  document.documentElement.lang = lng;
  applyTranslations(document);
  try {
    await api.updateSettings({ language: lng });
  } catch (err) {
    console.error("persist language failed", err);
  }
}
