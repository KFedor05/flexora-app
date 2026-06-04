/**
 * Days view — Notion-style list of all days in a single month. Only past
 * and present days appear; future days stay hidden by design.
 */

import * as api from "../api/index.js";
import { goto } from "./router.js";
import { openHabitForm } from "./forms/habit-form.js";
import { t, i18next } from "../i18n/index.js";
import { ICONS } from "./icons.js";

const state = {
  root: null,
  year: 0,
  month: 0,
  today: null,
  appData: null,
  briefs: null,
};

export async function mountDays(root, params) {
  state.root = root;
  const rightPanel = document.getElementById("right-panel");
  if (rightPanel) rightPanel.style.display = "none";

  state.today = await api.todayIso();
  const seed = params?.year
    ? { year: params.year, month: params.month }
    : monthOf(state.today);
  state.year = seed.year;
  state.month = seed.month;

  await reload();
}

async function reload() {
  const [briefs, appData] = await Promise.all([
    api.getMonth(state.year, state.month),
    api.loadAppData(),
  ]);
  state.briefs = briefs;
  state.appData = appData;
  render();
}

function render() {
  const root = state.root;
  root.innerHTML = "";
  const monthLabel = formatMonthYear(state.year, state.month);

  const header = document.createElement("header");
  header.className = "page-header";
  header.innerHTML = `
    <div class="title-row">
      <h1 class="page-title">${escape(t("nav.diary"))}</h1>
      <span class="date-pill-soft">
        ${ICON_CALENDAR}
        <span>${escape(monthLabel)}</span>
      </span>
    </div>
    <div class="today-actions">
      <button type="button" class="nav-btn" data-action="back">${escape(t("nav.back"))}</button>
      <button type="button" class="nav-btn ${prevDisabled() ? "muted" : ""}" data-action="prev" ${prevDisabled() ? "disabled" : ""}>${escape(t("nav.prevMonth"))}</button>
      <button type="button" class="nav-btn ${nextDisabled() ? "muted" : ""}" data-action="next" ${nextDisabled() ? "disabled" : ""}>${escape(t("nav.nextMonth"))}</button>
      <button type="button" class="nav-btn" data-action="today">${escape(t("today.todayButton"))}</button>
      <button type="button" class="nav-btn" data-action="by-days">${escape(t("today.byDays"))}</button>
      <button type="button" class="btn-icon-circle" data-action="new-habit" title="${escape(t("today.newHabit"))}">${ICONS.plus}</button>
    </div>
  `;
  root.appendChild(header);

  const hint = document.createElement("p");
  hint.className = "page-hint";
  hint.textContent = t("nav.daysHint");
  root.appendChild(hint);

  const monthHeading = document.createElement("h2");
  monthHeading.className = "page-h2";
  monthHeading.textContent = monthLabel;
  root.appendChild(monthHeading);

  const sectionLabel = document.createElement("div");
  sectionLabel.className = "page-section-label";
  sectionLabel.textContent = t("nav.daysOfMonth");
  root.appendChild(sectionLabel);

  const list = document.createElement("div");
  list.className = "day-list-rows";
  // A day is worth listing only if a habit was active on it (total > 0) or
  // the user actually recorded something (done/skipped/whole-day flag).
  // Past days with no habits at all are skipped — otherwise the diary fills
  // with empty rows for a fresh install.
  const naturalRows = state.briefs.filter(
    (b) =>
      b.date <= state.today &&
      (b.total > 0 || b.done > 0 || b.skipped > 0 || b.skippedWholeDay),
  );
  if (!naturalRows.length) {
    const empty = document.createElement("div");
    empty.className = "page-empty";
    empty.textContent = t("nav.daysEmpty");
    list.appendChild(empty);
  } else {
    naturalRows.forEach((b) => list.appendChild(renderDayRow(b)));
  }
  root.appendChild(list);

  if (naturalRows.length < state.briefs.length) {
    const trailing = document.createElement("p");
    trailing.className = "page-hint trailing";
    trailing.textContent = t("nav.daysTrailing");
    root.appendChild(trailing);
  }

  header.querySelector("[data-action=back]").addEventListener("click", () => goto("months", { year: state.year }));
  const prevBtn = header.querySelector("[data-action=prev]");
  if (prevDisabled()) prevBtn.disabled = true;
  if (!prevBtn.disabled) prevBtn.addEventListener("click", () => navMonth(-1));
  const nextBtn = header.querySelector("[data-action=next]");
  if (!nextBtn.disabled) nextBtn.addEventListener("click", () => navMonth(1));
  header.querySelector("[data-action=today]").addEventListener("click", () => goto("today"));
  header.querySelector("[data-action=by-days]").addEventListener("click", () => goto("editor"));
  header.querySelector("[data-action=new-habit]").addEventListener("click", () => openHabitForm({
    kind: "checkbox",
    sections: state.appData.sections,
    onSaved: () => reload(),
  }));
}

