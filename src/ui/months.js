/**
 * Months view — list of all months of a single year. Future months are hidden.
 */

import * as api from "../api/index.js";
import { goto } from "./router.js";
import { openHabitForm } from "./forms/habit-form.js";
import { t, i18next } from "../i18n/index.js";
import { ICONS } from "./icons.js";

const state = {
  root: null,
  year: 0,
  today: null,
  appData: null,
  months: null,
};

export async function mountMonths(root, params) {
  state.root = root;
  const rightPanel = document.getElementById("right-panel");
  if (rightPanel) rightPanel.style.display = "none";

  state.today = await api.todayIso();
  state.year = params?.year ?? Number(state.today.slice(0, 4));
  await reload();
}

async function reload() {
  const [months, appData] = await Promise.all([
    api.getYear(state.year),
    api.loadAppData(),
  ]);
  state.months = months;
  state.appData = appData;
  render();
}

function render() {
  const root = state.root;
  root.innerHTML = "";
  const todayYear = Number(state.today.slice(0, 4));
  const todayMonth = Number(state.today.slice(5, 7));

  const header = document.createElement("header");
  header.className = "page-header";
  header.innerHTML = `
    <div class="title-row">
      <h1 class="page-title">${escape(t("nav.diary"))}</h1>
      <span class="date-pill-soft">
        ${ICON_CALENDAR}
        <span>${state.year}</span>
      </span>
    </div>
    <div class="today-actions">
      <button type="button" class="nav-btn" data-action="back">${escape(t("nav.back"))}</button>
      <button type="button" class="nav-btn ${prevYearDisabled() ? "muted" : ""}" data-action="prev" ${prevYearDisabled() ? "disabled" : ""}>${escape(t("nav.prevYear"))}</button>
      <button type="button" class="nav-btn ${state.year >= todayYear ? "muted" : ""}" data-action="next" ${state.year >= todayYear ? "disabled" : ""}>${escape(t("nav.nextYear"))}</button>
      <button type="button" class="nav-btn" data-action="today">${escape(t("today.todayButton"))}</button>
      <button type="button" class="nav-btn" data-action="by-days">${escape(t("today.byDays"))}</button>
      <button type="button" class="btn-icon-circle" data-action="new-habit" title="${escape(t("today.newHabit"))}">${ICONS.plus}</button>
    </div>
  `;
  root.appendChild(header);

  const hint = document.createElement("p");
  hint.className = "page-hint";
  hint.textContent = t("nav.monthsHint");
  root.appendChild(hint);

  const yearHeading = document.createElement("h2");
  yearHeading.className = "page-h2";
  yearHeading.textContent = String(state.year);
  root.appendChild(yearHeading);

  const sectionLabel = document.createElement("div");
  sectionLabel.className = "page-section-label";
  sectionLabel.textContent = t("nav.months");
  root.appendChild(sectionLabel);

  const list = document.createElement("div");
  list.className = "day-list-rows";
  const earliestHabitMonth = earliestHabitMonthInYear(state.year);
  const isCurrentYear = state.year === todayYear;
  // Show a month if: (1) it has any recorded activity (green/orange/red),
  // (2) a habit was already active during it, or (3) it's the current month
  // of the current year (we always want to land somewhere clickable).
  const visible = state.months.filter((m) => {
    const inPast = state.year < todayYear || (isCurrentYear && m.month <= todayMonth);
    if (!inPast) return false;
    const hasActivity = m.green + m.orange + m.red > 0;
    const habitActive = earliestHabitMonth != null && m.month >= earliestHabitMonth;
    const isCurrentMonth = isCurrentYear && m.month === todayMonth;
    return hasActivity || habitActive || isCurrentMonth;
  });
  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "page-empty";
    empty.textContent = t("nav.monthsEmpty");
    list.appendChild(empty);
  } else {
    visible.forEach((m) => list.appendChild(renderMonthRow(m, todayYear, todayMonth)));
  }
  root.appendChild(list);

  if (visible.length < state.months.length) {
    const trailing = document.createElement("p");
    trailing.className = "page-hint trailing";
    trailing.textContent = t("nav.monthsTrailing");
    root.appendChild(trailing);
  }

  header.querySelector("[data-action=back]").addEventListener("click", () => goto("years"));
  const prevBtn = header.querySelector("[data-action=prev]");
  if (!prevBtn.disabled) prevBtn.addEventListener("click", () => navYear(-1));
  const nextBtn = header.querySelector("[data-action=next]");
  if (!nextBtn.disabled) nextBtn.addEventListener("click", () => navYear(1));
  header.querySelector("[data-action=today]").addEventListener("click", () => goto("today"));
  header.querySelector("[data-action=by-days]").addEventListener("click", () => goto("editor"));
  header.querySelector("[data-action=new-habit]").addEventListener("click", () => openHabitForm({
    kind: "checkbox",
    sections: state.appData.sections,
    onSaved: () => reload(),
  }));
}

function renderMonthRow(monthBrief, todayYear, todayMonth) {
  const row = document.createElement("div");
  const isCurrent = state.year === todayYear && monthBrief.month === todayMonth;
  row.className = `day-list-row${isCurrent ? " current" : ""}`;
  const label = formatMonthYear(monthBrief.year, monthBrief.month);
  row.innerHTML = `
    <span class="day-list-icon">${ICON_FILE}</span>
    <span class="day-list-name strong">${escape(label)}</span>
    ${isCurrent
      ? `<span class="today-badge today-badge-row">${escape(t("nav.currentBadge"))}</span>`
      : `<span class="day-list-stat">
          <span class="stat-mini"><span class="stat-dot green"></span>${monthBrief.green}</span>
          <span class="stat-mini"><span class="stat-dot orange"></span>${monthBrief.orange}</span>
          <span class="stat-mini"><span class="stat-dot red"></span>${monthBrief.red}</span>
        </span>`}
  `;
  row.addEventListener("click", () => goto("days", { year: monthBrief.year, month: monthBrief.month }));
  return row;
}

function navYear(delta) {
  const todayYear = Number(state.today.slice(0, 4));
  const next = state.year + delta;
  if (next > todayYear) return;
  if (delta < 0 && !hasHabitInOrBeforeYear(next)) return;
  state.year = next;
  reload();
}

function hasHabitInOrBeforeYear(year) {
  const yearEnd = `${year}-12-31`;
  return (state.appData?.habits ?? []).some(
    (h) => !h.archived && h.startDate <= yearEnd,
  );
}

// Earliest month (1-12) where any non-archived habit was active during the
// given year. Returns null if no habit reaches that year.
function earliestHabitMonthInYear(year) {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  let earliest = null;
  for (const h of state.appData?.habits ?? []) {
    if (h.archived) continue;
    if (h.startDate > yearEnd) continue;
    const monthInYear = h.startDate < yearStart ? 1 : Number(h.startDate.slice(5, 7));
    if (earliest == null || monthInYear < earliest) earliest = monthInYear;
  }
  return earliest;
}

function prevYearDisabled() {
  return !hasHabitInOrBeforeYear(state.year - 1);
}

function formatMonthYear(year, month) {
  const d = new Date(year, month - 1, 1);
  try {
    return new Intl.DateTimeFormat(safeLocale(), { month: "long", year: "numeric" }).format(d);
  } catch {
    return `${month}/${year}`;
  }
}

function safeLocale() {
  const c = i18next.language;
  if (!c || c === "C" || c === "POSIX") return "en";
  try { new Intl.DateTimeFormat(c); return c; } catch { return "en"; }
}

function escape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const ICON_CALENDAR = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`;
const ICON_FILE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`;
