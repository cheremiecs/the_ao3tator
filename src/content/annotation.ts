import type { Annotation, AnnotatedWork, HighlightColor } from "./storage";

export function getWorkMetadata(): { title: string; author: string } {
  const title =
    document.querySelector("h2.title.heading")?.textContent?.trim() ?? "Untitled work";
  const author =
    document.querySelector(".byline a[rel='author']")?.textContent?.trim() ??
    "Unknown author";
  return { title, author };
}

export function createAnnotation(
  selectedText: string,
  color: HighlightColor
): Annotation {
  return {
    id: crypto.randomUUID(),
    chapter: 1,
    selectedText,
    note: "",
    color
  };
}

export function createWorkShell(workId: string): AnnotatedWork {
  const { title, author } = getWorkMetadata();
  return {
    workId,
    title,
    author,
    url: window.location.href,
    lastOpened: new Date().toISOString(),
    annotations: []
  };
}