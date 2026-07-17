// Shared types + storage helpers, matching the data structure defined in CLAUDE.md.
// Phase 1 will start writing to these; Phase 3 will add the context/offset fields
// to make re-anchoring reliable.

export type HighlightColor = "yellow" | "blue" | "green" | "pink";

export interface Annotation {
  id: string;
  chapter: number;
  selectedText: string;
  contextPrefix?: string; // added in Phase 3
  contextSuffix?: string; // added in Phase 3
  charOffset?: number; // added in Phase 3
  note: string;
  color: HighlightColor;
}

export interface AnnotatedWork {
  workId: string;
  title: string;
  author: string;
  url: string;
  lastOpened: string; // ISO timestamp
  annotations: Annotation[];
}

const storageKey = (workId: string) => `work:${workId}`;

export async function getWork(workId: string): Promise<AnnotatedWork | null> {
  const result = await chrome.storage.local.get(storageKey(workId));
  return result[storageKey(workId)] ?? null;
}

export async function saveWork(work: AnnotatedWork): Promise<void> {
  await chrome.storage.local.set({ [storageKey(work.workId)]: work });
}

export async function getAllWorks(): Promise<AnnotatedWork[]> {
  const all = await chrome.storage.local.get(null);
  return Object.values(all) as AnnotatedWork[];
}
