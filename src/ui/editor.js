/**
 * Habit editor — phase 4.
 *
 * Two modes:
 *   - flat: all habits grouped by section, drag-and-drop reorder + section
 *           management (create/rename/delete custom sections).
 *   - days: weekday tabs (Mon..Sun); shows habits whose frequency hits the
 *           chosen day. Interval habits are marked but appear in all tabs.
 */

import Sortable from "sortablejs";

import * as api from "../api/index.js";
import { openHabitForm } from "./forms/habit-form.js";
import { openModal, buildFooter } from "./modal.js";
import { goto } from "./router.js";
import { t } from "../i18n/index.js";
import { ICONS } from "./icons.js";

const ALL_WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const state = {
  data: null,
  mode: "flat", // "flat" | "days"
  activeDay: null, // when mode=days
  collapsedSections: new Set(),
  root: null,
};

export async function mountEditor(root) {
  state.root = root;
  state.activeDay = ALL_WEEKDAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
  const rightPanel = document.getElementById("right-panel");
  if (rightPanel) rightPanel.style.display = "none";
  await reload();
}

async function reload() {
  state.data = await api.loadAppData();
  render();
}

function render() {
  const root = state.root;
  root.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="editor-header">
      <h1 class="page-title" data-i18n="editor.title">${escape(t("editor.title"))}</h1>
      <div class="editor-actions">
        <button type="button" class="nav-btn" data-action="goto-today">${escape(t("editor.backToToday"))}</button>
        <button type="button" class="btn btn-secondary" data-action="add-habit">${escape(t("editor.addHabit"))}</button>
        <button type="button" class="btn btn-secondary" data-action="add-counter">${escape(t("editor.addCounter"))}</button>
      </div>
    </div>

    <div class="editor-modes">
      <div class="segmented">
        <button type="button" data-mode="flat" class="${state.mode === "flat" ? "active" : ""}">${escape(t("editor.modeFlat"))}</button>
        <button type="button" data-mode="days" class="${state.mode === "days" ? "active" : ""}">${escape(t("editor.modeDays"))}</button>
      </div>
    </div>

    <div class="editor-body" data-editor-body></div>
  `;
  root.appendChild(wrap);

  wrap.querySelector("[data-action=goto-today]").addEventListener("click", () => goto("today"));
  wrap
    .querySelector("[data-action=add-habit]")
    .addEventListener("click", () => openCreate("checkbox"));
  wrap
    .querySelector("[data-action=add-counter]")
    .addEventListener("click", () => openCreate("counter"));

  wrap.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.mode = btn.dataset.mode;
      render();
    });
  });

  const body = wrap.querySelector("[data-editor-body]");
  if (state.mode === "flat") renderFlat(body);
  else renderByDays(body);
}

// ============================================================
// Flat mode
// ============================================================

function renderFlat(container) {
  // Default sections only show when they have content. Custom sections are
  // always visible so the user can rename/delete them.
  const visibleSections = state.data.sections
    .slice()
    .filter((s) => !s.isDefault || habitsForSection(s.id).length > 0)
    .sort((a, b) => a.order - b.order);

  const counters = allActiveCounters();

  if (!visibleSections.length && !counters.length) {
    container.innerHTML = `<div class="editor-empty">${escape(t("editor.emptyAll"))}</div>`;
    return;
  }

  const list = document.createElement("div");
  list.className = "section-list";
  list.dataset.sectionList = "1";

  visibleSections.forEach((section) => {
    list.appendChild(buildSectionElement(section, { mode: "flat" }));
  });
  if (counters.length) list.appendChild(buildCountersBlock(counters));
  container.appendChild(list);

  // Drag-drop sections.
  Sortable.create(list, {
    handle: ".section-drag-handle",
    animation: 150,
    onEnd: (evt) => {
      if (evt.oldIndex === evt.newIndex) return;
      onSectionsReorder(
        Array.from(list.querySelectorAll("[data-section-id]")).map((el) => el.dataset.sectionId),
      );
    },
  });

  // Drag-drop habits inside and between sections.
  list.querySelectorAll("[data-habit-list]").forEach((habitListEl) => {
    Sortable.create(habitListEl, {
      group: "habits",
      handle: ".drag-handle",
      animation: 150,
      onEnd: (evt) => onHabitDrop(evt),
    });
  });
  // Drag-drop counters within their own block.
  list.querySelectorAll("[data-counters-list]").forEach((counterListEl) => {
    Sortable.create(counterListEl, {
      handle: ".drag-handle",
      animation: 150,
      onEnd: (evt) => onCounterDropInByDays(evt),
    });
  });
}

function buildSectionElement(section, { mode }) {
  const habits = habitsForSection(section.id);
  const collapsed = state.collapsedSections.has(section.id);

  const sectionEl = document.createElement("section");
  sectionEl.className = `section${collapsed ? " collapsed" : ""}`;
  sectionEl.dataset.sectionId = section.id;

  const sectionActions = section.isDefault
    ? ""
    : `
      <button type="button" class="section-action" data-section-action="rename" title="${escape(t("editor.renameSection"))}" aria-label="${escape(t("editor.renameSection"))}">${ICONS.pencil}</button>
      <button type="button" class="section-action" data-section-action="delete" title="${escape(t("editor.deleteSection"))}" aria-label="${escape(t("editor.deleteSection"))}">${ICONS.trash}</button>
    `;

  sectionEl.innerHTML = `
    <header class="section-header">
      ${mode === "flat" ? `<span class="section-drag-handle" title="${escape(t("editor.dragSection"))}">${dragHandleSvg()}</span>` : ""}
      <span class="section-title">${escape(sectionLabel(section))}</span>
      <span class="section-count">${habits.length}</span>
      <div class="section-actions">${sectionActions}</div>
      <button type="button" class="section-collapse" data-section-collapse aria-label="${escape(t("editor.toggleCollapse"))}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </button>
    </header>
    <div class="habit-list" data-habit-list data-section-id="${escape(section.id)}"></div>
  `;

  const list = sectionEl.querySelector("[data-habit-list]");
  if (!habits.length) {
    list.innerHTML = `<div class="empty-section">${escape(t("editor.emptySection"))}</div>`;
  } else {
    habits.forEach((h) => list.appendChild(buildHabitRow(h)));
  }

  // Collapse on header click (but not when clicking actions/handle).
  sectionEl.querySelector(".section-header").addEventListener("click", (e) => {
    if (e.target.closest("[data-section-action]") || e.target.closest(".section-drag-handle"))
      return;
    toggleCollapse(section.id);
    sectionEl.classList.toggle("collapsed");
  });

  sectionEl.querySelectorAll("[data-section-action]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (btn.dataset.sectionAction === "rename") openSectionRename(section);
      else if (btn.dataset.sectionAction === "delete") openSectionDelete(section);
    });
  });

  return sectionEl;
}

// Counters never live inside habit sections — they have their own group at
// the bottom of the editor. No drag-handle on the header (it isn't a section
// you can reorder), no collapse, no rename/delete. Individual rows still
// have their drag handle so the user can reorder counters among themselves.
function buildCountersBlock(counters) {
  const block = document.createElement("section");
  block.className = "section counters-block";
  block.dataset.counterBlock = "1";
  block.innerHTML = `
    <header class="section-header" style="cursor: default;">
      <span class="section-title">${escape(t("editor.countersGroup"))}</span>
      <span class="section-count">${counters.length}</span>
    </header>
    <div class="habit-list" data-counters-list></div>
  `;
  const rowsContainer = block.querySelector("[data-counters-list]");
  counters.forEach((h) => rowsContainer.appendChild(buildHabitRow(h)));
  return block;
}

function buildHabitRow(habit) {
  const row = document.createElement("div");
  row.className = "row";
  row.dataset.habitId = habit.id;
  const freqLabel = describeFrequency(habit.frequency);
  const typeLabel = habit.type === "counter" ? t("shim.kindCounter") : t("shim.kindCheckbox");
  const intervalBadge =
    habit.frequency?.type === "interval"
      ? `<span class="badge" title="${escape(t("editor.intervalBadge"))}">~${habit.frequency.intervalDays}d</span>`
      : "";

  row.innerHTML = `
    <span class="drag-handle" title="${escape(t("editor.dragHabit"))}">${dragHandleSvg()}</span>
    <div class="row-body">
      <div class="row-name">${escape(habit.title)}</div>
      <div class="row-meta">${escape(freqLabel)} · ${escape(typeLabel)} ${intervalBadge}</div>
    </div>
    <button type="button" class="edit-text-btn" data-edit-habit>${escape(t("common.edit"))}</button>
  `;
  row.querySelector("[data-edit-habit]").addEventListener("click", () => openEdit(habit));
  return row;
}

// ============================================================
// By-days mode
// ============================================================

function renderByDays(container) {
  container.innerHTML = `
    <div class="day-tabs"></div>
    <div class="day-content"></div>
  `;

  const tabs = container.querySelector(".day-tabs");
  ALL_WEEKDAYS.forEach((d) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day-tab" + (state.activeDay === d ? " active" : "");
    btn.textContent = t("habit.days." + d);
    btn.addEventListener("click", () => {
      state.activeDay = d;
      render();
    });
    tabs.appendChild(btn);
  });

  const content = container.querySelector(".day-content");
  const sections = state.data.sections.slice().sort((a, b) => a.order - b.order);
  const today = state.activeDay;

  const list = document.createElement("div");
  list.className = "section-list";

  // In "by day" mode we always hide empty sections, including custom ones —
  // here we are showing a schedule, not managing structure.
  let anyShown = false;
  sections.forEach((section) => {
    const habits = habitsForSection(section.id).filter((h) => isOnDay(h, today));
    if (!habits.length) return;
    anyShown = true;

    const sectionEl = document.createElement("section");
    sectionEl.className = "section";
    sectionEl.dataset.sectionId = section.id;
    sectionEl.innerHTML = `
      <header class="section-header" style="cursor: default;">
        <span class="section-title">${escape(sectionLabel(section))}</span>
        <span class="section-count">${habits.length}</span>
      </header>
      <div class="habit-list" data-habit-list data-section-id="${escape(section.id)}"></div>
    `;
    const rowsContainer = sectionEl.querySelector(".habit-list");
    habits.forEach((h) => rowsContainer.appendChild(buildHabitRow(h)));
    list.appendChild(sectionEl);
  });

  // Counters that are active on this weekday — own block, not under a section.
  const dayCounters = allActiveCounters().filter((h) => isOnDay(h, today));
  if (dayCounters.length) {
    list.appendChild(buildCountersBlock(dayCounters));
    anyShown = true;
  }

  if (!anyShown) {
    content.innerHTML = `<div class="editor-empty">${escape(t("editor.emptyDay"))}</div>`;
    return;
  }
  content.appendChild(list);

  // Drag-drop habits between and within sections in by-days mode.
  // Group "habits-byday" lets habits cross section boundaries — dropping a
  // habit into another section updates its sectionId. Counters live in
  // their own Sortable (no cross-list) below.
  list.querySelectorAll("[data-habit-list]").forEach((habitListEl) => {
    Sortable.create(habitListEl, {
      group: "habits-byday",
      handle: ".drag-handle",
      animation: 150,
      onEnd: (evt) => onHabitDropInByDays(evt),
    });
  });
  list.querySelectorAll("[data-counters-list]").forEach((counterListEl) => {
    Sortable.create(counterListEl, {
      handle: ".drag-handle",
      animation: 150,
      onEnd: (evt) => onCounterDropInByDays(evt),
    });
  });
}

// ============================================================
// Filtering helpers
// ============================================================

function habitsForSection(sectionId) {
  // Counters are never grouped under a habit section — they belong in their
  // own Counters block at the end of the editor.
  return state.data.habits
    .filter((h) => h.sectionId === sectionId && !h.archived && !h.completed && h.type !== "counter")
    .sort((a, b) => a.order - b.order);
}

function allActiveCounters() {
  return state.data.habits
    .filter((h) => h.type === "counter" && !h.archived && !h.completed)
    .sort((a, b) => a.order - b.order);
}

function visibleHabits() {
  return state.data.habits.filter((h) => !h.archived && !h.completed);
}

function isOnDay(habit, weekday) {
  if (habit.frequency?.type === "byDays") {
    return habit.frequency.days.includes(weekday);
  }
  return true; // interval habits show on every tab
}

function sectionLabel(s) {
  if (s.isDefault) {
    const key = "sections." + s.id;
    const trans = t(key);
    if (trans !== key) return trans;
  }
  return s.name;
}

function describeFrequency(freq) {
  if (!freq) return "";
  if (freq.type === "byDays") {
    const presetKeys = {
      all: "habit.fields.presetAll",
      weekdays: "habit.fields.presetWeekdays",
      weekends: "habit.fields.presetWeekends",
    };
    if (presetKeys[freq.preset]) return t(presetKeys[freq.preset]);
    return freq.days.map((d) => t("habit.days." + d)).join("/");
  }
  return `${t("habit.fields.interval")} ${freq.intervalDays} ${t("habit.fields.intervalSuffix")}`;
}

function toggleCollapse(id) {
  if (state.collapsedSections.has(id)) state.collapsedSections.delete(id);
  else state.collapsedSections.add(id);
}

function dragHandleSvg() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`;
}

