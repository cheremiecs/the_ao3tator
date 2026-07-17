// Phase 0: confirm the content script is injecting correctly on AO3 work pages.
// Phase 1 will replace this with actual highlight-selection logic.

function getWorkId(): string | null {
  const match = window.location.pathname.match(/\/works\/(\d+)/);
  return match ? match[1] : null;
}

function init(): void {
  const workId = getWorkId();

  if (!workId) {
    // Not a work page (e.g. a series or tag listing page) — do nothing.
    return;
  }

  console.log(`[AO3 Annotator] Loaded on work ${workId}`);

  // Phase 1 will hook into text selection here, e.g.:
  // document.addEventListener("mouseup", handleSelection);
}

init();
