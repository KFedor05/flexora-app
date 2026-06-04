import { initI18n, applyTranslations } from "./i18n/index.js";
import { setupWindowControls } from "./window.js";
import * as api from "./api/index.js";
import { initRouter, goto, getLastView } from "./ui/router.js";
import { initTheme } from "./ui/theme.js";
import { openSettings } from "./ui/settings.js";

// Expose API in the webview console for manual testing during development.
window.flexora = api;

async function bootstrap() {
  // Theme + language are applied before any UI render so the first paint
  // already matches the user's stored preferences.
  let settings = null;
  try {
    settings = await api.getSettings();
  } catch (err) {
    console.error("load settings failed", err);
  }
  initTheme(settings?.theme ?? "system");

  await initI18n(settings?.language ?? "en");
  applyTranslations(document);
  setupWindowControls();

  document.querySelectorAll("[data-action=open-settings]").forEach((el) => {
    el.addEventListener("click", () => openSettings());
  });

  const mainRoot = document.getElementById("main-content");
  if (mainRoot) {
    initRouter(mainRoot);
    // openToToday: true (default) — always land on Today.
    // openToToday: false — restore the last visited top-level view, falling
    // back to editor (the structural view) when nothing is remembered yet.
    let startView = "today";
    if (settings?.openToToday === false) {
      startView = getLastView() || "editor";
    }
    await goto(startView);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  bootstrap();
});