function renderDayRow(brief) {
  const row = document.createElement("div");
  const d = parseIso(brief.date);
  const wd = (d.getDay() + 6) % 7; // 0=Mon ... 6=Sun
  const isWeekend = wd === 5 || wd === 6;
  const isToday = brief.date === state.today;
  const dotClass = statDotClass(brief);

  let cls = "day-list-row";
  if (isWeekend) cls += " weekend";
  if (isToday) cls += " today";
  row.className = cls;
  row.dataset.date = brief.date;

  row.innerHTML = `
    <span class="day-list-icon">${ICON_FILE}</span>
    <span class="day-list-num">${d.getDate()}</span>
    <span class="day-list-name">${escape(formatWeekday(d))}</span>
    ${isToday
      ? `<span class="today-badge today-badge-row">${escape(t("today.todayBadge"))}</span>`
      : `<span class="day-list-stat"><span class="stat-dot ${dotClass}"></span>${escape(statLabel(brief))}</span>`}
  `;
  row.addEventListener("click", () => goto("today", { date: brief.date }));
  return row;
}

function statDotClass(brief) {
  if (brief.skippedWholeDay) return "green";
  switch (brief.dayStatus) {
    case "perfect":
      return "green";
    case "partial": {
      const ratio = brief.total > 0 ? (brief.done + brief.skipped) / brief.total : 0;
      return ratio >= 0.5 ? "orange" : "red";
    }
    case "skipped":
      return "green";
    default:
      return "empty";
  }
}

function statLabel(brief) {
  if (brief.skippedWholeDay) return t("nav.statSpecial");
  switch (brief.dayStatus) {
    case "perfect":
      return t("nav.statPerfect");
    case "partial": {
      const ratio = brief.total > 0 ? (brief.done + brief.skipped) / brief.total : 0;
      return ratio >= 0.5 ? t("nav.statMid") : t("nav.statLow");
    }
    case "skipped":
      return t("nav.statSpecial");
    default:
      return t("nav.statEmpty");
  }
}

function navMonth(delta) {
  let m = state.month + delta;
  let y = state.year;
  while (m < 1) { m += 12; y -= 1; }
  while (m > 12) { m -= 12; y += 1; }
  const todayPos = monthOf(state.today);
  if (y > todayPos.year || (y === todayPos.year && m > todayPos.month)) return;
  if (delta < 0 && !hasHabitInOrBefore(y, m)) return;
  state.year = y;
  state.month = m;
  reload();
}

function nextDisabled() {
  const todayPos = monthOf(state.today);
  return state.year === todayPos.year && state.month >= todayPos.month;
}

// True if no non-archived habit started in or before the given month — i.e.
// scrolling there would only show an empty page.
function hasHabitInOrBefore(year, month) {
  const monthEndIso = `${year}-${String(month).padStart(2, "0")}-31`;
  return (state.appData?.habits ?? []).some(
    (h) => !h.archived && h.startDate <= monthEndIso,
  );
}

function prevDisabled() {
  let m = state.month - 1;
  let y = state.year;
  if (m < 1) { m = 12; y -= 1; }
  return !hasHabitInOrBefore(y, m);
}

function monthOf(iso) {
  const [y, m] = iso.split("-").map(Number);
  return { year: y, month: m };
}

function parseIso(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatMonthYear(year, month) {
  const d = new Date(year, month - 1, 1);
  try {
    return new Intl.DateTimeFormat(safeLocale(), { month: "long", year: "numeric" }).format(d);
  } catch {
    return `${month}/${year}`;
  }
}

function formatWeekday(d) {
  try {
    return new Intl.DateTimeFormat(safeLocale(), { weekday: "long" }).format(d);
  } catch {
    return d.toDateString();
  }
}

function safeLocale() {
  const c = i18next.language;
  if (!c || c === "C" || c === "POSIX") return "en";
  try {
    new Intl.DateTimeFormat(c);
    return c;
  } catch {
    return "en";
  }
}

function escape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const ICON_CALENDAR = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`;
const ICON_FILE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`;