// ============================================================
// Modal actions
// ============================================================

function openCreate(kind) {
  openHabitForm({
    kind,
    sections: state.data.sections,
    onSaved: () => reload(),
  });
}
function openEdit(habit) {
  openHabitForm({
    habit,
    sections: state.data.sections,
    onSaved: () => reload(),
  });
}

function openSectionRename(section) {
  const initialName = section.name;
  const form = document.createElement("form");
  form.innerHTML = `
    <div class="field">
      <label class="field-label">${escape(t("editor.sectionNameLabel"))}</label>
      <input type="text" class="input" maxlength="40" data-field="name" value="${escape(initialName)}" />
    </div>
  `;
  const input = form.querySelector("[data-field=name]");
  const errorBox = document.createElement("div");
  errorBox.className = "field-error";

  const primary = mkButton(t("common.save"), "btn-primary", async (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) {
      errorBox.textContent = t("editor.sectionNameRequired");
      form.prepend(errorBox);
      return;
    }
    primary.disabled = true;
    try {
      await api.updateSection(section.id, { name });
      ctl.close();
      await reload();
    } catch (err) {
      errorBox.textContent = String(err);
      form.prepend(errorBox);
      primary.disabled = false;
    }
  });
  const cancel = mkButton(t("common.cancel"), "btn-secondary", (e) => {
    e.preventDefault();
    ctl.requestClose();
  });
  const ctl = openModal({
    title: t("editor.renameSectionTitle"),
    body: form,
    footer: buildFooter({ secondary: cancel, primary }),
    isDirty: () => input.value.trim() !== initialName,
  });
  form.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      primary.click();
    }
  });
}

