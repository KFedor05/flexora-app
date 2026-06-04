/**
 * Calendar modal — month grid with color-coded day statuses.
 *
 * Opens through `openCalendar(initialDate)`. Inside the user navigates
 * months with ◀/▶, clicks a past or current day to jump Today there,
 * and closes with Esc / backdrop / "Close".
 */

import { openModal } from "./modal.js";
import * as api from "../api/index.js";
import { goto } from "./router.js";
import { t, i18next } from "../i18n/index.js";
import { ICONS } from "./icons.js";

const FIRE_SMALL = `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`;
const STAR_FILLED = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

const state = {
  year: 0,
  month: 0, // 1-12
  today: null, // "YYYY-MM-DD"
  body: null,
  modalCtl: null,
  swipeAccum: 0,
  swipeCooldown: 0,
  appData: null, // loaded once on open, used to clamp navigation
};

export async function openCalendar(initialDate) {
  state.today = await api.todayIso();
  state.appData = await api.loadAppData();
  const seed = initialDate ? parseIso(initialDate) : parseIso(state.today);
  state.year = seed.getFullYear();
  state.month = seed.getMonth() + 1;

  const body = document.createElement("div");
  body.className = "calendar-body";
  state.body = body;

  state.modalCtl = openModal({
    title: t("calendar.title"),
    body,
    onClose: () => {
      body.removeEventListener("wheel", onWheel);
      state.body = null;
      state.modalCtl = null;
    },
  });

  body.addEventListener("wheel", onWheel, { passive: false });

  await renderMonth();
}

function onWheel(e) {
  // Touchpad two-finger horizontal scroll. Only react to horizontal-dominant
  // deltas so vertical scrolling inside the legend doesn't flip months.
  if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
  e.preventDefault();
  state.swipeAccum += e.deltaX;
  if (state.swipeCooldown && performance.now() < state.swipeCooldown) return;
  const THRESHOLD = 60;
  if (state.swipeAccum >= THRESHOLD) {
    state.swipeAccum = 0;
    state.swipeCooldown = performance.now() + 350;
    if (!nextMonthDisabled()) navMonth(1);
  } else if (state.swipeAccum <= -THRESHOLD) {
    state.swipeAccum = 0;
    state.swipeCooldown = performance.now() + 350;
    if (!prevMonthDisabled()) navMonth(-1);
  }
}

