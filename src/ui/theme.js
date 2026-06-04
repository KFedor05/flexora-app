/**
 * Theme controller.
 *
 *   - "dark"  / "light" — force the corresponding palette
 *   - "system"          — follow the OS-level `prefers-color-scheme` and
 *                          react to changes live
 *
 * The active palette is applied by setting `data-theme="dark|light"` on the
 * <html> element. CSS variables defined in `styles.css` switch in place.
 */

import * as api from "../api/index.js";

const VALID_CHOICES = new Set(["system", "light", "dark"]);

const state = {
  choice: "system", // ThemeChoice
  mq: null, // MediaQueryList for prefers-color-scheme: dark
  onSystemChange: null,
};

function resolvedPalette(choice) {
  if (choice === "system") {
    return state.mq && state.mq.matches ? "dark" : "light";
  }
  return choice;
}

function paint(choice) {
  const palette = resolvedPalette(choice);
  document.documentElement.setAttribute("data-theme", palette);
}

function attachSystemListener() {
  if (state.mq) return;
  if (typeof window.matchMedia !== "function") return;
  state.mq = window.matchMedia("(prefers-color-scheme: dark)");
  state.onSystemChange = () => {
    if (state.choice === "system") paint("system");
  };
  // Older WebKit only exposes addListener / removeListener
  if (state.mq.addEventListener) state.mq.addEventListener("change", state.onSystemChange);
  else if (state.mq.addListener) state.mq.addListener(state.onSystemChange);
}

export function initTheme(initialChoice) {
  attachSystemListener();
  state.choice = VALID_CHOICES.has(initialChoice) ? initialChoice : "system";
  paint(state.choice);
}

export function getTheme() {
  return state.choice;
}

/**
 * Update the theme. Re-paints immediately and persists via `update_settings`.
 * Optimistic — UI never waits for the round-trip.
 */
export async function setTheme(choice) {
  if (!VALID_CHOICES.has(choice)) return;
  state.choice = choice;
  paint(choice);
  try {
    await api.updateSettings({ theme: choice });
  } catch (err) {
    console.error("persist theme failed", err);
  }
}
