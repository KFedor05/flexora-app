/**
 * Toast — non-blocking notifications in the bottom-right corner.
 *
 * Stacks vertically, auto-dismisses after a timeout, manual close via X.
 * Hovering pauses the auto-dismiss timer (so you have time to read long
 * error messages).
 *
 *   showToast("Saved", { type: "success" })
 *   showError(String(err))   // shortcut for type=error
 */

const CONTAINER_ID = "toast-stack";
const DEFAULT_TIMEOUT = 4000;

function ensureContainer() {
  let el = document.getElementById(CONTAINER_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = CONTAINER_ID;
    el.className = "toast-stack";
    document.body.appendChild(el);
  }
  return el;
}

export function showToast(message, { type = "info", timeout = DEFAULT_TIMEOUT } = {}) {
  const container = ensureContainer();
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.innerHTML = `
    <span class="toast-message"></span>
    <button type="button" class="toast-close" aria-label="Close">×</button>
  `;
  toast.querySelector(".toast-message").textContent = message;
  container.appendChild(toast);

  // Force reflow so the entry transition actually runs.
  void toast.offsetWidth;
  toast.classList.add("toast-show");

  let timer = null;
  const dismiss = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (toast.parentNode !== container) return;
    toast.classList.remove("toast-show");
    toast.addEventListener(
      "transitionend",
      () => {
        if (toast.parentNode === container) container.removeChild(toast);
      },
      { once: true },
    );
  };

  toast.querySelector(".toast-close").addEventListener("click", dismiss);

  if (timeout > 0) {
    timer = setTimeout(dismiss, timeout);
    toast.addEventListener("mouseenter", () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    });
    toast.addEventListener("mouseleave", () => {
      if (!timer) timer = setTimeout(dismiss, timeout);
    });
  }

  return dismiss;
}

export const showError = (message, opts) => showToast(message, { ...opts, type: "error" });
export const showSuccess = (message, opts) => showToast(message, { ...opts, type: "success" });
