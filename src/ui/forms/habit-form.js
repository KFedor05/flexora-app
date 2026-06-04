/**
 * Unified habit/counter form. Handles all four mockup screens:
 *   new-habit.html, edit-habit.html, new-counter.html, edit-counter.html
 *
 *   openHabitForm({ kind: "checkbox" | "counter", habit?: Habit, sections, onSaved })
 *     kind     — "checkbox" or "counter" (only used for new; edit reads habit.type)
 *     habit    — existing habit if editing, else null
 *     sections — array from loadAppData()
 *     onSaved  — callback(habit) when form successfully saved (create / update / complete)
 */

import { openModal, buildFooter } from "../modal.js";
import { applyNumericMask, parseNumber } from "../inputs.js";
import { t } from "../../i18n/index.js";
import * as api from "../../api/index.js";

const ALL_WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function openHabitForm({ kind: kindArg, habit = null, sections = [], onSaved }) {
  const isEdit = !!habit;
  const kind = isEdit ? habit.type : kindArg || "checkbox";
  const isCounter = kind === "counter";

  // ---------- initial state ----------
  const initial = buildInitialState({ habit, kind, sections });
  const state = clone(initial);

  // ---------- DOM ----------
  const form = document.createElement("form");
  form.className = "habit-form";
  form.noValidate = true;

  form.innerHTML = renderForm({ isEdit, isCounter, sections, state });

  // ---------- field references ----------
  const $ = (sel) => form.querySelector(sel);
  const $$ = (sel) => Array.from(form.querySelectorAll(sel));

  const titleInput = $("[data-field=title]");
  const sectionSelect = $("[data-field=section]");
  const startDateInput = $("[data-field=startDate]");
  const goalSelect = $("[data-field=goal]");
  const customGoalWrap = $("[data-field=customGoalWrap]");
  const customGoalInput = $("[data-field=customGoalDays]");
  const intervalInput = $("[data-field=intervalDays]");
  const daysWrap = $("[data-field=daysMode]");
  const intervalWrap = $("[data-field=intervalMode]");

  // Counter-specific fields (only present when isCounter)
  const targetInput = isCounter ? $("[data-field=target]") : null;
  const unitInput = isCounter ? $("[data-field=unit]") : null;
  const stepsList = isCounter ? $("[data-field=stepsList]") : null;
  const addStepBtn = isCounter ? $("[data-field=addStep]") : null;
  const stepPreview = isCounter ? $("[data-field=stepPreview]") : null;

  // Number masks
  applyNumericMask(intervalInput, { allowDecimal: false });
  applyNumericMask(customGoalInput, { allowDecimal: false });
  if (targetInput) applyNumericMask(targetInput, { allowDecimal: true });

  // ---------- syncing UI ↔ state ----------
  const sync = () => {
    // repeat segmented
    $$("[data-repeat]").forEach((b) => {
      b.classList.toggle("active", b.dataset.repeat === state.frequencyMode);
    });
    daysWrap.classList.toggle("is-hidden", state.frequencyMode !== "byDays");
    intervalWrap.classList.toggle("is-hidden", state.frequencyMode !== "interval");

    // preset pills
    $$("[data-preset]").forEach((b) => {
      b.classList.toggle("active", b.dataset.preset === state.preset);
    });
    // day pills
    $$("[data-day]").forEach((b) => {
      b.classList.toggle("active", state.days.includes(b.dataset.day));
    });

    // interval
    intervalInput.value = String(state.intervalDays);

    // goal preset
    goalSelect.value = state.goalPreset;
    customGoalWrap.classList.toggle("is-hidden", state.goalPreset !== "custom");
    customGoalInput.value = state.customGoalDays != null ? String(state.customGoalDays) : "";

    if (isCounter) {
      targetInput.value = state.counterTarget != null ? String(state.counterTarget) : "";
      unitInput.value = state.counterUnit;
      renderSteps();
    }
  };

  const renderSteps = () => {
    if (!isCounter) return;
    stepsList.innerHTML = "";
    state.counterSteps.forEach((stepValue, idx) => {
      const item = document.createElement("div");
      item.className = "step-item";
      item.innerHTML = `
        <span class="step-sign">+</span>
        <input type="text" class="input" data-step-idx="${idx}" value="${stepValue ?? ""}" />
        <button type="button" class="step-remove" data-remove-idx="${idx}" title="${t("common.delete")}" aria-label="${t("common.delete")}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>
        </button>
      `;
      const input = item.querySelector("input");
      applyNumericMask(input, { allowDecimal: true });
      input.addEventListener("input", () => {
        state.counterSteps[idx] = input.value;
        renderPreview();
      });
      const removeBtn = item.querySelector("[data-remove-idx]");
      removeBtn.disabled = state.counterSteps.length <= 1;
      removeBtn.addEventListener("click", () => {
        state.counterSteps.splice(idx, 1);
        renderSteps();
        renderPreview();
      });
      stepsList.appendChild(item);
    });
    addStepBtn.disabled = state.counterSteps.length >= 5;
    renderPreview();
  };

  const renderPreview = () => {
    if (!isCounter || !stepPreview) return;
    const valid = state.counterSteps
      .map((s) => Number(String(s).replace(",", ".")))
      .filter((n) => Number.isFinite(n) && n > 0);
    stepPreview.innerHTML = "";
    valid.forEach((n) => {
      const minus = document.createElement("span");
      minus.className = "step-chip";
      minus.textContent = "−" + n;
      const plus = document.createElement("span");
      plus.className = "step-chip plus";
      plus.textContent = "+" + n;
      stepPreview.appendChild(minus);
      stepPreview.appendChild(plus);
    });
  };

  // ---------- event wiring ----------
  titleInput.addEventListener("input", () => {
    state.title = titleInput.value;
  });
  const sectionNewWrap = $("[data-field=sectionNewWrap]");
  const sectionNewInput = $("[data-field=sectionNewName]");
  const sectionNewCreateBtn = $("[data-action=section-new-create]");
  const sectionNewCancelBtn = $("[data-action=section-new-cancel]");
  let prevSectionId = state.sectionId;

  function showSectionInput() {
    sectionNewWrap.classList.remove("is-hidden");
    sectionNewInput.value = "";
    sectionNewInput.focus();
  }
  function hideSectionInput() {
    sectionNewWrap.classList.add("is-hidden");
    sectionNewInput.value = "";
  }
  function selectSection(id) {
    state.sectionId = id;
    sectionSelect.value = id;
    prevSectionId = id;
  }

  sectionSelect.addEventListener("change", () => {
    if (sectionSelect.value === "__new__") {
      showSectionInput();
      sectionSelect.value = prevSectionId; // visual revert until created
    } else {
      hideSectionInput();
      state.sectionId = sectionSelect.value;
      prevSectionId = state.sectionId;
    }
  });

  sectionNewCancelBtn.addEventListener("click", (e) => {
    e.preventDefault();
    hideSectionInput();
  });

  async function commitNewSection() {
    const name = sectionNewInput.value.trim();
    if (!name) return;
    sectionNewCreateBtn.disabled = true;
    try {
      const section = await api.createSection(name);
      sections.push(section);
      // Rebuild the <option>s and append the sentinel back at the end.
      const opts = sections
        .map(
          (s) =>
            `<option value="${escapeAttr(s.id)}">${escapeHtml(translateSectionName(s))}</option>`,
        )
        .join("");
      sectionSelect.innerHTML =
        opts + `<option value="__new__">${escapeHtml(t("habit.fields.sectionNewOption"))}</option>`;
      selectSection(section.id);
      hideSectionInput();
    } catch (err) {
      console.error("create section failed", err);
      alert(String(err));
    } finally {
      sectionNewCreateBtn.disabled = false;
    }
  }

  sectionNewCreateBtn.addEventListener("click", (e) => {
    e.preventDefault();
    commitNewSection();
  });
  sectionNewInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitNewSection();
    } else if (e.key === "Escape") {
      e.preventDefault();
      hideSectionInput();
    }
  });

  $$("[data-repeat]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      state.frequencyMode = btn.dataset.repeat;
      sync();
    });
  });
  $$("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      state.preset = btn.dataset.preset;
      if (state.preset !== "custom") {
        state.days = expandPreset(state.preset);
      }
      sync();
    });
  });
  $$("[data-day]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const d = btn.dataset.day;
      if (state.days.includes(d)) {
        state.days = state.days.filter((x) => x !== d);
      } else {
        state.days = [...state.days, d];
      }
      state.preset = "custom";
      sync();
    });
  });

  intervalInput.addEventListener("input", () => {
    const v = parseInt(intervalInput.value, 10);
    state.intervalDays = Number.isFinite(v) && v > 0 ? v : 1;
  });

  if (!isEdit) {
    startDateInput.addEventListener("change", () => {
      state.startDate = startDateInput.value;
    });
    // Force the native calendar popup to open on any click inside the field
    // (the tiny indicator icon is easy to miss, especially on dark themes).
    startDateInput.addEventListener("click", () => {
      if (typeof startDateInput.showPicker === "function") {
        try {
          startDateInput.showPicker();
        } catch {
          // ignore — fall back to default click behaviour
        }
      }
    });
  }

  goalSelect.addEventListener("change", () => {
    state.goalPreset = goalSelect.value;
    sync();
  });
  customGoalInput.addEventListener("input", () => {
    const v = parseInt(customGoalInput.value, 10);
    state.customGoalDays = Number.isFinite(v) && v > 0 ? v : null;
  });

  if (isCounter) {
    targetInput.addEventListener("input", () => {
      state.counterTarget = parseNumber(targetInput);
    });
    unitInput.addEventListener("input", () => {
      state.counterUnit = unitInput.value;
    });
    addStepBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (state.counterSteps.length < 5) {
        state.counterSteps.push("");
        renderSteps();
      }
    });
  }

  // ---------- submit / footer ----------
  const errorBox = document.createElement("div");
  errorBox.className = "field-error";
  errorBox.style.marginBottom = "12px";
  errorBox.style.minHeight = "0";

  // Insert error box at top of form when needed.
  const showError = (msg) => {
    errorBox.textContent = msg;
    if (msg) form.prepend(errorBox);
    else errorBox.remove();
  };

  const cancelBtn = mkButton({
    label: t("common.cancel"),
    cls: "btn-secondary",
    onClick: (e) => {
      e.preventDefault();
      ctl.requestClose();
    },
  });
  const primaryBtn = mkButton({
    label: isEdit ? t("common.save") : t("common.create"),
    cls: "btn-primary",
    onClick: (e) => {
      e.preventDefault();
      submit();
    },
  });

  let completeBtn = null;
  if (isEdit && !habit.completed) {
    completeBtn = mkButton({
      label: t("common.complete"),
      cls: "btn-success",
      onClick: (e) => {
        e.preventDefault();
        complete();
      },
    });
  }

  const footer = buildFooter({
    left: completeBtn || undefined,
    secondary: cancelBtn,
    primary: primaryBtn,
  });

  // ---------- modal ----------
  const title = pickTitle({ isEdit, isCounter });
  const ctl = openModal({
    title,
    body: form,
    footer,
    isDirty: () => !equal(state, initial),
  });

  // Enter on form fields submits; Enter on buttons triggers their click.
  form.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
      e.preventDefault();
      submit();
    }
  });

  // Initial render.
  sync();
  if (isCounter) renderSteps();

  // ---------- submit handlers ----------
  async function submit() {
    showError("");
    const validation = validate(state, { isCounter, isEdit, today: todayIso() });
    if (validation) {
      showError(validation);
      return;
    }
    primaryBtn.disabled = true;
    try {
      if (isEdit) {
        const patch = buildPatch(state, initial, habit);
        const updated = await api.updateHabit(habit.id, patch);
        ctl.close();
        if (typeof onSaved === "function") onSaved(updated);
      } else {
        const input = buildCreateInput(state, isCounter);
        const created = await api.createHabit(input);
        ctl.close();
        if (typeof onSaved === "function") onSaved(created);
      }
    } catch (err) {
      showError(String(err));
      primaryBtn.disabled = false;
    }
  }

  async function complete() {
    primaryBtn.disabled = true;
    try {
      const updated = await api.completeHabit(habit.id);
      ctl.close();
      if (typeof onSaved === "function") onSaved(updated);
    } catch (err) {
      showError(String(err));
      primaryBtn.disabled = false;
    }
  }

  return ctl;
}

