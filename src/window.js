import { getCurrentWindow } from "@tauri-apps/api/window";

const RESIZE_DIRS = {
  n: "North",
  s: "South",
  w: "West",
  e: "East",
  nw: "NorthWest",
  ne: "NorthEast",
  sw: "SouthWest",
  se: "SouthEast",
};

export function setupWindowControls() {
  const win = getCurrentWindow();
  const $ = (id) => document.getElementById(id);

  $("win-min")?.addEventListener("click", () => win.minimize());
  $("win-max")?.addEventListener("click", () => win.toggleMaximize());
  $("win-close")?.addEventListener("click", () => win.close());

  setupResizeHandles(win);
}

function setupResizeHandles(win) {
  const layer = document.createElement("div");
  layer.className = "resize-layer";
  for (const dir of Object.keys(RESIZE_DIRS)) {
    const handle = document.createElement("div");
    handle.className = `resize-handle resize-${dir}`;
    handle.addEventListener("mousedown", async (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      try {
        await win.startResizeDragging(RESIZE_DIRS[dir]);
      } catch {
        /* maximized or no-op */
      }
    });
    layer.appendChild(handle);
  }
  document.body.appendChild(layer);

  const syncMaximized = async () => {
    try {
      const maxed = await win.isMaximized();
      layer.classList.toggle("is-hidden", maxed);
    } catch {
      /* ignore */
    }
  };
  syncMaximized();
  win.onResized(syncMaximized);
}
