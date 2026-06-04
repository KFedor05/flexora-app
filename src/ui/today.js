/**
 * Today screen — the heart of the app.
 *
 * Shows the active list of tasks for a given date, grouped by section.
 * Supports prev/next day navigation, checkbox toggling, counter steps,
 * and empty states. Streaks and freeze come in later phases.
 */

import Sortable from "sortablejs";

import * as api from "../api/index.js";
import { openHabitForm } from "./forms/habit-form.js";
import { openCalendar } from "./calendar.js";
import { goto } from "./router.js";
import { t, i18next } from "../i18n/index.js";
import { ICONS } from "./icons.js";

const PANEL_STATE_KEY = "flexora.counterPanel";
const PANEL_AUTOCOLLAPSE_WIDTH = 800;

const state = {
  root: null,
  rightPanel: null,
  date: null, // "YYYY-MM-DD"
  today: null,
  appData: null,
  day: null,
  resizeBound: false,
};

export async function mountToday(root, params) {
  state.root = root;
  state.rightPanel = document.getElementById("right-panel");
  if (state.rightPanel) state.rightPanel.style.display = "flex";
  if (!state.resizeBound) {
    window.addEventListener("resize", onWindowResize);
    state.resizeBound = true;
  }
  state.today = await api.todayIso();
  if (params?.date) {
    state.date = params.date;
  } else {
    state.date = state.today;
  }
  await reload();
}

function onWindowResize() {
  if (!state.rightPanel || !state.day) return;
  renderRightPanel();
}

function isPanelCollapsed() {
  if (window.innerWidth < PANEL_AUTOCOLLAPSE_WIDTH) return true;
  const saved = localStorage.getItem(PANEL_STATE_KEY);
  return saved !== "expanded";
}

function setPanelCollapsed(collapsed) {
  localStorage.setItem(PANEL_STATE_KEY, collapsed ? "collapsed" : "expanded");
}

const SECTION_COLLAPSE_KEY = "flexora.todaySectionsCollapsed";
function getCollapsedSections() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SECTION_COLLAPSE_KEY) || "[]"));
  } catch {
    return new Set();
  }
}
function setSectionCollapsed(sectionId, collapsed) {
  const set = getCollapsedSections();
  if (collapsed) set.add(sectionId);
  else set.delete(sectionId);
  localStorage.setItem(SECTION_COLLAPSE_KEY, JSON.stringify([...set]));
}

async function reload() {
  const [appData, day] = await Promise.all([api.loadAppData(), api.getDay(state.date)]);
  state.appData = appData;
  state.day = day;
  render();
}

function render() {
  const root = state.root;
  root.innerHTML = "";

  if (!state.appData.habits.some((h) => !h.archived && !h.completed)) {
    renderEmptyFirstRun(root);
    renderRightPanel(); // empty counter panel still renders
    return;
  }

  const wrap = document.createElement("div");
  wrap.appendChild(renderHeader());
  wrap.appendChild(renderDayPill());

  const body = document.createElement("div");
  body.className = "today-body";
  wrap.appendChild(body);

  // Checkbox-only tasks land in the main list. Counters live in the right
  // panel.
  const checkboxEntries = state.day.entries.filter((e) => {
    const h = state.appData.habits.find((x) => x.id === e.habitId);
    return h && h.type === "checkbox";
  });

  if (checkboxEntries.length === 0 && countersForToday().length === 0) {
    body.innerHTML = `<div class="editor-empty">${escape(t("today.emptyDay"))}</div>`;
  } else if (checkboxEntries.length === 0) {
    body.innerHTML = `<div class="editor-empty">${escape(t("today.allInCounters"))}</div>`;
  } else {
    renderSections(body, checkboxEntries);
  }

  root.appendChild(wrap);
  renderRightPanel();
}

// ============================================================
// Header (title + nav buttons)
// ============================================================