// Last day of the previous month, as YYYY-MM-DD.
function prevMonthEndIso() {
  const m = state.month === 1 ? 12 : state.month - 1;
  const y = state.month === 1 ? state.year - 1 : state.year;
  const last = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

// First day of the next month, as YYYY-MM-DD.
function nextMonthStartIso() {
  const m = state.month === 12 ? 1 : state.month + 1;
  const y = state.month === 12 ? state.year + 1 : state.year;
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

function prevMonthDisabled() {
  const endIso = prevMonthEndIso();
  return !(state.appData?.habits ?? []).some((h) => !h.archived && h.startDate <= endIso);
}

function nextMonthDisabled() {
  return nextMonthStartIso() > state.today;
}

async function renderMonth() {
  const body = state.body;
  if (!body) return;
  body.innerHTML = `<div class="calendar-loading">${escape(t("common.loading") || "")}</div>`;

  let briefs;
  try {
    briefs = await api.getMonth(state.year, state.month);
  } catch (err) {
    body.innerHTML = `<div class="calendar-error">${escape(String(err))}</div>`;
    return;
  }

  const monthLabel = formatMonthYear(state.year, state.month);
  const prevDis = prevMonthDisabled();
  const nextDis = nextMonthDisabled();
  body.innerHTML = `
    <div class="month-nav">
      <button type="button" class="cal-nav-arrow${prevDis ? " muted" : ""}" data-action="prev" ${prevDis ? "disabled" : ""} title="${escape(t("calendar.prevMonth"))}" aria-label="${escape(t("calendar.prevMonth"))}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <div class="month-title">${escape(monthLabel)}</div>
      <button type="button" class="cal-nav-arrow${nextDis ? " muted" : ""}" data-action="next" ${nextDis ? "disabled" : ""} title="${escape(t("calendar.nextMonth"))}" aria-label="${escape(t("calendar.nextMonth"))}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </button>
    </div>
    <div class="weekday-row">
      ${weekdayHeaders()
        .map((w) => `<div class="weekday">${escape(w)}</div>`)
        .join("")}
    </div>
    <div class="calendar-grid"></div>
    <ul class="cal-legend">
      <li><span class="cal-legend-swatch cal-legend-red"></span>${escape(t("calendar.legendRed"))}</li>
      <li><span class="cal-legend-swatch cal-legend-orange"></span>${escape(t("calendar.legendOrange"))}</li>
      <li><span class="cal-legend-swatch cal-legend-green"></span>${escape(t("calendar.legendGreen"))}</li>
      <li><span class="cal-legend-swatch cal-legend-empty"></span>${escape(t("calendar.legendEmpty"))}</li>
      <li><span class="cal-legend-star">${STAR_FILLED}</span>${escape(t("calendar.legendStar"))}</li>
      <li class="cal-legend-note">${escape(t("calendar.legendFuture"))}</li>
    </ul>
    <div class="cal-actions">
      <button type="button" class="btn btn-secondary" data-action="today">${escape(t("calendar.gotoToday"))}</button>
    </div>
  `;

  const prevBtn = body.querySelector("[data-action=prev]");
  const nextBtn = body.querySelector("[data-action=next]");
  if (!prevDis) prevBtn.addEventListener("click", () => navMonth(-1));
  if (!nextDis) nextBtn.addEventListener("click", () => navMonth(1));
  body.querySelector("[data-action=today]").addEventListener("click", () => {
    pickDate(state.today);
  });

  const grid = body.querySelector(".calendar-grid");
  renderGrid(grid, briefs);
}

function renderGrid(grid, briefs) {
  // First date of the month and its column (Mon=0 .. Sun=6).
  const first = new Date(state.year, state.month - 1, 1);
  const firstCol = (first.getDay() + 6) % 7;
  const daysInMonth = briefs.length;
  const totalCells = Math.ceil((firstCol + daysInMonth) / 7) * 7;

  // Lead-in: trailing days of previous month.
  const prevMonth = state.month === 1 ? 12 : state.month - 1;
  const prevYear = state.month === 1 ? state.year - 1 : state.year;
  const prevDaysInMonth = new Date(prevYear, prevMonth, 0).getDate();
  for (let i = 0; i < firstCol; i++) {
    const dayNum = prevDaysInMonth - firstCol + 1 + i;
    grid.appendChild(otherMonthCell(dayNum));
  }

  // The month itself.
  for (let i = 0; i < daysInMonth; i++) {
    grid.appendChild(monthDayCell(briefs[i], i + 1));
  }

  // Trail: leading days of next month.
  const trailing = totalCells - firstCol - daysInMonth;
  for (let i = 1; i <= trailing; i++) {
    grid.appendChild(otherMonthCell(i));
  }
}

function otherMonthCell(dayNum) {
  const cell = document.createElement("div");
  cell.className = "day-cell other-month";
  cell.innerHTML = `<span class="day-num">${dayNum}</span>`;
  return cell;
}

function monthDayCell(brief, dayNum) {
  const cell = document.createElement("div");
  const iso = brief.date;
  const isToday = iso === state.today;
  const isFuture = iso > state.today;
  const colorClass = cellColorClass(brief, isFuture, isToday);
  // Flame piggy-backs on the green verdict so today gets the reward the
  // instant the plan is done, but partial days (red / orange) don't earn it
  // and future days never show it.
  const hasFlame = !isFuture && colorClass === "green";
  const star = brief.skippedWholeDay;

  // A past day is clickable only when there is something to show on the
  // Today view for it: at least one habit was scheduled (total > 0), or it
  // was marked as a skip-day, or there are stored entries (covers the rare
  // case where a habit was deleted after being logged on this day).
  // Today and future days follow the existing rules.
  const hasContent = brief.total > 0 || brief.skippedWholeDay || brief.done + brief.skipped > 0;
  const clickable = isToday || (!isFuture && hasContent);

  cell.className = `day-cell ${colorClass}${isToday ? " today" : ""}${!clickable ? " inert" : ""}`;
  cell.dataset.date = iso;
  cell.innerHTML = `
    ${star ? `<svg class="star-mark" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>` : ""}
    <span class="day-num">${dayNum}</span>
    ${hasFlame ? `<span class="day-flame">${FIRE_SMALL}</span>` : `<span class="day-flame"></span>`}
  `;
  if (clickable) {
    cell.addEventListener("click", () => pickDate(iso));
  }
  return cell;
}

function cellColorClass(brief, isFuture, isToday) {
  if (isFuture) return "future";
  if (brief.skippedWholeDay) return "green";
  // Nothing was scheduled that day — no verdict to render.
  if (brief.total === 0) return "empty";

  const ratio = (brief.done + brief.skipped) / brief.total;

  // Today rule: reward shows immediately (green when everything is done),
  // but red / orange verdicts are deferred until midnight — the day isn't
  // over yet, no point shaming a half-finished plan.
  if (isToday) {
    return ratio >= 1.0 ? "green" : "empty";
  }

  // Past day verdict by completion ratio:
  //   100%      -> green
  //   50%-99%   -> orange
  //   0%-49%    -> red (including 0%: an over day with zero ticks is a miss)
  if (ratio >= 1.0) return "green";
  if (ratio >= 0.5) return "orange";
  return "red";
}

function navMonth(delta) {
  let m = state.month + delta;
  let y = state.year;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  state.month = m;
  state.year = y;
  renderMonth();
}

function pickDate(iso) {
  if (state.modalCtl) state.modalCtl.close();
  goto("today", { date: iso });
}

function formatMonthYear(year, month) {
  const d = new Date(year, month - 1, 1);
  try {
    return new Intl.DateTimeFormat(safeLocale(), {
      month: "long",
      year: "numeric",
    }).format(d);
  } catch {
    return `${month}/${year}`;
  }
}

function weekdayHeaders() {
  // Mon-first, two-letter short labels via Intl when possible.
  const labels = [];
  // Pick any reference Monday: 2024-01-01 was a Monday.
  const base = new Date(2024, 0, 1);
  try {
    const fmt = new Intl.DateTimeFormat(safeLocale(), { weekday: "short" });
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      labels.push(fmt.format(d).toUpperCase().slice(0, 2));
    }
    return labels;
  } catch {
    return ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
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

function parseIso(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function escape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
