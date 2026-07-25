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

/**
 * Wraps every individual text node touched by `range` in its own <span>,
 * rather than trying to wrap the whole range in one <span> via
 * surroundContents(). A single, fully-contained text node can always be
 * wrapped safely — surroundContents() only fails when a node (element or
 * text) is *partially* contained, which can't happen once we've split text
 * nodes at the boundaries and are wrapping one text node at a time. This
 * also correctly handles ranges that pass through inline elements (links,
 * italics, hidden markup, etc.) without needing to guess what those are.
 */
function wrapSingleRange(range: Range, id: string, color: HighlightColor): HTMLSpanElement[] {
  // Split text nodes exactly at the range's start/end so the boundaries
  // land on clean node edges instead of mid-text.
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

  // Collect every text node that falls within the now boundary-aligned range.
  const root = range.commonAncestorContainer;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (range.intersectsNode(node)) {
      textNodes.push(node as Text);
    }
  }

  const spans: HTMLSpanElement[] = [];
  textNodes.forEach((textNode) => {
    if (!textNode.data) return; // skip empty nodes left over from splitting
    const nodeRange = document.createRange();
    nodeRange.selectNode(textNode);

    const span = document.createElement("span");
    span.className = HIGHLIGHT_CLASS;
    span.dataset.annotationId = id;
    span.style.backgroundColor = COLOR_HEX[color];
    span.style.borderRadius = "2px";

    try {
      nodeRange.surroundContents(span);
      spans.push(span);
    } catch (err) {
      console.error("[AO3 Annotator] Failed to wrap a text node:", err);
    }
  });

  return spans;
}

function getContainingParagraph(node: Node): HTMLElement | null {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return el?.closest(BLOCK_SELECTOR) ?? null;
}

/**
 * Returns every block-level element matching BLOCK_SELECTOR, but only the
 * "leaf" ones — if a <blockquote> contains a <p>, only the <p> is kept.
 * Without this, an element like <blockquote><p>text</p></blockquote> would
 * be counted twice, causing the splitting logic to attempt to wrap the
 * same text twice.
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
 * same annotation id. Handles selections within a single block, selections
 * crossing multiple blocks (paragraphs, headings, etc.), and selections
 * that pass through inline elements — in all cases by wrapping each
 * intersected text node individually rather than trying to wrap a whole
 * range in one span.
 *
 * `container` is required to resolve cross-block splits; without it (or if
 * start/end aren't inside a recognized block element), falls back to
 * treating the whole range as a single block.
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
    return wrapSingleRange(range, id, color);
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
    spans.push(...wrapSingleRange(subRange, id, color));
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

/** Removes every span belonging to this annotation id (there may now be
 * several per highlight — one per text node it touches). */
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