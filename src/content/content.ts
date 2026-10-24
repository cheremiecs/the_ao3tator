import { getWork, saveWork, updateAnnotation, deleteAnnotation } from "./storage";
import { createAnnotation, createWorkShell } from "./annotation";
import {
  findTextRange,
  getRangeStartOffset,
  wrapRangeAsHighlight,
  unwrapHighlight,
  getHighlightSpans,
  HIGHLIGHT_CLASS,
  COLOR_HEX
} from "./highlight";
import {
  showColorPopover,
  showNotePopover,
  removeColorPopover,
  showMissingHighlightsBanner,
  setPopoverDarkMode
} from "./popover";

const STORY_CONTAINER_SELECTOR = "#main";
const THEME_KEY = "darkModeEnabled";

function getWorkId(): string | null {
  const match = window.location.pathname.match(/\/works\/(\d+)/);
  return match ? match[1] : null;
}

function getCurrentChapterId(): string | null {
  const match = window.location.pathname.match(/\/chapters\/(\d+)/);
  return match ? match[1] : null;
}

function getStoryContainer(): Element | null {
  return document.querySelector(STORY_CONTAINER_SELECTOR);
}

async function syncPopoverTheme(): Promise<void> {
  const stored = await chrome.storage.local.get(THEME_KEY);
  setPopoverDarkMode(stored[THEME_KEY] === true);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && THEME_KEY in changes) {
      setPopoverDarkMode(changes[THEME_KEY].newValue === true);
    }
  });
}

// Re-applies saved highlights when a page loads
async function restoreHighlights(workId: string, container: Element): Promise<void> {
  const work = await getWork(workId);
  if (!work) return;

  const currentChapterId = getCurrentChapterId();
  let missingCount = 0;

  for (const annotation of work.annotations) {
    const belongsToOtherChapter =
      annotation.chapterId !== null &&
      currentChapterId !== null &&
      annotation.chapterId !== currentChapterId;
    if (belongsToOtherChapter) continue;

    const range = findTextRange(container, annotation.selectedText, annotation.charOffset);
    if (!range) {
      if (annotation.chapterId !== null) {
        missingCount++;
      }
      continue;
    }

    wrapRangeAsHighlight(range, annotation.id, annotation.color, container);
  }

  if (missingCount > 0) {
    showMissingHighlightsBanner(missingCount);
  }
}

function handleSelection(workId: string, container: Element): void {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  const selectedText = range.toString().trim();
  if (!selectedText) return;

  if (!container.contains(range.commonAncestorContainer)) return;

  const charOffset = getRangeStartOffset(container, range);

  const rect = range.getBoundingClientRect();
  showColorPopover(rect.left, rect.bottom + 6, async (color) => {
    const rangeCopy = range.cloneRange();
    const annotation = createAnnotation(selectedText, color, charOffset);
    wrapRangeAsHighlight(rangeCopy, annotation.id, annotation.color, container);

    const existing = (await getWork(workId)) ?? createWorkShell(workId);
    existing.annotations.push(annotation);
    existing.lastOpened = new Date().toISOString();
    await saveWork(existing);

    selection.removeAllRanges();
  });
}

function handleHighlightClick(workId: string, span: HTMLElement, container: Element): void {
  const annotationId = span.dataset.annotationId;
  if (!annotationId) return;

  getWork(workId).then((work) => {
    const annotation = work?.annotations.find((a) => a.id === annotationId);
    if (!annotation) return;

    const rect = span.getBoundingClientRect();
    showNotePopover(rect.left, rect.bottom + 6, annotation.note, annotation.color, {
      onSave: async (note) => {
        await updateAnnotation(workId, annotationId, { note });
      },
      onDeleteNote: async () => {
        await updateAnnotation(workId, annotationId, { note: "" });
      },
      onDeleteHighlight: async () => {
        await deleteAnnotation(workId, annotationId);
        unwrapHighlight(container, annotationId);
      },
      onColorChange: async (color) => {
        const spans = getHighlightSpans(container, annotationId);
        spans.forEach((s) => {
          s.style.backgroundColor = COLOR_HEX[color];
        });
        await updateAnnotation(workId, annotationId, { color });
      }
    });
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

  const existingWork = await getWork(workId);
  if (existingWork) {
    existingWork.lastOpened = new Date().toISOString();
    await saveWork(existingWork);
  }

  await syncPopoverTheme();
  await restoreHighlights(workId, container);

  document.addEventListener("mousedown", (e) => {
    if ((e.target as HTMLElement)?.closest("#ao3-annotator-popover")) return;
    removeColorPopover();
  });

  document.addEventListener("mouseup", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest("#ao3-annotator-popover")) return;

    const highlightSpan = target.closest(`.${HIGHLIGHT_CLASS}`) as HTMLElement | null;
    if (highlightSpan && window.getSelection()?.isCollapsed) {
      handleHighlightClick(workId, highlightSpan, container);
      return;
    }

    handleSelection(workId, container);
  });
}

init();