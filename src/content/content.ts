import { getWork, saveWork } from "./storage";
import { createAnnotation, createWorkShell } from "./annotation";
import { findTextRange, wrapRangeAsHighlight } from "./highlight";
import { showColorPopover, removeColorPopover } from "./popover";

const STORY_CONTAINER_SELECTOR = "#workskin";

function getWorkId(): string | null {
  const match = window.location.pathname.match(/\/works\/(\d+)/);
  return match ? match[1] : null;
}

function getStoryContainer(): Element | null {
  return document.querySelector(STORY_CONTAINER_SELECTOR);
}

async function restoreHighlights(workId: string, container: Element): Promise<void> {
  const work = await getWork(workId);
  if (!work) return;

  for (const annotation of work.annotations) {
    const range = findTextRange(container, annotation.selectedText);
    if (!range) {
      console.warn(
        `[AO3 Annotator] Could not restore highlight ${annotation.id} — text not found.`
      );
      continue;
    }
    wrapRangeAsHighlight(range, annotation.id, annotation.color);
  }
}

function handleSelection(workId: string, container: Element): void {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  const selectedText = range.toString().trim();
  if (!selectedText) return;

  if (!container.contains(range.commonAncestorContainer)) return;

  // Reject selections that cross paragraph boundaries — wrapping these in a
  // single highlight span corrupts the DOM. Proper multi-paragraph support
  // is Phase 3 work.
  const startParagraph = range.startContainer.nodeType === 3
    ? range.startContainer.parentElement?.closest("p")
    : (range.startContainer as HTMLElement).closest("p");
  const endParagraph = range.endContainer.nodeType === 3
    ? range.endContainer.parentElement?.closest("p")
    : (range.endContainer as HTMLElement).closest("p");

  if (!startParagraph || !endParagraph || startParagraph !== endParagraph) {
    console.warn("[AO3 Annotator] Highlighting across paragraphs isn't supported yet.");
    selection.removeAllRanges();
    return;
  }

  const rect = range.getBoundingClientRect();
  showColorPopover(rect.left, rect.bottom + 6, async (color) => {
    const rangeCopy = range.cloneRange();
    const annotation = createAnnotation(selectedText, color);
    wrapRangeAsHighlight(rangeCopy, annotation.id, annotation.color);

    const existing = (await getWork(workId)) ?? createWorkShell(workId);
    existing.annotations.push(annotation);
    existing.lastOpened = new Date().toISOString();
    await saveWork(existing);

    selection.removeAllRanges();
    console.log(`[AO3 Annotator] Saved highlight ${annotation.id}`);
  });
}

async function init(): Promise<void> {
  const workId = getWorkId();
  if (!workId) return;

  const container = getStoryContainer();
  if (!container) {
    console.warn("[AO3 Annotator] Story container not found on this page.");
    return;
  }

  console.log(`[AO3 Annotator] Loaded on work ${workId}`);

  await restoreHighlights(workId, container);

  // Close any leftover popover the instant a new selection starts,
  // so it never blocks the mousedown that begins a new drag-select.
  document.addEventListener("mousedown", (e) => {
    if ((e.target as HTMLElement)?.closest("#ao3-annotator-popover")) return;
    removeColorPopover();
  });

  document.addEventListener("mouseup", (e) => {
    if ((e.target as HTMLElement)?.closest("#ao3-annotator-popover")) return;
    handleSelection(workId, container);
  });
}

init();
