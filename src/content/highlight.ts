import type { HighlightColor } from "./storage";

export const HIGHLIGHT_CLASS = "ao3-annotator-highlight";

export const COLOR_HEX: Record<HighlightColor, string> = {
  yellow: "#FAC775",
  blue: "#85B7EB",
  green: "#97C459",
  pink: "#ED93B1"
};

//p for paragrapgh; h1-h6 for headings; blockquote for summary/notes; li for list items; dd/dt for definition lists
const BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, blockquote, li, dd, dt";

/*
single <span> can't legally wrap a range that only partially touches an element like <em>. 
So the fix, wrapping each text node separately, solves the "color completely fails" problem, 
but introduces this smaller cosmetic side effect of visible seams between spans.
*/

function wrapSingleRange(range: Range, id: string, color: HighlightColor): HTMLSpanElement[] {
  if (range.startContainer.nodeType === Node.TEXT_NODE) { //is the point where this selection starts actually inside a text node
    const startNode = range.startContainer as Text; 
    if (range.startOffset > 0 && range.startOffset < startNode.length) { //cut the text node into two pieces if the selection starts in the middle of it
      const newNode = startNode.splitText(range.startOffset);
      range.setStart(newNode, 0);
    }
  }
  if (range.endContainer.nodeType === Node.TEXT_NODE) { //clean up the end of the selection in the same way, if it ends in the middle of a text node
    const endNode = range.endContainer as Text;
    if (range.endOffset > 0 && range.endOffset < endNode.length) {
      endNode.splitText(range.endOffset);
    }
  }

  /* If the whole selection sits inside one text node, commonAncestorContainer
   IS that text node — but a TreeWalker rooted at a Text node has no
  children to walk. Use the parent element instead whenever the root
  itself is a text node.
  */
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
    if (!textNode.data) return;
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

// Returns the closest block-level element containing the given node, or null if none is found.
function getContainingParagraph(node: Node): HTMLElement | null {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return el?.closest(BLOCK_SELECTOR) ?? null;
}

/*
 Returns every block-level element matching BLOCK_SELECTOR, but only the
 "leaf" ones — if a <blockquote> contains a <p>, only the <p> is kept.
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

/*
 Finds the first occurrence of `text` inside `container` and returns a
 Range spanning it. Text nodes are concatenated with no separator between
 them, so a match can begin or end exactly at a paragraph boundary —
 locateStart/locateEnd below handle that boundary case so the range gets
 attributed to the correct paragraph on each side.
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

  const start = locateStart(nodes, index);
  const end = locateEnd(nodes, index + text.length);
  if (!start || !end) return null;

  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
}

/*
  Resolves a start offset. When the offset falls exactly at the boundary
  between two text nodes (i.e. exactly at the end of one node), prefers the
  START of the NEXT node rather than the end of the current one — same
  point in the document, but correctly attributes the match to the
  paragraph the selected text actually begins in, not the paragraph that
  happens to end at that seam.
 */
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

/*
  Resolves an end offset. Stays at the end of the current node on an exact
  boundary — the last matched character is the last character of that
  node, so it correctly belongs to that node's paragraph.
 */
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