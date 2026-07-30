import type { HighlightColor } from "./storage";
import { COLOR_HEX } from "./highlight";

const POPOVER_ID = "ao3-annotator-popover";

let outsideClickHandler: ((e: MouseEvent) => void) | null = null;
let escHandler: ((e: KeyboardEvent) => void) | null = null;

function clampPosition(x: number, y: number, width: number, height: number) {
  const clampedX = Math.min(x, window.innerWidth - width - 8);
  const clampedY = Math.min(y, window.innerHeight - height - 8);
  return { left: Math.max(8, clampedX), top: Math.max(8, clampedY) };
}

function basePopoverStyle(el: HTMLElement, left: number, top: number): void {
  el.id = POPOVER_ID;
  el.style.position = "fixed";
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  el.style.zIndex = "999999";
  el.style.background = "#fff";
  el.style.border = "1px solid #ccc";
  el.style.borderRadius = "8px";
  el.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
  el.style.boxSizing = "border-box";
}

/** Small grip bar at the top of a popover that lets the user drag it anywhere. */
function createDragHandle(popover: HTMLElement): HTMLElement {
  const handle = document.createElement("div");
  handle.textContent = "⠿⠿⠿";
  handle.style.textAlign = "center";
  handle.style.fontSize = "10px";
  handle.style.letterSpacing = "2px";
  handle.style.color = "#aaa";
  handle.style.cursor = "grab";
  handle.style.userSelect = "none";
  handle.style.padding = "2px 0 4px";
  handle.style.marginBottom = "2px";
  handle.style.borderBottom = "1px solid #eee";

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  handle.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = popover.offsetLeft;
    startTop = popover.offsetTop;
    handle.style.cursor = "grabbing";

    const onMove = (moveEvent: MouseEvent) => {
      if (!dragging) return;
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      popover.style.left = `${startLeft + dx}px`;
      popover.style.top = `${startTop + dy}px`;
    };

    const onUp = () => {
      dragging = false;
      handle.style.cursor = "grab";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  handle.addEventListener("click", (e) => e.stopPropagation());

  return handle;
}

function attachDismissListeners(): void {
  outsideClickHandler = () => removeColorPopover();
  escHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") removeColorPopover();
  };
  setTimeout(() => {
    if (outsideClickHandler) {
      document.addEventListener("click", outsideClickHandler, { once: true });
    }
    if (escHandler) {
      document.addEventListener("keydown", escHandler, { once: true });
    }
  }, 0);
}

export function showColorPopover(
  x: number,
  y: number,
  onSelect: (color: HighlightColor) => void
): void {
  removeColorPopover();

  const popover = document.createElement("div");
  const { left, top } = clampPosition(x, y, 130, 50);
  basePopoverStyle(popover, left, top);
  popover.style.padding = "6px 8px";
  popover.addEventListener("click", (e) => e.stopPropagation());
  popover.addEventListener("mousedown", (e) => e.stopPropagation());

  popover.appendChild(createDragHandle(popover));

  const swatchRow = document.createElement("div");
  swatchRow.style.display = "flex";
  swatchRow.style.gap = "6px";

  (Object.keys(COLOR_HEX) as HighlightColor[]).forEach((color) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.title = color;
    swatch.style.width = "18px";
    swatch.style.height = "18px";
    swatch.style.borderRadius = "50%";
    swatch.style.border = "1px solid rgba(0,0,0,0.15)";
    swatch.style.background = COLOR_HEX[color];
    swatch.style.cursor = "pointer";
    swatch.style.padding = "0";

    swatch.addEventListener("click", (e) => {
      e.stopPropagation();
      onSelect(color);
      removeColorPopover();
    });

    swatchRow.appendChild(swatch);
  });

  popover.appendChild(swatchRow);
  document.body.appendChild(popover);
  attachDismissListeners();
}

export interface NotePopoverCallbacks {
  onSave: (note: string) => void;
  onDeleteNote: () => void;
  onDeleteHighlight: () => void;
  onColorChange: (color: HighlightColor) => void;
}

// Widened so the three-button row fits on one line without overflowing.
const NOTE_POPOVER_WIDTH = 300;

