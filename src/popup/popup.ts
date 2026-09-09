import {
  getAllWorks,
  deleteWork,
  exportAllWorks,
  importWorks,
  saveLastBackupDate,
  getLastBackupDate,
  type AnnotatedWork
} from "../content/storage";

const BACKUP_REMINDER_DAYS = 15;
const SUN_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`;
const MOON_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

const THEME_KEY = "darkModeEnabled";

async function setupThemeToggle(): Promise<void> {
  const toggleBtn = document.getElementById("theme-toggle-btn");
  if (!toggleBtn) return;

  const stored = await chrome.storage.local.get(THEME_KEY);
  let isDark = stored[THEME_KEY] === true;

  const applyTheme = () => {
    document.body.classList.toggle("dark-mode", isDark);
    toggleBtn.innerHTML = isDark ? SUN_ICON : MOON_ICON;
  };

  applyTheme();

  toggleBtn.addEventListener("click", async () => {
    isDark = !isDark;
    applyTheme();
    await chrome.storage.local.set({ [THEME_KEY]: isDark });
  });
}

function formatLastOpened(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function renderWorkItem(work: AnnotatedWork, onDeleted: () => void): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className = "work-item-wrapper";

  const item = document.createElement("button");
  item.type = "button";
  item.className = "work-item";

  const title = document.createElement("p");
  title.className = "work-title";
  title.textContent = work.title;

  const author = document.createElement("p");
  author.className = "work-author";
  author.textContent = work.author;

  const lastOpened = document.createElement("p");
  lastOpened.className = "work-last-opened";
  lastOpened.textContent = `Last opened ${formatLastOpened(work.lastOpened)}`;

  item.appendChild(title);
  item.appendChild(author);
  item.appendChild(lastOpened);

  item.addEventListener("click", () => {
    chrome.tabs.create({ url: work.url });
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "work-delete-btn";
  deleteBtn.textContent = "Delete";
  deleteBtn.title = "Delete this work and all its highlights/notes";
  deleteBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const confirmed = window.confirm(
      `Delete all highlights and notes for "${work.title}"? This can't be undone.`
    );
    if (!confirmed) return;

    await deleteWork(work.workId);
    onDeleted();
  });

  wrapper.appendChild(item);
  wrapper.appendChild(deleteBtn);
  return wrapper;
}

async function renderList(): Promise<void> {
  const listContainer = document.getElementById("work-list");
  if (!listContainer) return;

  listContainer.innerHTML = "";

  const works = await getAllWorks();
  works.sort(
    (a, b) => new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime()
  );

  if (works.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No annotated works yet.";
    listContainer.appendChild(empty);
    return;
  }

  works.forEach((work) => {
    listContainer.appendChild(renderWorkItem(work, renderList));
  });
}

async function checkBackupReminder(): Promise<void> {
  const reminder = document.getElementById("backup-reminder");
  if (!reminder) return;

  const lastBackup = await getLastBackupDate();
  let overdue = false;

  if (!lastBackup) {
    overdue = true;
  } else {
    const daysSince =
      (Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24);
    overdue = daysSince >= BACKUP_REMINDER_DAYS;
  }

  if (!overdue) {
    reminder.classList.remove("visible");
    reminder.innerHTML = "";
    return;
  }

  reminder.innerHTML = "";
  const text = document.createElement("p");
  text.style.margin = "0";
  text.textContent = lastBackup
    ? `It's been over ${BACKUP_REMINDER_DAYS} days since your last backup.`
    : "You haven't backed up your highlights yet.";

  const exportNowBtn = document.createElement("button");
  exportNowBtn.type = "button";
  exportNowBtn.textContent = "Export now";
  exportNowBtn.addEventListener("click", () => {
    document.getElementById("export-btn")?.click();
  });

  reminder.appendChild(text);
  reminder.appendChild(exportNowBtn);
  reminder.classList.add("visible");
}

function setupExportButton(): void {
  const exportBtn = document.getElementById("export-btn");
  if (!exportBtn) return;

  exportBtn.addEventListener("click", async () => {
    const works = await exportAllWorks();
    const json = JSON.stringify(works, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const dateStr = new Date().toISOString().split("T")[0];
    const a = document.createElement("a");
    a.href = url;
    a.download = `ao3-annotator-backup-${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);

    await saveLastBackupDate();
    await checkBackupReminder();
  });
}

function setupImportButton(): void {
  const importBtn = document.getElementById("import-btn");
  const fileInput = document.getElementById("import-file-input") as HTMLInputElement | null;
  if (!importBtn || !fileInput) return;

  importBtn.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!Array.isArray(parsed)) {
        window.alert("This doesn't look like a valid backup file.");
        return;
      }

      const looksValid = parsed.every(
        (w) =>
          typeof w === "object" &&
          typeof w.workId === "string" &&
          typeof w.title === "string" &&
          Array.isArray(w.annotations)
      );

      if (!looksValid) {
        window.alert("This doesn't look like a valid backup file.");
        return;
      }

      const confirmed = window.confirm(
        `Import ${parsed.length} work(s)? Any matching works already saved will be overwritten with the backup's version.`
      );
      if (!confirmed) return;

      await importWorks(parsed as AnnotatedWork[]);
      await renderList();
      window.alert("Import complete.");
    } catch {
      window.alert("Couldn't read that file. Make sure it's a valid backup JSON.");
    } finally {
      fileInput.value = "";
    }
  });
}

async function init(): Promise<void> {
  setupExportButton();
  setupImportButton();
  await setupThemeToggle();
  await checkBackupReminder();
  await renderList();
}

init();