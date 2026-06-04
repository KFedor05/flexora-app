/**
 * Input helpers: number-only mask, change tracking, etc.
 *
 * applyNumericMask(input, { allowDecimal })
 *   Filters keystrokes and paste events so only digits (and optionally one
 *   decimal separator) end up in the value. Commas become dots.
 */

export function applyNumericMask(input, { allowDecimal = true } = {}) {
  const normalize = (raw) => {
    let s = String(raw).replace(/,/g, ".");
    if (allowDecimal) {
      // Strip everything except digits and the first dot.
      s = s.replace(/[^\d.]/g, "");
      const firstDot = s.indexOf(".");
      if (firstDot !== -1) {
        s =
          s.slice(0, firstDot + 1) +
          s.slice(firstDot + 1).replace(/\./g, "");
      }
    } else {
      s = s.replace(/\D/g, "");
    }
    return s;
  };

  input.setAttribute("inputmode", allowDecimal ? "decimal" : "numeric");
  input.setAttribute("autocomplete", "off");

  input.addEventListener("beforeinput", (e) => {
    if (e.inputType === "deleteContentBackward" || e.inputType === "deleteContentForward") {
      return;
    }
    if (!e.data) return;
    const allowed = allowDecimal ? /^[\d.,]+$/ : /^\d+$/;
    if (!allowed.test(e.data)) {
      e.preventDefault();
    }
  });

  input.addEventListener("input", () => {
    const before = input.value;
    const after = normalize(before);
    if (before !== after) {
      const pos = Math.max(0, input.selectionStart - (before.length - after.length));
      input.value = after;
      input.setSelectionRange(pos, pos);
    }
  });

  input.addEventListener("paste", (e) => {
    const txt = (e.clipboardData || window.clipboardData).getData("text");
    e.preventDefault();
    const normalized = normalize(txt);
    document.execCommand("insertText", false, normalized);
  });
}

/**
 * Returns the current numeric value or null if blank/invalid.
 */
export function parseNumber(input) {
  const v = String(input.value).trim().replace(/,/g, ".");
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
