// Phase 0: confirm popup loads and can read chrome.storage.local.
// Phase 4 will replace this with the full Library UI.

async function init(): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const workCount = Object.keys(all).length;

  const status = document.getElementById("status");
  if (status) {
    status.textContent =
      workCount === 0
        ? "No annotated works yet."
        : `${workCount} annotated work(s) saved.`;
  }
}

init();
