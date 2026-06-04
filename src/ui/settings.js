/**
 * Settings modal — all app-wide preferences live here.
 *
 *   - Theme       (system / light / dark)
 *   - Language    (en / ru)
 *   - Behavior    (autostart, minimize-to-tray, open-to-today)
 *   - Data        (export, import, open folder)
 *   - About       (version, GitHub link)
 */

import { openModal } from "./modal.js";
import { t } from "../i18n/index.js";
import { setTheme, getTheme } from "./theme.js";
import { setLang, getLang } from "./lang.js";
import { remount } from "./router.js";
import * as api from "../api/index.js";
import { save as saveDialog, open as openDialog, ask } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import {
  enable as enableAutostart,
  disable as disableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";

const THEME_OPTIONS = ["system", "light", "dark"];
const LANG_OPTIONS = ["en", "ru"];
const GITHUB_URL = "https://github.com/KFedor05/flexora-app";

export async function openSettings() {
  const body = document.createElement("div");
  body.className = "settings-body";

  // Load current settings + system facts in parallel.
  let settings = null;
  let version = "—";
  let autostartActive = false;
  try {
    [settings, version, autostartActive] = await Promise.all([
      api.getSettings(),
      api.appVersion(),
      isAutostartEnabled().catch(() => false),
    ]);
  } catch (err) {
    console.error("settings load failed", err);
    settings = settings || {
      theme: "system",
      language: "en",
      autoStart: false,
      minimizeToTray: true,
      openToToday: true,
    };
  }

  // ============================================================
  // Group: Theme
  // ============================================================
  const themeGroup = document.createElement("div");
  themeGroup.className = "settings-group";
  themeGroup.innerHTML = `
    <h3 class="settings-group-title">${escapeHtml(t("settings.theme.label"))}</h3>
    <div class="settings-theme-pills">
      ${THEME_OPTIONS.map(
        (opt) => `
          <button type="button" class="theme-pill" data-theme-opt="${opt}">
            <span class="theme-pill-swatch swatch-${opt}"></span>
            <span class="theme-pill-name">${escapeHtml(t("settings.theme." + opt))}</span>
          </button>
        `,
      ).join("")}
    </div>
  `;
  body.appendChild(themeGroup);

  // ============================================================
  // Group: Language
  // ============================================================
  const langGroup = document.createElement("div");
  langGroup.className = "settings-group";
  langGroup.innerHTML = `
    <h3 class="settings-group-title">${escapeHtml(t("settings.language.label"))}</h3>
    <div class="settings-lang-pills">
      ${LANG_OPTIONS.map(
        (opt) => `
          <button type="button" class="theme-pill" data-lang-opt="${opt}">
            <span class="lang-pill-flag">${opt === "ru" ? "🇷🇺" : "🇬🇧"}</span>
            <span class="theme-pill-name">${escapeHtml(t("settings.language." + opt))}</span>
          </button>
        `,
      ).join("")}
    </div>
  `;
  body.appendChild(langGroup);

  // ============================================================
  // Group: Behavior
  // ============================================================
  const behaviorGroup = document.createElement("div");
  behaviorGroup.className = "settings-group";
  behaviorGroup.innerHTML = `
    <h3 class="settings-group-title">${escapeHtml(t("settings.behavior.label"))}</h3>
    <div class="settings-rows">
      ${toggleRowHtml("autostart", t("settings.behavior.autostart"), autostartActive)}
      ${toggleRowHtml("minimize-to-tray", t("settings.behavior.minimizeToTray"), settings.minimizeToTray)}
      ${toggleRowHtml("open-to-today", t("settings.behavior.openToToday"), settings.openToToday)}
    </div>
  `;
  body.appendChild(behaviorGroup);

  // ============================================================
  // Group: Data
  // ============================================================
  const dataGroup = document.createElement("div");
  dataGroup.className = "settings-group";
  dataGroup.innerHTML = `
    <h3 class="settings-group-title">${escapeHtml(t("settings.data.label"))}</h3>
    <div class="settings-rows">
      <button type="button" class="settings-row settings-row-button" data-action="export">
        <span class="settings-row-label">${escapeHtml(t("settings.data.export"))}</span>
        <span class="settings-row-hint">${escapeHtml(t("settings.data.exportHint"))}</span>
      </button>
      <button type="button" class="settings-row settings-row-button" data-action="import">
        <span class="settings-row-label">${escapeHtml(t("settings.data.import"))}</span>
        <span class="settings-row-hint">${escapeHtml(t("settings.data.importHint"))}</span>
      </button>
      <button type="button" class="settings-row settings-row-button" data-action="open-folder">
        <span class="settings-row-label">${escapeHtml(t("settings.data.openFolder"))}</span>
        <span class="settings-row-hint">${escapeHtml(t("settings.data.openFolderHint"))}</span>
        <span class="settings-row-path" data-slot="data-dir-path">…</span>
      </button>
    </div>
    <div class="settings-status is-hidden" data-slot="data-status"></div>
  `;
  body.appendChild(dataGroup);

  // ============================================================
  // Group: About
  // ============================================================
  const aboutGroup = document.createElement("div");
  aboutGroup.className = "settings-group";
  aboutGroup.innerHTML = `
    <h3 class="settings-group-title">${escapeHtml(t("settings.about.label"))}</h3>
    <div class="settings-about">
      <div class="settings-about-row">
        <span class="settings-about-key">${escapeHtml(t("settings.about.version"))}</span>
        <span class="settings-about-val">${escapeHtml(version)}</span>
      </div>
      <button type="button" class="settings-row settings-row-button" data-action="github">
        <span class="settings-row-label">${escapeHtml(t("settings.about.github"))}</span>
        <span class="settings-row-hint">${escapeHtml(GITHUB_URL)}</span>
      </button>
    </div>
  `;
  body.appendChild(aboutGroup);

  // ============================================================
  // Wire interactions
  // ============================================================

  function syncThemePills() {
    const current = getTheme();
    body.querySelectorAll("[data-theme-opt]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.themeOpt === current);
    });
  }
  function syncLangPills() {
    const current = getLang();
    body.querySelectorAll("[data-lang-opt]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.langOpt === current);
    });
  }

  body.querySelectorAll("[data-theme-opt]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      await setTheme(btn.dataset.themeOpt);
      syncThemePills();
    });
  });
  body.querySelectorAll("[data-lang-opt]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      await setLang(btn.dataset.langOpt);
      syncLangPills();
      modalCtl.close();
      remount();
      openSettings(); // reopen so the modal itself reflects the new lang
    });
  });

  // Behavior toggles
  wireToggle("autostart", async (next) => {
    if (next) await enableAutostart();
    else await disableAutostart();
    await api.updateSettings({ autoStart: next });
  });
  wireToggle("minimize-to-tray", async (next) => {
    await api.updateSettings({ minimizeToTray: next });
  });
  wireToggle("open-to-today", async (next) => {
    await api.updateSettings({ openToToday: next });
  });

  // Data actions
  const exportBtn = body.querySelector("[data-action=export]");
  const importBtn = body.querySelector("[data-action=import]");
  const openFolderBtn = body.querySelector("[data-action=open-folder]");
  exportBtn.addEventListener("click", () => doExport());
  importBtn.addEventListener("click", () => doImport());
  openFolderBtn.addEventListener("click", async () => {
    try {
      const dir = await api.dataDir();
      await openPath(dir);
    } catch (err) {
      flashStatus(String(err), "error");
    }
  });

  // Fill in the actual data directory path under the button so the user
  // can see where they're about to go before clicking.
  api
    .dataDir()
    .then((dir) => {
      const slot = body.querySelector("[data-slot=data-dir-path]");
      if (slot) slot.textContent = dir;
    })
    .catch(() => {});

  function setBusy(btn, busy) {
    btn.disabled = busy;
    btn.classList.toggle("is-busy", busy);
  }

  // About
  body.querySelector("[data-action=github]").addEventListener("click", async () => {
    try {
      await openUrl(GITHUB_URL);
    } catch (err) {
      console.error(err);
    }
  });

  syncThemePills();
  syncLangPills();

  const modalCtl = openModal({
    title: t("settings.title"),
    body,
  });

  // ============================================================
  // Helpers (closure scope — need access to body / modalCtl)
  // ============================================================

  function wireToggle(name, onChange) {
    const input = body.querySelector(`[data-toggle="${name}"]`);
    input.addEventListener("change", async () => {
      const next = input.checked;
      try {
        await onChange(next);
      } catch (err) {
        console.error(`${name} toggle failed`, err);
        input.checked = !next; // revert
        flashStatus(String(err), "error");
      }
    });
  }

  function flashStatus(text, kind) {
    const slot = body.querySelector("[data-slot=data-status]");
    if (!slot) return;
    slot.textContent = text;
    slot.classList.remove("is-hidden", "error", "success");
    if (kind === "error") slot.classList.add("error");
    else if (kind === "success") slot.classList.add("success");
    setTimeout(() => {
      slot.classList.add("is-hidden");
    }, 4000);
  }

  async function doExport() {
    setBusy(exportBtn, true);
    try {
      const today = await api.todayIso();
      const path = await saveDialog({
        defaultPath: `flexora-backup-${today}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return; // user cancelled
      await api.exportToPath(path);
      flashStatus(t("settings.data.exportSuccess"), "success");
    } catch (err) {
      flashStatus(String(err), "error");
    } finally {
      setBusy(exportBtn, false);
    }
  }

  async function doImport() {
    setBusy(importBtn, true);
    try {
      const path = await openDialog({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      const importPath = Array.isArray(path) ? path[0] : path;

      const wantBackup = await ask(t("settings.data.importConfirm"), {
        title: t("settings.data.importTitle"),
        kind: "warning",
        okLabel: t("settings.data.importConfirmBackup"),
        cancelLabel: t("settings.data.importConfirmNoBackup"),
      });

      if (wantBackup) {
        const today = await api.todayIso();
        const backupPath = await saveDialog({
          defaultPath: `flexora-backup-before-import-${today}.json`,
          filters: [{ name: "JSON", extensions: ["json"] }],
        });
        if (!backupPath) return;
        await api.exportToPath(backupPath);
      } else {
        // Last guard so a misclick on the dialog doesn't nuke data.
        const proceed = await ask(t("settings.data.importNoBackupWarning"), {
          title: t("settings.data.importTitle"),
          kind: "warning",
        });
        if (!proceed) return;
      }

      await api.importFromPath(importPath);
      flashStatus(t("settings.data.importSuccess"), "success");
      modalCtl.close();
      remount();
    } catch (err) {
      flashStatus(String(err), "error");
    } finally {
      setBusy(importBtn, false);
    }
  }
}

// ============================================================
// Pure helpers
// ============================================================

function toggleRowHtml(name, label, checked) {
  return `
    <label class="settings-row settings-row-toggle">
      <span class="settings-row-label">${escapeHtml(label)}</span>
      <span class="toggle-switch">
        <input type="checkbox" data-toggle="${name}" ${checked ? "checked" : ""} />
        <span class="toggle-track"><span class="toggle-thumb"></span></span>
      </span>
    </label>
  `;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
