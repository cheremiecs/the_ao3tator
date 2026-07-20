import type { HighlightColor } from "./storage";
import { COLOR_HEX } from "./highlight";

const POPOVER_ID = "ao3-annotator-popover";

let outsideClickHandler: ((e: MouseEvent) => void) | null = null;
let escHandler: ((e: KeyboardEvent) => void) | null = null;

export function showColorPopover(
  x: number,
  y: number,
  onSelect: (color: HighlightColor) => void
): void {
  removeColorPopover();

  const popover = document.createElement("div");
  popover.id = POPOVER_ID;
  popover.style.position = "fixed";
  popover.style.left = `${x}px`;
  popover.style.top = `${y}px`;
  popover.style.zIndex = "999999";
  popover.style.display = "flex";
  popover.style.gap = "6px";
  popover.style.padding = "6px 8px";
  popover.style.background = "#fff";
  popover.style.border = "1px solid #ccc";
  popover.style.borderRadius = "8px";
  popover.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";

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

    popover.appendChild(swatch);
  });

  document.body.appendChild(popover);

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