export function showNotePopover(
  x: number,
  y: number,
  currentNote: string,
  currentColor: HighlightColor,
  callbacks: NotePopoverCallbacks
): void {
  removeColorPopover();

  const popover = document.createElement("div");
  const { left, top } = clampPosition(x, y, NOTE_POPOVER_WIDTH, 210);
  basePopoverStyle(popover, left, top);
  popover.style.padding = "8px 10px 10px";
  popover.style.width = `${NOTE_POPOVER_WIDTH}px`;
  popover.style.fontFamily = "system-ui, sans-serif";
  popover.addEventListener("click", (e) => e.stopPropagation());
  popover.addEventListener("mousedown", (e) => e.stopPropagation());

  popover.appendChild(createDragHandle(popover));

  const swatchRow = document.createElement("div");
  swatchRow.style.display = "flex";
  swatchRow.style.gap = "6px";
  swatchRow.style.marginBottom = "6px";

  (Object.keys(COLOR_HEX) as HighlightColor[]).forEach((color) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.title = color;
    swatch.style.width = "18px";
    swatch.style.height = "18px";
    swatch.style.borderRadius = "50%";
    swatch.style.border =
      color === currentColor ? "2px solid #333" : "1px solid rgba(0,0,0,0.15)";
    swatch.style.background = COLOR_HEX[color];
    swatch.style.cursor = "pointer";
    swatch.style.padding = "0";

    swatch.addEventListener("click", (e) => {
      e.stopPropagation();
      callbacks.onColorChange(color);
      removeColorPopover();
    });

    swatchRow.appendChild(swatch);
  });

  const textarea = document.createElement("textarea");
  textarea.value = currentNote;
  textarea.placeholder = "Add a note...";
  textarea.rows = 4;
  textarea.style.width = "100%";
  textarea.style.boxSizing = "border-box";
  textarea.style.fontSize = "13px";
  textarea.style.padding = "6px";
  textarea.style.border = "1px solid #ddd";
  textarea.style.borderRadius = "6px";
  textarea.style.resize = "none";
  textarea.style.marginBottom = "6px";
  textarea.addEventListener("click", (e) => e.stopPropagation());
  textarea.addEventListener("mousedown", (e) => e.stopPropagation());

  const buttonRow = document.createElement("div");
  buttonRow.style.display = "flex";
  buttonRow.style.flexWrap = "wrap"; //wrapping to avoid overflow on smaller screens
  buttonRow.style.justifyContent = "space-between";
  buttonRow.style.gap = "6px";
  buttonRow.style.width = "100%";
  buttonRow.style.boxSizing = "border-box";

  const makeButton = (label: string, danger = false) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.style.fontSize = "11px";
    btn.style.padding = "8px 12px";
    btn.style.lineHeight = "1.2";
    btn.style.border = "1px solid " + (danger ? "#e0a0a0" : "#ccc");
    btn.style.borderRadius = "6px";
    btn.style.background = danger ? "#fff5f5" : "#f5f5f5";
    btn.style.color = danger ? "#b03030" : "#333";
    btn.style.cursor = "pointer";
    btn.style.whiteSpace = "nowrap";
    btn.style.flex = "0 0 auto";
    btn.style.minWidth = "0";
    btn.style.boxSizing = "border-box";
    btn.style.display = "inline-flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    return btn;
  };

  const saveBtn = makeButton("Save");
  saveBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    callbacks.onSave(textarea.value.trim());
    removeColorPopover();
  });

  const deleteNoteBtn = makeButton("Delete note");
  deleteNoteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    callbacks.onDeleteNote();
    removeColorPopover();
  });

  const deleteHighlightBtn = makeButton("Delete highlight", true);
  deleteHighlightBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    callbacks.onDeleteHighlight();
    removeColorPopover();
  });

  buttonRow.appendChild(deleteHighlightBtn);
  buttonRow.appendChild(deleteNoteBtn);
  buttonRow.appendChild(saveBtn);

  popover.appendChild(swatchRow);
  popover.appendChild(textarea);
  popover.appendChild(buttonRow);

  document.body.appendChild(popover);
  attachDismissListeners();
  textarea.focus();
}

export function removeColorPopover(): void {
  document.getElementById(POPOVER_ID)?.remove();

  if (outsideClickHandler) {
    document.removeEventListener("click", outsideClickHandler);
    outsideClickHandler = null;
  }
  if (escHandler) {
    document.removeEventListener("keydown", escHandler);
    escHandler = null;
  }
}

// ---- Missing-highlights banner ----

const BANNER_ID = "ao3-annotator-missing-banner";

/**
 * Shows a small dismissible banner at the top of the page when one or more
 * saved highlights couldn't be relocated on this page load (their exact
 * stored text is no longer found — likely because the author edited the
 * fic). This does not attempt to guess where the highlight went; it just
 * informs the reader plainly. Shown at most once per page load.
 */
export function showMissingHighlightsBanner(count: number): void {
  if (document.getElementById(BANNER_ID)) return; // already shown this load

  const banner = document.createElement("div");
  banner.id = BANNER_ID;
  banner.style.position = "fixed";
  banner.style.top = "0";
  banner.style.left = "0";
  banner.style.right = "0";
  banner.style.zIndex = "999998";
  banner.style.background = "#fff8e1";
  banner.style.borderBottom = "1px solid #e0c878";
  banner.style.color = "#5c4a1a";
  banner.style.fontFamily = "system-ui, sans-serif";
  banner.style.fontSize = "13px";
  banner.style.padding = "8px 16px";
  banner.style.display = "flex";
  banner.style.alignItems = "center";
  banner.style.justifyContent = "center";
  banner.style.gap = "12px";
  banner.style.boxShadow = "0 1px 4px rgba(0,0,0,0.1)";

  const text = document.createElement("span");
  text.textContent =
    count === 1
      ? "1 of your highlights couldn't be found — this fic may have been updated since you last read it."
      : `${count} of your highlights couldn't be found — this fic may have been updated since you last read it.`;

  // Auto-dismiss after 5 seconds; cleared if the user dismisses manually first.
  const autoDismissTimer = window.setTimeout(() => {
    banner.remove();
  }, 5000);

  const dismissBtn = document.createElement("button");
  dismissBtn.type = "button";
  dismissBtn.textContent = "Dismiss";
  dismissBtn.style.fontSize = "12px";
  dismissBtn.style.padding = "4px 10px";
  dismissBtn.style.border = "1px solid #c9ac5a";
  dismissBtn.style.borderRadius = "6px";
  dismissBtn.style.background = "#fff";
  dismissBtn.style.color = "#5c4a1a";
  dismissBtn.style.cursor = "pointer";
  dismissBtn.style.whiteSpace = "nowrap";
  dismissBtn.addEventListener("click", () => {
    clearTimeout(autoDismissTimer);
    banner.remove();
  });

  banner.appendChild(text);
  banner.appendChild(dismissBtn);
  document.body.appendChild(banner);
}

//hehe