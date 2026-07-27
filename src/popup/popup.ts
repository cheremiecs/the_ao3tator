import { getAllWorks, deleteWork, type AnnotatedWork } from "../content/storage";

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
    e.stopPropagation(); // don't trigger the item's own click (opening a tab)
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

renderList();