/**
 * Years view — top of the Notion-style hierarchy. Lists every year that has
 * stored data plus the current year.
 */

import * as api from "../api/index.js";
import { goto } from "./router.js";
import { openHabitForm } from "./forms/habit-form.js";
import { t } from "../i18n/index.js";
import { ICONS } from "./icons.js";

const state = {
  root: null,
  today: null,
  years: null,
  appData: null,
};

export async function mountYears(root) {
  state.root = root;
  const rightPanel = document.getElementById("right-panel");
  if (rightPanel) rightPanel.style.display = "none";

  state.today = await api.todayIso();
  const [years, appData] = await Promise.all([api.getYears(), api.loadAppData()]);
  state.years = years;
  state.appData = appData;
  render();
}

function render() {
  const root = state.root;
  root.innerHTML = "";
  const todayYear = Number(state.today.slice(0, 4));

  const header = document.createElement("header");
  header.className = "page-header";
  header.innerHTML = `
    <h1 class="page-title">${escape(t("nav.diary"))}</h1>
    <div class="today-actions">
      <button type="button" class="nav-btn" data-action="today">${escape(t("today.todayButton"))}</button>
      <button type="button" class="nav-btn" data-action="by-days">${escape(t("today.byDays"))}</button>
      <button type="button" class="btn-icon-circle" data-action="new-habit" title="${escape(t("today.newHabit"))}">${ICONS.plus}</button>
    </div>
  `;
  root.appendChild(header);

  const hint = document.createElement("p");
  hint.className = "page-hint";
  hint.textContent = t("nav.yearsHint");
  root.appendChild(hint);

  const heading = document.createElement("h2");
  heading.className = "page-h2";
  heading.textContent = t("nav.year");
  root.appendChild(heading);

  const sectionLabel = document.createElement("div");
  sectionLabel.className = "page-section-label";
  sectionLabel.textContent = t("nav.yearsLabel");
  root.appendChild(sectionLabel);

  const list = document.createElement("div");
  list.className = "day-list-rows";
  state.years.forEach((y) => list.appendChild(renderYearRow(y, todayYear)));
  root.appendChild(list);

  const trailing = document.createElement("p");
  trailing.className = "page-hint trailing";
  trailing.textContent = t("nav.yearsTrailing");
  root.appendChild(trailing);

  header.querySelector("[data-action=today]").addEventListener("click", () => goto("today"));
  header.querySelector("[data-action=by-days]").addEventListener("click", () => goto("editor"));
  header.querySelector("[data-action=new-habit]").addEventListener("click", () =>
    openHabitForm({
      kind: "checkbox",
      sections: state.appData.sections,
      onSaved: () => mountYears(root),
    }),
  );
}

function renderYearRow(year, todayYear) {
  const row = document.createElement("div");
  const isCurrent = year === todayYear;
  row.className = `day-list-row${isCurrent ? " current" : ""}`;
  row.innerHTML = `
    <span class="day-list-icon">${ICON_FILE}</span>
    <span class="day-list-num large">${year}</span>
    ${isCurrent ? `<span class="today-badge today-badge-row">${escape(t("nav.currentBadge"))}</span>` : ""}
  `;
  row.addEventListener("click", () => goto("months", { year }));
  return row;
}

function escape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const ICON_FILE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`;
