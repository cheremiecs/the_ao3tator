export type HighlightColor = "yellow" | "blue" | "green" | "pink";

export interface Annotation {
  id: string;
  chapter: number;
  chapterId: string | null; // AO3's chapter ID from the URL; null for older annotations saved before this existed
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
  lastOpened: string; //timestamp
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

export async function deleteWork(workId: string): Promise<void> {
  await chrome.storage.local.remove(storageKey(workId));
}

export async function getAllWorks(): Promise<AnnotatedWork[]> {
  const all = await chrome.storage.local.get(null);
  return Object.values(all) as AnnotatedWork[];
}

export async function updateAnnotation(
  workId: string,
  annotationId: string,
  changes: Partial<Pick<Annotation, "note" | "color">>
): Promise<void> {
  const work = await getWork(workId);
  if (!work) return;

  const annotation = work.annotations.find((a) => a.id === annotationId);
  if (!annotation) return;

  Object.assign(annotation, changes);
  await saveWork(work);
}

export async function deleteAnnotation(workId: string, annotationId: string): Promise<void> {
  const work = await getWork(workId);
  if (!work) return;

  work.annotations = work.annotations.filter((a) => a.id !== annotationId);
  await saveWork(work);
}