function renderHeader() {
  const header = document.createElement("header");
  header.className = "today-header";
  const nextBlocked = state.date >= state.today;
  const prevBlocked = !hasHabitBefore(state.date);
  header.innerHTML = `
    <h1 class="page-title">${escape(t("today.title"))}</h1>
    <div class="today-actions">
      <button type="button" class="nav-btn" data-action="back">${escape(t("nav.back"))}</button>
      <button type="button" class="nav-btn ${prevBlocked ? "muted" : ""}" data-action="prev-day" title="${escape(t("today.prevDay"))}" ${prevBlocked ? "disabled" : ""}>‹</button>
      <button type="button" class="nav-btn ${nextBlocked ? "muted" : ""}" data-action="next-day" title="${escape(t("today.nextDay"))}" ${nextBlocked ? "disabled" : ""}>›</button>
      <button type="button" class="nav-btn ${state.date === state.today ? "is-hidden" : ""}" data-action="goto-today">${escape(t("today.todayButton"))}</button>
      <button type="button" class="nav-btn" data-action="open-calendar">${escape(t("today.calendar"))}</button>
      <button type="button" class="nav-btn" data-action="goto-editor">${escape(t("today.byDays"))}</button>
      <button type="button" class="btn-icon-circle" data-action="new-habit" title="${escape(t("today.newHabit"))}">${ICONS.plus}</button>
    </div>
  `;

  header.querySelector("[data-action=back]").addEventListener("click", () => {
    const [y, m] = state.date.split("-").map(Number);
    goto("days", { year: y, month: m });
  });
  const prevBtn = header.querySelector("[data-action=prev-day]");
  if (!prevBlocked) prevBtn.addEventListener("click", () => navDay(-1));
  const nextBtn = header.querySelector("[data-action=next-day]");
  if (!nextBlocked) nextBtn.addEventListener("click", () => navDay(1));
  header.querySelector("[data-action=goto-today]").addEventListener("click", async () => {
    state.today = await api.todayIso();
    state.date = state.today;
    await reload();
  });
  header.querySelector("[data-action=goto-editor]").addEventListener("click", () => goto("editor"));
  header
    .querySelector("[data-action=open-calendar]")
    .addEventListener("click", () => openCalendar(state.date));
  header
    .querySelector("[data-action=new-habit]")
    .addEventListener("click", () => openCreate("checkbox"));

  return header;
}

// ============================================================
// Date pill row
// ============================================================

function isFuture() {
  return state.date > state.today;
}

// True if at least one non-archived habit has a startDate strictly before the
// current `state.date`. Used to gate the `‹` button so empty pre-history
// can't be scrolled forever on a clean install.
function hasHabitBefore(iso) {
  if (!state.appData?.habits?.length) return false;
  return state.appData.habits.some((h) => !h.archived && h.startDate < iso);
}

function renderDayPill() {
  const wrap = document.createElement("div");
  wrap.className = "today-datebar";
  const d = parseDate(state.date);
  const dayNumber = d.getDate();
  const isToday = state.date === state.today;
  const human = formatDate(d);

  const meta = state.day.perfectDayStreak;
  const perfectStreakHtml = `
    <span class="perfect-day-streak ${meta.current > 0 ? "active" : ""}">
      ${ICONS.fire}
      <span>${escape(t("today.perfectDays", { count: meta.current }))}</span>
    </span>
  `;
  const special = state.day.skippedWholeDay;
  const dayPerfectAlready = state.day.dayStatus === "perfect";
  const future = isFuture();
  const specialBtnDisabled = future || (dayPerfectAlready && !special);
  wrap.innerHTML = `
    <div class="datebar-left">
      <div class="datebar-num">${dayNumber}</div>
      <div class="datebar-info">
        <div class="datebar-row">
          <span class="date-pill ${isToday ? "is-today" : ""}">${escape(capitalize(human))}</span>
          ${isToday ? `<span class="today-badge">${escape(t("today.todayBadge"))}</span>` : ""}
          ${special ? `<span class="special-badge">${escape(t("today.specialDayBadge"))}</span>` : ""}
        </div>
        <div class="datebar-progress">
          <strong>${state.day.progress.done + state.day.progress.skipped}</strong> / <strong>${state.day.progress.total}</strong>
          ${escape(t("today.done"))}
          <span class="datebar-divider">•</span>
          ${perfectStreakHtml}
        </div>
      </div>
    </div>
    <button type="button" class="special-day-btn ${special ? "active" : ""}" data-action="special" ${specialBtnDisabled ? 'data-noop="true"' : ""}>
      ${ICONS.star}
      <span>${escape(t(special ? "today.unmarkSpecial" : "today.markSpecial"))}</span>
    </button>
  `;
  wrap.querySelector("[data-action=special]").addEventListener("click", async (e) => {
    if (e.currentTarget.dataset.noop === "true") return; // no-op on already-perfect day
    try {
      state.day = await api.toggleSkipDay(state.date);
      render();
    } catch (err) {
      console.error("toggleSkipDay failed", err);
      alert(String(err));
    }
  });
  return wrap;
}

