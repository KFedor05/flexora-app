import { initI18n, applyTranslations } from "./i18n/index.js";
import { setupWindowControls } from "./window.js";
import * as api from "./api/index.js";
import { initRouter, goto, getLastView, remount } from "./ui/router.js";
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

  scheduleMidnightTick();
}

// Re-render the current view once the wall-clock date changes so that:
//   - the Today screen rolls over to the new day (fresh `api.todayIso()`,
//     empty checkboxes, counters reset)
//   - the calendar's verdict for the day that just ended materialises
//     (red / orange / green) without the user having to interact
//
// We aim for 00:00:01 to be safely past the boundary, then reschedule for
// the next midnight. If the system slept across midnight, the timeout
// fires on wake; if it's been awake the whole time, it fires on the dot.
function scheduleMidnightTick() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1, 0);
  const delay = Math.max(1000, next.getTime() - now.getTime());
  setTimeout(async () => {
    try {
      await remount();
    } catch (err) {
      console.error("midnight remount failed", err);
    }
    scheduleMidnightTick();
  }, delay);
}

window.addEventListener("DOMContentLoaded", () => {
  bootstrap();
});