// ============================================================
// Helpers
// ============================================================

function pickTitle({ isEdit, isCounter }) {
  if (isEdit) {
    return isCounter ? t("habit.editCounterTitle") : t("habit.editTitle");
  }
  return isCounter ? t("habit.newCounterTitle") : t("habit.newTitle");
}

function buildInitialState({ habit, kind, sections }) {
  if (habit) {
    const isByDays = habit.frequency?.type === "byDays";
    return {
      title: habit.title,
      sectionId: habit.sectionId,
      frequencyMode: isByDays ? "byDays" : "interval",
      preset: isByDays ? habit.frequency.preset : "custom",
      days: isByDays ? [...habit.frequency.days] : [...defaultWeekdays()],
      intervalDays: isByDays ? 3 : habit.frequency.intervalDays,
      startDate: habit.startDate,
      goalPreset: habit.goalPreset,
      customGoalDays: deriveCustomDays(habit),
      counterTarget: habit.counter?.target ?? null,
      counterUnit: habit.counter?.unit ?? "",
      counterSteps: habit.counter?.steps?.map(String) ?? [""],
    };
  }
  const defaultSectionId = sections.find((s) => s.id === "morning")?.id || sections[0]?.id || "";
  return {
    title: "",
    sectionId: defaultSectionId,
    frequencyMode: "byDays",
    preset: "all",
    days: ALL_WEEKDAYS.slice(),
    intervalDays: 3,
    startDate: todayIso(),
    goalPreset: "indefinite",
    customGoalDays: null,
    counterTarget: null,
    counterUnit: "",
    counterSteps: kind === "counter" ? [""] : [],
  };
}