// ============================================================
// Sections
// ============================================================

function renderSections(container, entries) {
  const sections = state.appData.sections.slice().sort((a, b) => a.order - b.order);
  const habitsById = new Map(state.appData.habits.map((h) => [h.id, h]));
  const entriesByHabit = new Map(entries.map((e) => [e.habitId, e]));

  sections.forEach((section) => {
    const sectionHabits = entries
      .map((e) => habitsById.get(e.habitId))
      .filter((h) => h && h.sectionId === section.id)
      .sort((a, b) => a.order - b.order);

    if (!sectionHabits.length) return; // hide empty sections

    const collapsedSet = getCollapsedSections();
    const isCollapsed = collapsedSet.has(section.id);

    const sectionEl = document.createElement("section");
    sectionEl.className = `today-section${isCollapsed ? " collapsed" : ""}`;
    sectionEl.innerHTML = `
      <header class="section-header today-section-header">
        <span class="section-title">${escape(sectionLabel(section))}</span>
        <span class="section-count">${sectionHabits.length}</span>
        <button type="button" class="section-collapse" data-section-collapse aria-label="${escape(t("editor.toggleCollapse"))}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </button>
      </header>
      <div class="today-task-list"></div>
    `;
    const list = sectionEl.querySelector(".today-task-list");
    sectionHabits.forEach((h) => {
      const entry = entriesByHabit.get(h.id);
      if (!entry) return;
      list.appendChild(renderCheckboxRow(h, entry));
    });

    sectionEl.querySelector(".today-section-header").addEventListener("click", () => {
      const next = !sectionEl.classList.contains("collapsed");
      sectionEl.classList.toggle("collapsed", next);
      setSectionCollapsed(section.id, next);
    });

    container.appendChild(sectionEl);
  });
}

