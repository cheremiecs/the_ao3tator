import type { HighlightColor } from "./storage";

export const HIGHLIGHT_CLASS = "ao3-annotator-highlight";

export const COLOR_HEX: Record<HighlightColor, string> = {
  yellow: "#FAC775",
  blue: "#85B7EB",
  green: "#97C459",
  pink: "#ED93B1"
};

const BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, blockquote, li, dd, dt";

function wrapSingleRange(range: Range, id: string, color: HighlightColor): HTMLSpanElement[] {
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

  const rawRoot = range.commonAncestorContainer;
  const root = rawRoot.nodeType === Node.TEXT_NODE ? rawRoot.parentElement! : rawRoot;
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
    if (!textNode.data.trim()) return;
    const nodeRange = document.createRange();
    nodeRange.selectNode(textNode);

    const span = document.createElement("span");
    span.className = HIGHLIGHT_CLASS;
    span.dataset.annotationId = id;
    span.style.backgroundColor = COLOR_HEX[color];
    span.style.borderRadius = "0";

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

export function unwrapHighlight(container: Element, id: string): void {
  const spans = getHighlightSpans(container, id);
  spans.forEach(unwrapSingleSpan);
}

export function getHighlightSpans(container: Element, id: string): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      `.${HIGHLIGHT_CLASS}[data-annotation-id="${id}"]`
    )
  );
}

/**
 * Returns how many characters of text come before the start of the
 * selection, counting from the start of the container. Leading whitespace
 * inside the selection is skipped, because the saved text is trimmed.
 * Call this before any highlight spans are added.
 */
export function getRangeStartOffset(container: Element, range: Range): number {
  const before = document.createRange();
  before.selectNodeContents(container);
  before.setEnd(range.startContainer, range.startOffset);

  const raw = range.toString();
  const leadingWhitespace = raw.length - raw.replace(/^\s+/, "").length;
  return before.toString().length + leadingWhitespace;
}

/**
 * When the same text appears more than once, pick the match that sits
 * closest to the position saved when the highlight was made. With no saved
 * position (older highlights), the first match is used.
 */
function pickMatchIndex(combined: string, text: string, preferredOffset?: number): number {
  const first = combined.indexOf(text);
  if (first === -1 || preferredOffset === undefined) return first;

  let best = first;
  let bestDistance = Math.abs(first - preferredOffset);
  let next = combined.indexOf(text, first + 1);
  while (next !== -1) {
    const distance = Math.abs(next - preferredOffset);
    if (distance < bestDistance) {
      best = next;
      bestDistance = distance;
    }
    next = combined.indexOf(text, next + 1);
  }
  return best;
}

export function findTextRange(
  container: Element,
  text: string,
  preferredOffset?: number
): Range | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);

  const nodes: Text[] = [];
  let combined = "";
  let node: Node | null;
  while ((node = walker.nextNode())) {
    nodes.push(node as Text);
    combined += (node as Text).data;
  }

  const index = pickMatchIndex(combined, text, preferredOffset);
  if (index === -1) return null;

  const start = locateStart(nodes, index);
  const end = locateEnd(nodes, index + text.length);
  if (!start || !end) return null;

  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
}

function locateStart(nodes: Text[], globalOffset: number): { node: Text; offset: number } | null {
  let remaining = globalOffset;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (remaining < n.data.length) {
      return { node: n, offset: remaining };
    }
    if (remaining === n.data.length) {
      if (i + 1 < nodes.length) {
        return { node: nodes[i + 1], offset: 0 };
      }
      return { node: n, offset: remaining };
    }
    remaining -= n.data.length;
  }
  return null;
}

function locateEnd(nodes: Text[], globalOffset: number): { node: Text; offset: number } | null {
  let remaining = globalOffset;
  for (const n of nodes) {
    if (remaining <= n.data.length) {
      return { node: n, offset: remaining };
    }
    remaining -= n.data.length;
  }
  return null;
}