function deriveCustomDays(habit) {
  if (habit.goalPreset !== "custom" || !habit.endDate) return null;
  const start = new Date(habit.startDate + "T00:00:00Z");
  const end = new Date(habit.endDate + "T00:00:00Z");
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000);
  return diff > 0 ? diff : null;
}

function defaultWeekdays() {
  return ["mon", "tue", "wed", "thu", "fri"];
}

function expandPreset(preset) {
  switch (preset) {
    case "all":
      return ALL_WEEKDAYS.slice();
    case "weekdays":
      return ["mon", "tue", "wed", "thu", "fri"];
    case "weekends":
      return ["sat", "sun"];
    default:
      return [];
  }
}

function todayIso() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function clone(x) {
  return JSON.parse(JSON.stringify(x));
}
function equal(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function buildFrequency(state) {
  if (state.frequencyMode === "byDays") {
    const days = state.days.length ? [...state.days] : defaultWeekdays();
    return { type: "byDays", days, preset: state.preset };
  }
  const n = Number(state.intervalDays);
  return {
    type: "interval",
    intervalDays: Number.isFinite(n) && n > 0 ? Math.floor(n) : 1,
  };
}

function buildEndDate(state) {
  if (state.goalPreset === "indefinite") return null;
  const map = { "7d": 7, "30d": 30, "100d": 100, "365d": 365 };
  const days = state.goalPreset === "custom" ? state.customGoalDays : map[state.goalPreset];
  if (!days || days <= 0) return null;
  const start = new Date(state.startDate + "T00:00:00Z");
  start.setUTCDate(start.getUTCDate() + days);
  return start.toISOString().slice(0, 10);
}

function buildCreateInput(state, isCounter) {
  const counterSteps = isCounter
    ? state.counterSteps
        .map((s) => Number(String(s).replace(",", ".")))
        .filter((n) => Number.isFinite(n) && n > 0)
    : null;
  return {
    title: state.title.trim(),
    sectionId: state.sectionId,
    type: isCounter ? "counter" : "checkbox",
    counter: isCounter
      ? {
          target: state.counterTarget,
          unit: state.counterUnit.trim(),
          steps: counterSteps,
        }
      : null,
    frequency: buildFrequency(state),
    startDate: state.startDate,
    endDate: buildEndDate(state),
    goalPreset: state.goalPreset,
  };
}

function buildPatch(state, initial, habit) {
  const patch = {};
  if (state.title.trim() !== initial.title.trim()) patch.title = state.title.trim();
  if (state.sectionId !== initial.sectionId) patch.sectionId = state.sectionId;

  const freq = buildFrequency(state);
  const initialFreq = buildFrequency(initial);
  if (JSON.stringify(freq) !== JSON.stringify(initialFreq)) patch.frequency = freq;

  const newEnd = buildEndDate(state);
  if (newEnd !== habit.endDate) patch.endDate = newEnd;
  if (state.goalPreset !== initial.goalPreset) patch.goalPreset = state.goalPreset;

  if (habit.type === "counter") {
    const counterSteps = state.counterSteps
      .map((s) => Number(String(s).replace(",", ".")))
      .filter((n) => Number.isFinite(n) && n > 0);
    const initialSteps = initial.counterSteps
      .map((s) => Number(String(s).replace(",", ".")))
      .filter((n) => Number.isFinite(n) && n > 0);
    const counterChanged =
      state.counterTarget !== initial.counterTarget ||
      state.counterUnit.trim() !== initial.counterUnit.trim() ||
      JSON.stringify(counterSteps) !== JSON.stringify(initialSteps);
    if (counterChanged) {
      patch.counter = {
        target: state.counterTarget,
        unit: state.counterUnit.trim(),
        steps: counterSteps,
      };
    }
  }

  return patch;
}

function validate(state, { isCounter, isEdit, today }) {
  const errs = t("habit.errors", { returnObjects: true });
  if (!state.title.trim()) return errs.titleRequired;
  if (state.title.trim().length > 60) return errs.titleRequired;
  if (!state.sectionId) return errs.sectionRequired;

  if (state.frequencyMode === "interval") {
    const n = Number(state.intervalDays);
    if (!Number.isFinite(n) || n < 1) return errs.intervalInvalid;
  }

  if (isCounter) {
    if (!(typeof state.counterTarget === "number" && state.counterTarget > 0)) {
      return errs.counterTargetInvalid;
    }
    if (!state.counterUnit.trim()) return errs.counterUnitRequired;
    const validSteps = state.counterSteps
      .map((s) => Number(String(s).replace(",", ".")))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (validSteps.length < 1) return errs.stepsRequired;
    if (validSteps.length > 5) return errs.stepInvalid;
  }

  const end = buildEndDate(state);
  if (end) {
    if (end < state.startDate) return errs.endBeforeStart;
    if (isEdit && end < today) return errs.endBeforeToday;
  }
  return null;
}

function mkButton({ label, cls, onClick }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn " + cls;
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

// ============================================================
// HTML template
// ============================================================

function renderForm({ isEdit, isCounter, sections, state }) {
  const sectionOptions = sections
    .map(
      (s) =>
        `<option value="${escapeAttr(s.id)}" ${
          s.id === state.sectionId ? "selected" : ""
        }>${escapeHtml(translateSectionName(s))}</option>`,
    )
    .join("");

  const dayPills = ALL_WEEKDAYS.map(
    (d) =>
      `<button type="button" class="day-pill" data-day="${d}">${escapeHtml(t("habit.days." + d))}</button>`,
  ).join("");

  const counterBlock = isCounter
    ? `
    <div class="field-row">
      <div class="field" style="margin-bottom:0;">
        <label class="field-label">${escapeHtml(t("habit.fields.counterTarget"))}</label>
        <input type="text" class="input" data-field="target" placeholder="2" />
      </div>
      <div class="field" style="margin-bottom:0;">
        <label class="field-label">${escapeHtml(t("habit.fields.counterUnit"))}</label>
        <input type="text" class="input" data-field="unit" placeholder="${escapeAttr(t("habit.fields.counterUnitPlaceholder"))}" maxlength="20" />
      </div>
    </div>

    <div class="field">
      <label class="field-label">${escapeHtml(t("habit.fields.steps"))}</label>
      <div class="step-list" data-field="stepsList"></div>
      <button type="button" class="step-add" data-field="addStep">${escapeHtml(t("habit.fields.addStep"))}</button>
      <div class="field-help">${escapeHtml(t("habit.fields.stepsHint"))}</div>
      <div class="step-preview" data-field="stepPreview"></div>
    </div>
  `
    : "";

  return `
    <div class="field">
      <label class="field-label">${escapeHtml(t("habit.fields.title"))}</label>
      <input type="text" class="input" data-field="title"
        placeholder="${escapeAttr(t("habit.fields.titlePlaceholder"))}"
        maxlength="60" value="${escapeAttr(state.title)}" />
    </div>

    <div class="field">
      <label class="field-label">${escapeHtml(t("habit.fields.section"))}</label>
      <select class="select" data-field="section">${sectionOptions}<option value="__new__">${escapeHtml(t("habit.fields.sectionNewOption"))}</option></select>
      <div class="section-new-row is-hidden" data-field="sectionNewWrap">
        <input type="text" class="input" maxlength="40" data-field="sectionNewName" placeholder="${escapeAttr(t("habit.fields.sectionNewPlaceholder"))}" />
        <button type="button" class="btn btn-primary" data-action="section-new-create">${escapeHtml(t("common.create"))}</button>
        <button type="button" class="btn btn-secondary" data-action="section-new-cancel">${escapeHtml(t("common.cancel"))}</button>
      </div>
    </div>

    ${counterBlock}

    <div class="field">
      <label class="field-label">${escapeHtml(t("habit.fields.repeat"))}</label>
      <div class="segmented" style="margin-bottom: 12px;">
        <button type="button" data-repeat="byDays">${escapeHtml(t("habit.fields.repeatDays"))}</button>
        <button type="button" data-repeat="interval">${escapeHtml(t("habit.fields.repeatInterval"))}</button>
      </div>

      <div data-field="daysMode">
        <div class="pill-row">
          <button type="button" class="pill" data-preset="all">${escapeHtml(t("habit.fields.presetAll"))}</button>
          <button type="button" class="pill" data-preset="weekdays">${escapeHtml(t("habit.fields.presetWeekdays"))}</button>
          <button type="button" class="pill" data-preset="weekends">${escapeHtml(t("habit.fields.presetWeekends"))}</button>
          <button type="button" class="pill" data-preset="custom">${escapeHtml(t("habit.fields.presetCustom"))}</button>
        </div>
        <div class="day-row">${dayPills}</div>
      </div>

      <div data-field="intervalMode" class="is-hidden">
        <div class="interval-row">
          <span>${escapeHtml(t("habit.fields.interval"))}</span>
          <input type="text" class="input" data-field="intervalDays" value="3" />
          <span>${escapeHtml(t("habit.fields.intervalSuffix"))}</span>
        </div>
      </div>
    </div>

    <div class="field-row">
      <div class="field" style="margin-bottom:0;">
        <label class="field-label">${escapeHtml(t("habit.fields.startDate"))}</label>
        <input type="date" class="input" data-field="startDate"
          value="${escapeAttr(state.startDate)}" ${isEdit ? "disabled" : ""} />
        ${isEdit ? `<div class="field-help">${escapeHtml(t("habit.fields.startDateLocked"))}</div>` : ""}
      </div>
      <div class="field" style="margin-bottom:0;">
        <label class="field-label">${escapeHtml(t("habit.fields.endDate"))}</label>
        <select class="select" data-field="goal">
          <option value="indefinite">${escapeHtml(t("habit.fields.goalIndefinite"))}</option>
          <option value="7d">${escapeHtml(t("habit.fields.goal7"))}</option>
          <option value="30d">${escapeHtml(t("habit.fields.goal30"))}</option>
          <option value="100d">${escapeHtml(t("habit.fields.goal100"))}</option>
          <option value="365d">${escapeHtml(t("habit.fields.goal365"))}</option>
          <option value="custom">${escapeHtml(t("habit.fields.goalCustom"))}</option>
        </select>
      </div>
    </div>

    <div class="field is-hidden" data-field="customGoalWrap" style="margin-top:12px;">
      <label class="field-label">${escapeHtml(t("habit.fields.customGoalDays"))}</label>
      <input type="text" class="input" data-field="customGoalDays"
        placeholder="${escapeAttr(t("habit.fields.customGoalDaysPlaceholder"))}" />
    </div>
  `;
}

function translateSectionName(s) {
  if (s.isDefault) {
    const key = "sections." + s.id;
    const trans = t(key);
    if (trans !== key) return trans;
  }
  return s.name;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function escapeAttr(s) {
  return escapeHtml(s);
}