function openSectionDelete(section) {
  const habits = habitsForSection(section.id);
  const otherSections = state.data.sections.filter((s) => s.id !== section.id);
  if (!otherSections.length) {
    alert(t("editor.cannotDeleteLastSection"));
    return;
  }
  const defaultTarget = otherSections.find((s) => s.id === "other") || otherSections[0];

  const form = document.createElement("form");
  form.innerHTML = `
    <p style="font-size: 14px; color: var(--text); margin: 0 0 14px;">
      ${escape(t("editor.deleteSectionConfirm", { name: sectionLabel(section), count: habits.length }))}
    </p>
    <div class="field" ${habits.length ? "" : "style='display:none;'"}>
      <label class="field-label">${escape(t("editor.moveToLabel"))}</label>
      <select class="select" data-field="moveTo">
        ${otherSections
          .map(
            (s) =>
              `<option value="${escape(s.id)}" ${s.id === defaultTarget.id ? "selected" : ""}>${escape(sectionLabel(s))}</option>`,
          )
          .join("")}
      </select>
    </div>
  `;
  const select = form.querySelector("[data-field=moveTo]");
  const errorBox = document.createElement("div");
  errorBox.className = "field-error";

  const primary = mkButton(t("common.delete"), "btn-primary", async (e) => {
    e.preventDefault();
    primary.disabled = true;
    try {
      await api.deleteSection(section.id, select.value);
      ctl.close();
      await reload();
    } catch (err) {
      errorBox.textContent = String(err);
      form.prepend(errorBox);
      primary.disabled = false;
    }
  });
  const cancel = mkButton(t("common.cancel"), "btn-secondary", (e) => {
    e.preventDefault();
    ctl.requestClose();
  });
  const ctl = openModal({
    title: t("editor.deleteSectionTitle"),
    body: form,
    footer: buildFooter({ secondary: cancel, primary }),
  });
}

