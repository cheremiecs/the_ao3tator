import type { HighlightColor } from "./storage";

export const HIGHLIGHT_CLASS = "ao3-annotator-highlight";

export const COLOR_HEX: Record<HighlightColor, string> = {
  yellow: "#FAC775",
  blue: "#85B7EB",
  green: "#97C459",
  pink: "#ED93B1"
};

function wrapSingleRange(range: Range, id: string, color: HighlightColor): HTMLSpanElement {
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

function getContainingParagraph(node: Node): HTMLElement | null {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return el?.closest("p") ?? null;
}

function getParagraphsBetween(
  container: Element,
  startP: HTMLElement,
  endP: HTMLElement
): HTMLElement[] {
  const allParagraphs = Array.from(container.querySelectorAll("p")) as HTMLElement[];
  const startIndex = allParagraphs.indexOf(startP);
  const endIndex = allParagraphs.indexOf(endP);
  if (startIndex === -1 || endIndex === -1) return [];
  const [lo, hi] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
  return allParagraphs.slice(lo, hi + 1);
}

/**
 * Wraps a Range in one or more <span> highlight elements, all sharing the
 * same annotation id. If the range stays within a single <p>, this produces
 * one span (same as before). If it spans multiple <p> elements, it splits
 * the range at paragraph boundaries and wraps each paragraph's portion in
 * its own span — a single <span> can't legally wrap block-level content
 * across multiple paragraphs, so this is the correct way to highlight
 * across them instead of forcing one broken span.
 *
 * `container` is required to resolve cross-paragraph splits; without it
 * (or if start/end aren't inside a <p>), falls back to a single-span wrap.
 */
export function wrapRangeAsHighlight(
  range: Range,
  id: string,
  color: HighlightColor,
  container?: Element
): HTMLSpanElement[] {
  const startP = getContainingParagraph(range.startContainer);
  const endP = getContainingParagraph(range.endContainer);

  if (!container || !startP || !endP || startP === endP) {
    return [wrapSingleRange(range, id, color)];
  }

  const paragraphs = getParagraphsBetween(container, startP, endP);
  const spans: HTMLSpanElement[] = [];

  paragraphs.forEach((p) => {
    const subRange = document.createRange();
    if (p === startP) {
      subRange.setStart(range.startContainer, range.startOffset);
    } else {
      subRange.setStart(p, 0);
    }
    if (p === endP) {
      subRange.setEnd(range.endContainer, range.endOffset);
    } else {
      subRange.setEnd(p, p.childNodes.length);
    }

    if (subRange.collapsed) return;
    spans.push(wrapSingleRange(subRange, id, color));
  });

  return spans;
}

function unwrapSingleSpan(span: HTMLElement): void {
  const parent = span.parentNode;
  if (!parent) return;

  while (span.firstChild) {
    parent.insertBefore(span.firstChild, span);
  }
  parent.removeChild(span);
  parent.normalize();
}

/** Removes every span belonging to this annotation id (may be more than one
 * for a cross-paragraph highlight), not just a single passed-in span. */
export function unwrapHighlight(container: Element, id: string): void {
  const spans = getHighlightSpans(container, id);
  spans.forEach(unwrapSingleSpan);
}

/** Returns every span belonging to an annotation id, in document order. */
export function getHighlightSpans(container: Element, id: string): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      `.${HIGHLIGHT_CLASS}[data-annotation-id="${id}"]`
    )
  );
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