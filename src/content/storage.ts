export type HighlightColor = "yellow" | "blue" | "green" | "pink";

export interface Annotation {
  id: string;
  chapter: number;
  chapterId: string | null; // AO3's chapter ID from the URL; null for older annotations saved before this existed
  selectedText: string;
  contextPrefix?: string; 
  contextSuffix?: string; 
  charOffset?: number; 
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
const LAST_BACKUP_KEY = "lastBackupDate"

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
  return Object.entries(all)
    .filter(([key]) => key.startsWith("work:"))
    .map(([, value]) => value as AnnotatedWork);
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

// Backup / restore 

export async function saveLastBackupDate(): Promise<void> {
  await chrome.storage.local.set({ [LAST_BACKUP_KEY]: new Date().toISOString() });
}

export async function getLastBackupDate(): Promise<string | null> {
  const result = await chrome.storage.local.get(LAST_BACKUP_KEY);
  return result[LAST_BACKUP_KEY] ?? null;
}

export async function exportAllWorks(): Promise<AnnotatedWork[]> {
  return await getAllWorks();
}

export async function importWorks(works: AnnotatedWork[]): Promise<void> {
  for (const work of works) {
    await saveWork(work);
  }
}