function mkButton(label, cls, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn " + cls;
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

// ============================================================
// Reorder handlers
// ============================================================

async function onSectionsReorder(sectionIds) {
  // Issue updateSection calls sequentially to keep validation simple.
  try {
    for (let i = 0; i < sectionIds.length; i++) {
      const id = sectionIds[i];
      const s = state.data.sections.find((x) => x.id === id);
      if (s && s.order !== i) {
        // eslint-disable-next-line no-await-in-loop
        await api.updateSection(id, { order: i });
      }
    }
    await reload();
  } catch (err) {
    console.error("section reorder failed", err);
    await reload();
  }
}

async function onHabitDrop(evt) {
  const habitId = evt.item.dataset.habitId;
  const newSectionId = evt.to.dataset.sectionId;
  const orderedIds = Array.from(evt.to.querySelectorAll("[data-habit-id]")).map(
    (el) => el.dataset.habitId,
  );

  try {
    // 1) Move the habit to the new section (if changed).
    const habit = state.data.habits.find((h) => h.id === habitId);
    if (habit && habit.sectionId !== newSectionId) {
      await api.updateHabit(habitId, { sectionId: newSectionId });
    }
    // 2) Re-number every habit in the target section.
    for (let i = 0; i < orderedIds.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      await api.updateHabit(orderedIds[i], { order: i });
    }
    // 3) Also re-number the source section if it was different.
    if (evt.from !== evt.to) {
      const sourceIds = Array.from(evt.from.querySelectorAll("[data-habit-id]")).map(
        (el) => el.dataset.habitId,
      );
      for (let i = 0; i < sourceIds.length; i++) {
        // eslint-disable-next-line no-await-in-loop
        await api.updateHabit(sourceIds[i], { order: i });
      }
    }
    await reload();
  } catch (err) {
    console.error("habit drop failed", err);
    await reload();
  }
}

// In by-days mode the visible list is filtered by weekday. The user can drag
// habits within a section or across sections (cross-section drag changes
// sectionId). After drop, both source and target sections are renumbered:
// visible habits in DOM order first, then invisible habits in their previous
// relative order. This means re-ordering inside one weekday view changes the
// absolute habit order, which propagates to other weekday views — that's an
// accepted trade-off for letting drag work the way users expect.
async function onHabitDropInByDays(evt) {
  const habitId = evt.item.dataset.habitId;
  const habit = state.data.habits.find((h) => h.id === habitId);
  if (!habit) {
    await reload();
    return;
  }
  const oldSectionId = evt.from.dataset.sectionId;
  const newSectionId = evt.to.dataset.sectionId;
  const crossSection = habit.sectionId !== newSectionId;

  // Visible IDs in target / source after the drop, in DOM order.
  const visibleTargetIds = Array.from(evt.to.querySelectorAll("[data-habit-id]")).map(
    (el) => el.dataset.habitId,
  );
  const visibleSourceIds = crossSection
    ? Array.from(evt.from.querySelectorAll("[data-habit-id]")).map((el) => el.dataset.habitId)
    : [];

  try {
    if (crossSection) {
      await api.updateHabit(habitId, { sectionId: newSectionId });
    }

    // Renumber target: visible-in-DOM-order, then invisible (preserved order).
    await renumberSectionForByDays(newSectionId, visibleTargetIds, habitId);

    // Renumber source (cross-section only — habit X is no longer there).
    if (crossSection) {
      await renumberSectionForByDays(oldSectionId, visibleSourceIds, habitId);
    }

    await reload();
  } catch (err) {
    console.error("habit drop (by-days) failed", err);
    await reload();
  }
}

// Counter rows live in their own block, always within the same list — no
// cross-block drops. Same sequential-then-anchored renumbering as habits.
async function onCounterDropInByDays(evt) {
  const visibleIds = Array.from(evt.to.querySelectorAll("[data-habit-id]")).map(
    (el) => el.dataset.habitId,
  );
  const allCounters = state.data.habits
    .filter((h) => h.type === "counter" && !h.archived && !h.completed)
    .sort((a, b) => a.order - b.order);
  const visibleSet = new Set(visibleIds);
  const invisibleCounters = allCounters.filter((h) => !visibleSet.has(h.id));

  try {
    let nextOrder = 0;
    for (const id of visibleIds) {
      // eslint-disable-next-line no-await-in-loop
      await api.updateHabit(id, { order: nextOrder++ });
    }
    for (const h of invisibleCounters) {
      // eslint-disable-next-line no-await-in-loop
      await api.updateHabit(h.id, { order: nextOrder++ });
    }
    await reload();
  } catch (err) {
    console.error("counter drop (by-days) failed", err);
    await reload();
  }
}

// Renumber a section after a by-days drag: visible habits (in DOM order)
// take orders 0..N-1, invisible habits keep their previous relative order
// and take orders N..M-1.
//
// `draggedHabitId` is the habit that was dragged. We exclude it from the
// stale state.data.habits lookup because:
//   - in the TARGET we don't want to double-count it (it's already in
//     visibleIds and state.data may still have its OLD sectionId)
//   - in the SOURCE it has already left and shouldn't be renumbered there
async function renumberSectionForByDays(sectionId, visibleIds, draggedHabitId) {
  const visibleSet = new Set(visibleIds);
  const sectionHabits = state.data.habits
    .filter((h) => h.sectionId === sectionId && h.id !== draggedHabitId)
    .sort((a, b) => a.order - b.order);
  const invisible = sectionHabits.filter((h) => !visibleSet.has(h.id));

  let nextOrder = 0;
  for (const id of visibleIds) {
    // eslint-disable-next-line no-await-in-loop
    await api.updateHabit(id, { order: nextOrder++ });
  }
  for (const h of invisible) {
    // eslint-disable-next-line no-await-in-loop
    await api.updateHabit(h.id, { order: nextOrder++ });
  }
}

// ============================================================
// Utils
// ============================================================

function escape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
