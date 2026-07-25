import type { HighlightColor } from "./storage";

export const HIGHLIGHT_CLASS = "ao3-annotator-highlight";

export const COLOR_HEX: Record<HighlightColor, string> = {
  yellow: "#FAC775",
  blue: "#85B7EB",
  green: "#97C459",
  pink: "#ED93B1"
};

// Elements treated as "block" boundaries for splitting cross-block
// selections — covers story paragraphs as well as the title, byline,
// summary, and notes sections, which don't use <p> tags.
const BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, blockquote, li, dd, dt";

function wrapSingleRange(range: Range, id: string, color: HighlightColor): HTMLSpanElement {
  // Split text nodes exactly at the range's start/end so the boundaries
  // land on clean node edges. This makes surroundContents() succeed
  // reliably instead of falling back to extractContents(), which could
  // scoop up more of the DOM than intended if the range boundaries didn't
  // align with existing nodes.
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const startNode = range.startContainer as Text;
    if (range.startOffset > 0 && range.startOffset < startNode.length) {
      const newNode = startNode.splitText(range.startOffset);
      range.setStart(newNode, 0);
    }
  }
  if (range.endContainer.nodeType === Node.TEXT_NODE) {
    const endNode = range.endContainer as Text;
    if (range.endOffset > 0 && range.endOffset < endNode.length) {
      endNode.splitText(range.endOffset);
    }
  }

  const span = document.createElement("span");
  span.className = HIGHLIGHT_CLASS;
  span.dataset.annotationId = id;
  span.style.backgroundColor = COLOR_HEX[color];
  span.style.borderRadius = "2px";

  try {
    range.surroundContents(span);
  } catch (err) {
    console.error("[AO3 Annotator] surroundContents failed even after split:", err);
    return span;
  }

  return span;
}

function getContainingParagraph(node: Node): HTMLElement | null {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return el?.closest(BLOCK_SELECTOR) ?? null;
}

/**
 * Returns every block-level element matching BLOCK_SELECTOR, but only the
 * "leaf" ones — if a <blockquote> contains a <p>, only the <p> is kept.
 * Without this, an element like <blockquote><p>text</p></blockquote> would
 * be counted twice (once as the blockquote, once as the p), causing the
 * splitting logic to wrap the same text twice — once correctly, and once
 * as an invalid <span> wrapped around the whole <p> — which silently
 * breaks the highlight color on the second wrap.
 */
function getLeafBlocks(container: Element): HTMLElement[] {
  const candidates = Array.from(container.querySelectorAll<HTMLElement>(BLOCK_SELECTOR));
  return candidates.filter(
    (el) => !candidates.some((other) => other !== el && el.contains(other))
  );
}

function getParagraphsBetween(
  container: Element,
  startP: HTMLElement,
  endP: HTMLElement
): HTMLElement[] {
  const allParagraphs = getLeafBlocks(container);
  const startIndex = allParagraphs.indexOf(startP);
  const endIndex = allParagraphs.indexOf(endP);
  if (startIndex === -1 || endIndex === -1) return [];
  const [lo, hi] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
  return allParagraphs.slice(lo, hi + 1);
}

/**
 * Wraps a Range in one or more <span> highlight elements, all sharing the
 * same annotation id. If the range stays within a single block element
 * (paragraph, heading, blockquote, etc.), this produces one span. If it
 * spans multiple block elements, it splits the range at block boundaries
 * and wraps each block's portion in its own span — a single <span> can't
 * legally wrap block-level content across multiple blocks, so this is the
 * correct way to highlight across them instead of forcing one broken span.
 *
 * `container` is required to resolve cross-block splits; without it
 * (or if start/end aren't inside a recognized block element), falls back
 * to a single-span wrap.
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
 * for a cross-block highlight), not just a single passed-in span. */
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