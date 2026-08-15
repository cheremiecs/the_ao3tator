import type { Annotation, AnnotatedWork, HighlightColor } from "./storage";

//grabs the fic's title and author name
export function getWorkMetadata(): { title: string; author: string } {
  const title =
    document.querySelector("h2.title.heading")?.textContent?.trim() ?? "Untitled work";
  const author =
    document.querySelector(".byline a[rel='author']")?.textContent?.trim() ??
    "Unknown author";
  return { title, author };
}

//grabs the fic's chapter/s
function getCurrentChapterId(): string | null {
  const match = window.location.pathname.match(/\/chapters\/(\d+)/);
  return match ? match[1] : null;
}

//random unique ID, the chapter, empty note slot 
export function createAnnotation(
  selectedText: string,
  color: HighlightColor
): Annotation {
  return {
    id: crypto.randomUUID(),
    chapter: 1, //useless, was added before multichapter fics were considered, will remove this i prommy 
    chapterId: getCurrentChapterId(),
    selectedText,
    note: "",
    color
  };
}

//container ready to hold all future highlights for hihglighted fic
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