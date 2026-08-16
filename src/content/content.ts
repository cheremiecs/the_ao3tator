import { getWork, saveWork, updateAnnotation, deleteAnnotation } from "./storage";
import { createAnnotation, createWorkShell } from "./annotation";
import {
  findTextRange,
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
  showMissingHighlightsBanner
} from "./popover";

const STORY_CONTAINER_SELECTOR = "#main";

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

//re-applies saved highlights when a page loads
async function restoreHighlights(workId: string, container: Element): Promise<void> {
  const work = await getWork(workId);
  if (!work) return;

  const currentChapterId = getCurrentChapterId();
  let missingCount = 0; //track how many highlights end up missing

//if highlight is clearly tagged as belonging to some other chapter, don't restore it, move on to the next saved highlight
  for (const annotation of work.annotations) { 
    const belongsToOtherChapter =
      annotation.chapterId !== null && 
      currentChapterId !== null && 
      annotation.chapterId !== currentChapterId; 
    if (belongsToOtherChapter) continue;

    const range = findTextRange(container, annotation.selectedText);
    if (!range) {
      /*
      console.warn(
        `[AO3 Annotator] Could not restore highlight ${annotation.id} — text not found.`
      ); 
      */
      if (annotation.chapterId !== null) {
        missingCount++;
      }
      continue;
    }

    const foundText = range.toString();
    if (foundText !== annotation.selectedText) {
      /*
      console.error(
        `[AO3 Annotator] MISMATCH for ${annotation.id}:`,
        "\n  expected:", JSON.stringify(annotation.selectedText),
        "\n  found:   ", JSON.stringify(foundText)
      );
      */
    } else {
      /*
      console.log(`[AO3 Annotator] OK ${annotation.id}:`, JSON.stringify(foundText));
      */
    } 
    wrapRangeAsHighlight(range, annotation.id, annotation.color, container);
  }

  if (missingCount > 0) {
    showMissingHighlightsBanner(missingCount);
  }
}

//finishes a text selection, shows the color popup if it's valid, builds the highlight, paints it on the page, saves it to storage, and cleans up the selection
function handleSelection(workId: string, container: Element): void {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  const selectedText = range.toString().trim();
  if (!selectedText) return;

  if (!container.contains(range.commonAncestorContainer)) return; 

  const rect = range.getBoundingClientRect();
  showColorPopover(rect.left, rect.bottom + 6, 
    async (color) => {
    const rangeCopy = range.cloneRange();
    //console.log(`[AO3 Annotator] About to save:`, JSON.stringify(selectedText));
    const annotation = createAnnotation(selectedText, color);
    wrapRangeAsHighlight(rangeCopy, annotation.id, annotation.color, container);

    //const actuallyWrapped = spans.map((s) => s.textContent).join("");
    //console.log(`[AO3 Annotator] Actually wrapped:`, JSON.stringify(actuallyWrapped));

    const existing = (await getWork(workId)) ?? createWorkShell(workId);
    existing.annotations.push(annotation);
    existing.lastOpened = new Date().toISOString();
    await saveWork(existing);

    selection.removeAllRanges();
    //console.log(`[AO3 Annotator] Saved highlight ${annotation.id}`);
  });
}

//opens the note popover/ save a note, delete a note, delete the whole highlight, or changing color
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
        //console.log(`[AO3 Annotator] Updated note on ${annotationId}`);
      },
      onDeleteNote: async () => {
        await updateAnnotation(workId, annotationId, { note: "" });
        //console.log(`[AO3 Annotator] Deleted note on ${annotationId}`);
      },
      onDeleteHighlight: async () => {
        await deleteAnnotation(workId, annotationId);
        unwrapHighlight(container, annotationId);
        //console.log(`[AO3 Annotator] Deleted highlight ${annotationId}`);
      },
      onColorChange: async (color) => {
        const spans = getHighlightSpans(container, annotationId);
        spans.forEach((s) => {
          s.style.backgroundColor = COLOR_HEX[color];
        });
        await updateAnnotation(workId, annotationId, { color });
        //console.log(`[AO3 Annotator] Recolored highlight ${annotationId} to ${color}`);
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

  console.log(`[AO3 Annotator] Loaded on work ${workId}`);

  const existingWork = await getWork(workId);
  if (existingWork) {
    existingWork.lastOpened = new Date().toISOString();
    await saveWork(existingWork);
  }

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