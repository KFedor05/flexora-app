/**
 * Minimal modal infrastructure used by all forms.
 *
 *   const ctl = openModal({
 *     title: "New habit",
 *     body: someElement,      // detached HTMLElement
 *     isDirty: () => boolean, // optional; gates "discard?" confirmation
 *     onClose: () => void,    // called after the modal has been removed
 *   });
 *   ctl.close();              // programmatic close (bypasses isDirty check)
 *   ctl.requestClose();       // honors isDirty
 */

import { t } from "../i18n/index.js";

const ICON_X = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;

let activeModal = null;

export function openModal({ title, body, isDirty, onClose, footer }) {
  // Only one modal at a time. If something is open, request its close first.
  if (activeModal) {
    activeModal.requestClose();
  }

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");

  const header = document.createElement("header");
  header.className = "modal-header";
  header.innerHTML = `
    <div class="modal-title">${escapeHtml(title || "")}</div>
    <button class="modal-close" type="button" aria-label="${escapeHtml(t("common.close"))}" title="${escapeHtml(t("common.close"))}">
      ${ICON_X}
    </button>
  `;
  modal.appendChild(header);

  const bodyWrap = document.createElement("div");
  bodyWrap.className = "modal-body";
  if (typeof body === "string") {
    bodyWrap.innerHTML = body;
  } else if (body instanceof Node) {
    bodyWrap.appendChild(body);
  }
  modal.appendChild(bodyWrap);

  if (footer instanceof Node) {
    modal.appendChild(footer);
  }

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  const close = () => {
    backdrop.remove();
    document.removeEventListener("keydown", onKeyDown, true);
    if (activeModal && activeModal._backdrop === backdrop) {
      activeModal = null;
    }
    if (typeof onClose === "function") onClose();
  };

  const requestClose = () => {
    if (typeof isDirty === "function" && isDirty()) {
      if (!window.confirm(t("modal.discardChanges"))) return;
    }
    close();
  };

  // Close button.
  header.querySelector(".modal-close").addEventListener("click", requestClose);

  // Backdrop click outside modal.
  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) requestClose();
  });

  // Esc.
  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      requestClose();
    }
  };
  document.addEventListener("keydown", onKeyDown, true);

  // Focus first focusable element.
  queueMicrotask(() => {
    const focusables = modal.querySelectorAll(
      "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])",
    );
    for (const el of focusables) {
      if (!el.classList.contains("modal-close")) {
        el.focus();
        if (el.select) el.select();
        break;
      }
    }
  });

  const setTitle = (newTitle) => {
    const titleEl = header.querySelector(".modal-title");
    if (titleEl) titleEl.textContent = newTitle ?? "";
  };

  activeModal = { _backdrop: backdrop, close, requestClose, setTitle };
  return activeModal;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildFooter({ primary, secondary, left }) {
  const footer = document.createElement("footer");
  footer.className = "modal-footer";

  if (left) {
    footer.appendChild(left);
  }

  const right = document.createElement("div");
  right.className = "modal-footer-right";
  if (secondary) right.appendChild(secondary);
  if (primary) right.appendChild(primary);
  footer.appendChild(right);

  return footer;
}

// Lightweight Yes/No confirmation. Returns a Promise<boolean> that resolves
// with true on confirm, false on cancel / Esc / backdrop / close.
//   title       — short heading
//   message     — body text (one paragraph)
//   confirmLabel — text on the destructive button (default: "Delete")
//   cancelLabel  — text on cancel button (default: "Cancel")
//   destructive  — when true (default), confirm button uses btn-danger
export function openConfirm({
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  destructive = true,
}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      resolve(val);
      ctl.close();
    };

    const body = document.createElement("div");
    body.className = "confirm-body";
    const p = document.createElement("p");
    p.className = "confirm-message";
    p.textContent = message;
    body.appendChild(p);

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn-secondary";
    cancelBtn.textContent = cancelLabel;
    cancelBtn.addEventListener("click", () => finish(false));

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = destructive ? "btn btn-danger" : "btn btn-primary";
    confirmBtn.textContent = confirmLabel;
    confirmBtn.addEventListener("click", () => finish(true));

    const footer = buildFooter({ primary: confirmBtn, secondary: cancelBtn });

    const ctl = openModal({
      title,
      body,
      footer,
      onClose: () => finish(false),
    });
  });
}