function renderCheckboxRow(habit, entry) {
  const row = document.createElement("div");
  const frozen = entry.status === "skipped";
  const future = isFuture();
  row.className = `task-row${entry.status === "done" ? " completed" : ""}${frozen ? " frozen" : ""}${future ? " future" : ""}`;
  row.dataset.habitId = habit.id;
  const checkboxNoop = future;
  const freezeNoop = future || entry.status === "done";
  row.innerHTML = `
    <button type="button" class="task-checkbox ${entry.status === "done" ? "checked" : ""}" data-action="toggle" ${checkboxNoop ? "disabled" : ""} aria-label="${escape(t("today.toggle"))}" title="${escape(future ? t("today.futureDisabled") : t("today.toggle"))}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
    </button>
    <span class="task-name">${escape(habit.title)}</span>
    ${renderStreakPill(habit.id, frozen)}
    <button type="button" class="star-btn ${frozen ? "active" : ""}" data-action="freeze" ${freezeNoop ? 'data-noop="true"' : ""} ${future ? "disabled" : ""} title="${escape(future ? t("today.futureDisabled") : t(frozen ? "today.unfreeze" : "today.freeze"))}" aria-label="${escape(t(frozen ? "today.unfreeze" : "today.freeze"))}">
      ${frozen ? ICONS.starFilled : ICONS.star}
    </button>
  `;
  if (!checkboxNoop) {
    // Whole-row click toggles the entry. Click on the star (freeze button)
    // is handled by its own listener below and stops propagation so it
    // doesn't double-fire as a row-click toggle.
    row.addEventListener("click", async () => {
      try {
        state.day = await api.toggleEntry(state.date, habit.id);
        render();
      } catch (err) {
        console.error("toggle failed", err);
        alert(String(err));
      }
    });
    row.style.cursor = "pointer";
  }
  if (!future) {
    row.querySelector("[data-action=freeze]").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (e.currentTarget.dataset.noop === "true") return; // no-op on Done
      try {
        state.day = await api.toggleFreezeEntry(state.date, habit.id);
        render();
      } catch (err) {
        console.error("freeze failed", err);
        alert(String(err));
      }
    });
  }
  return row;
}

function renderStreakPill(habitId, frozen) {
  const s = state.day.habitStreaks?.[habitId];
  const count = s?.current ?? 0;
  const dim = count === 0 ? "is-dim" : "";
  return `
    <span class="streak-pill ${dim} ${frozen ? "frozen" : ""}">
      ${frozen ? ICONS.snow : ICONS.fire}
      <span>${count}</span>
    </span>
  `;
}

// ============================================================
// Right panel: counters
// ============================================================

function countersForToday() {
  const habitsById = new Map(state.appData.habits.map((h) => [h.id, h]));
  return state.day.entries
    .map((e) => ({ habit: habitsById.get(e.habitId), entry: e }))
    .filter(({ habit }) => habit && habit.type === "counter")
    .sort((a, b) => a.habit.order - b.habit.order);
}

function renderRightPanel() {
  if (!state.rightPanel) return;
  const collapsed = isPanelCollapsed();
  state.rightPanel.classList.toggle("is-collapsed", collapsed);
  state.rightPanel.classList.toggle("is-expanded", !collapsed);

  if (collapsed) {
    renderCollapsedPanel();
    return;
  }
  renderExpandedPanel();
}

function renderCollapsedPanel() {
  const counters = countersForToday();
  const total = counters.length;
  state.rightPanel.innerHTML = `
    <button type="button" class="counter-panel-strip-btn" data-action="expand" title="${escape(t("counters.expand"))}" aria-label="${escape(t("counters.expand"))}">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect width="18" height="18" x="3" y="3" rx="2"/>
        <path d="M9 3v18M3 9h18"/>
      </svg>
      ${total > 0 ? `<span class="counter-panel-strip-badge">${total}</span>` : ""}
    </button>
  `;
  state.rightPanel.querySelector("[data-action=expand]").addEventListener("click", () => {
    setPanelCollapsed(false);
    renderRightPanel();
  });
}

