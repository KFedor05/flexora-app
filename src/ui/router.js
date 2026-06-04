/**
 * Tiny client-side view router. Two routes for now: "today" and "editor".
 * No URL plumbing — Tauri webview is single-page; we just swap mounted view.
 */

import { mountToday } from "./today.js";
import { mountEditor } from "./editor.js";
import { mountDays } from "./days.js";
import { mountMonths } from "./months.js";
import { mountYears } from "./years.js";

const LAST_VIEW_KEY = "flexora.lastView";

let root = null;
let currentView = null;

const VIEWS = {
  today: mountToday,
  editor: mountEditor,
  days: mountDays,
  months: mountMonths,
  years: mountYears,
};

export function initRouter(rootEl) {
  root = rootEl;
}

/** Last visited top-level view, persisted across sessions. */
export function getLastView() {
  try {
    const v = localStorage.getItem(LAST_VIEW_KEY);
    return v && Object.prototype.hasOwnProperty.call(VIEWS, v) ? v : null;
  } catch {
    return null;
  }
}

export async function goto(view, params) {
  if (!root) return;
  const mount = VIEWS[view];
  if (!mount) return;
  // Always run mount when params are supplied — they may change view state
  // (e.g. switching the Today date from the calendar).
  if (currentView === view && !params) return;
  currentView = view;
  try {
    localStorage.setItem(LAST_VIEW_KEY, view);
  } catch {
    /* private mode etc — non-fatal */
  }
  await mount(root, params);
}

/**
 * Force re-mount of the current view. Used after live language change so
 * strings rendered into innerHTML refresh without a full reload.
 */
export async function remount() {
  if (!root || !currentView) return;
  const mount = VIEWS[currentView];
  if (mount) await mount(root);
}
