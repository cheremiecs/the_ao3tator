import type { HighlightColor } from "./storage";

export const HIGHLIGHT_CLASS = "ao3-annotator-highlight";

export const COLOR_HEX: Record<HighlightColor, string> = {
  yellow: "#FAC775",
  blue: "#85B7EB",
  green: "#97C459",
  pink: "#ED93B1"
};

/**
 * Wraps a Range in a <span> highlight element.
 * Phase 1 note: this only handles ranges that don't cross block-level
 * elements cleanly. Multi-paragraph selections are out of scope for Phase 1.
 */
export function wrapRangeAsHighlight(
  range: Range,
  id: string,
  color: HighlightColor
): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = HIGHLIGHT_CLASS;
  span.dataset.annotationId = id;
  span.style.backgroundColor = COLOR_HEX[color];
  span.style.borderRadius = "2px";

  try {
    range.surroundContents(span);
  } catch {
    const fragment = range.extractContents();
    span.appendChild(fragment);
    range.insertNode(span);
  }

  return span;
}

export function unwrapHighlight(span: HTMLElement): void {
  const parent = span.parentNode;
  if (!parent) return;

  while (span.firstChild) {
    parent.insertBefore(span.firstChild, span);
  }
  parent.removeChild(span);
  parent.normalize();
}

/**
 * Finds the first occurrence of `text` inside `container` that isn't already
 * highlighted, and returns a Range spanning it.
 *
 * Phase 1: exact substring match only. Phase 3 will replace this with
 * prefix/suffix-anchored fuzzy matching.
 */
export function findTextRange(container: Element, text: string): Range | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);

  const nodes: Text[] = [];
  let combined = "";
  let node: Node | null;
  while ((node = walker.nextNode())) {
    nodes.push(node as Text);
    combined += (node as Text).data;
  }

  const index = combined.indexOf(text);
  if (index === -1) return null;

  const start = locate(nodes, index);
  const end = locate(nodes, index + text.length);
  if (!start || !end) return null;

  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
}

function locate(nodes: Text[], globalOffset: number): { node: Text; offset: number } | null {
  let remaining = globalOffset;
  for (const n of nodes) {
    if (remaining <= n.data.length) {
      return { node: n, offset: remaining };
    }
    remaining -= n.data.length;
  }
  return null;
}