function renderExpandedPanel() {
  const counters = countersForToday();
  // Allow manual collapse only on wide windows. At narrow widths the panel
  // is force-collapsed by `isPanelCollapsed`, so the button has no effect.
  const canManuallyCollapse = window.innerWidth >= PANEL_AUTOCOLLAPSE_WIDTH;

  state.rightPanel.innerHTML = `
    <header class="counter-panel-header">
      <h2 class="counter-panel-title">${escape(t("counters.title"))}</h2>
      ${
        canManuallyCollapse
          ? `
      <button type="button" class="counter-panel-toggle" data-action="collapse" title="${escape(t("counters.collapse"))}" aria-label="${escape(t("counters.collapse"))}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </button>`
          : ""
      }
    </header>
    <div class="counter-panel-body"></div>
  `;
  const body = state.rightPanel.querySelector(".counter-panel-body");

  if (canManuallyCollapse) {
    state.rightPanel.querySelector("[data-action=collapse]").addEventListener("click", () => {
      setPanelCollapsed(true);
      renderRightPanel();
    });
  }

  if (!counters.length) {
    body.innerHTML = `
      <div class="counter-panel-empty">
        <p>${escape(t("counters.empty"))}</p>
        <button type="button" class="btn btn-secondary" data-action="new-counter">${escape(t("counters.createFirst"))}</button>
      </div>
    `;
    body
      .querySelector("[data-action=new-counter]")
      .addEventListener("click", () => openCreate("counter"));
    return;
  }

  const list = document.createElement("div");
  list.className = "counter-card-list";
  counters.forEach(({ habit, entry }) => list.appendChild(renderCounterCard(habit, entry)));
  body.appendChild(list);

  Sortable.create(list, {
    animation: 150,
    handle: ".counter-card-name",
    forceFallback: true,
    fallbackTolerance: 5,
    onEnd: (evt) => {
      if (evt.oldIndex === evt.newIndex) return;
      const orderedIds = Array.from(list.querySelectorAll("[data-habit-id]")).map(
        (el) => el.dataset.habitId,
      );
      reorderCounters(orderedIds);
    },
  });

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "counter-panel-add";
  addBtn.textContent = t("counters.add");
  addBtn.addEventListener("click", () => openCreate("counter"));
  body.appendChild(addBtn);
}

async function reorderCounters(orderedIds) {
  try {
    for (let i = 0; i < orderedIds.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      await api.updateHabit(orderedIds[i], { order: i });
    }
    await reload();
  } catch (err) {
    console.error("counter reorder failed", err);
    await reload();
  }
}

function renderCounterCard(habit, entry) {
  const card = document.createElement("div");
  card.className = "counter-card";
  card.dataset.habitId = habit.id;
  const target = habit.counter?.target ?? 0;
  const current = entry.counterCurrent ?? 0;
  const unit = habit.counter?.unit ?? "";
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const reached = target > 0 && current >= target;
  const steps = (habit.counter?.steps ?? []).slice().sort((a, b) => a - b);

  const stepsHtml = steps
    .map(
      (s) =>
        `<button type="button" class="counter-step minus" data-step="-${s}">−${formatNum(s)}</button>`,
    )
    .concat(
      steps.map(
        (s) =>
          `<button type="button" class="counter-step plus" data-step="${s}">+${formatNum(s)}</button>`,
      ),
    )
    .join("");

  const frozen = entry.status === "skipped";
  const future = isFuture();
  if (frozen) card.classList.add("frozen");
  if (future) card.classList.add("future");

  const stepsHtmlFinal = future
    ? steps
        .map(
          (s) =>
            `<button type="button" class="counter-step minus" disabled>−${formatNum(s)}</button>`,
        )
        .concat(
          steps.map(
            (s) =>
              `<button type="button" class="counter-step plus" disabled>+${formatNum(s)}</button>`,
          ),
        )
        .join("")
    : stepsHtml;

  card.innerHTML = `
    <div class="counter-card-head">
      <div class="counter-card-name">${escape(habit.title)}</div>
      <div class="counter-card-head-right">
        ${renderStreakPill(habit.id, frozen)}
        <button type="button" class="star-btn ${frozen ? "active" : ""}" data-action="freeze" ${future || entry.status === "done" ? 'data-noop="true"' : ""} ${future ? "disabled" : ""} title="${escape(future ? t("today.futureDisabled") : t(frozen ? "today.unfreeze" : "today.freeze"))}" aria-label="${escape(t(frozen ? "today.unfreeze" : "today.freeze"))}">
          ${frozen ? ICONS.starFilled : ICONS.star}
        </button>
        <button type="button" class="counter-edit" data-action="edit" title="${escape(t("common.edit"))}" aria-label="${escape(t("common.edit"))}">${ICONS.pencil}</button>
      </div>
    </div>
    <div class="counter-card-progress">
      <span><strong>${formatNum(current)}</strong> / ${formatNum(target)} ${escape(unit)}</span>
      <span class="counter-card-pct ${reached ? "reached" : ""}">
        ${pct}%
        ${reached ? `<span class="counter-card-fire">${ICONS.fire}</span>` : ""}
      </span>
    </div>
    <div class="counter-bar"><div class="counter-bar-fill ${reached ? "reached" : ""}" style="width:${pct}%;"></div></div>
    <div class="counter-steps">${stepsHtmlFinal}</div>
  `;

  if (!future) {
    card.querySelector("[data-action=freeze]").addEventListener("click", async (e) => {
      if (e.currentTarget.dataset.noop === "true") return;
      try {
        state.day = await api.toggleFreezeEntry(state.date, habit.id);
        render();
      } catch (err) {
        console.error("freeze failed", err);
        alert(String(err));
      }
    });
  }

  card.querySelector("[data-action=edit]").addEventListener("click", () =>
    openHabitForm({
      habit,
      sections: state.appData.sections,
      onSaved: () => reload(),
    }),
  );

  if (!future) {
    card.querySelectorAll("[data-step]").forEach((b) => {
      b.addEventListener("click", async () => {
        const delta = parseFloat(b.dataset.step);
        const next = Math.max(0, +(current + delta).toFixed(6));
        try {
          state.day = await api.setEntryCounter(state.date, habit.id, next);
          render();
        } catch (err) {
          console.error(err);
          alert(String(err));
        }
      });
    });
  }
  return card;
}

// ============================================================
// Empty state
// ============================================================

function renderEmptyFirstRun(root) {
  const wrap = document.createElement("div");
  wrap.className = "today-firstrun";
  wrap.innerHTML = `
    <div class="firstrun-card">
      <h2>${escape(t("today.firstRunHeading"))}</h2>
      <p>${escape(t("today.firstRunHint"))}</p>
      <div class="firstrun-actions">
        <button type="button" class="btn btn-primary" data-action="new-habit">${escape(t("today.createFirstHabit"))}</button>
        <button type="button" class="btn btn-secondary" data-action="new-counter">${escape(t("today.createFirstCounter"))}</button>
      </div>
    </div>
  `;
  wrap
    .querySelector("[data-action=new-habit]")
    .addEventListener("click", () => openCreate("checkbox"));
  wrap
    .querySelector("[data-action=new-counter]")
    .addEventListener("click", () => openCreate("counter"));
  root.appendChild(wrap);
}

// ============================================================
// Helpers
// ============================================================

function navDay(delta) {
  const d = parseDate(state.date);
  d.setDate(d.getDate() + delta);
  const next = formatIso(d);
  if (delta > 0 && next > state.today) return;
  if (delta < 0 && !hasHabitBefore(state.date)) return;
  state.date = next;
  reload();
}

function openCreate(kind) {
  openHabitForm({
    kind,
    sections: state.appData.sections,
    onSaved: () => reload(),
  });
}

function sectionLabel(s) {
  if (s.isDefault) {
    const key = "sections." + s.id;
    const trans = t(key);
    if (trans !== key) return trans;
  }
  return s.name;
}

function parseDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function safeLocale() {
  const candidates = [i18next.language, "en"];
  for (const c of candidates) {
    if (!c || c === "C" || c === "POSIX") continue;
    try {
      new Intl.DateTimeFormat(c);
      return c;
    } catch (_) {
      // try next
    }
  }
  return "en";
}
function formatDate(d) {
  try {
    return new Intl.DateTimeFormat(safeLocale(), {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  } catch (_) {
    return d.toDateString();
  }
}
function formatIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function formatNum(n) {
  if (n == null) return "0";
  if (Number.isInteger(n)) return String(n);
  return String(+n.toFixed(2));
}
function escape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
