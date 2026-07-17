# AO3 Annotator

## Project Overview

A Chrome browser extension (Manifest V3) that lets readers privately annotate
fanfiction on Archive of Our Own (AO3). Users highlight passages, attach notes,
and everything persists locally via `chrome.storage.local` — no accounts, no
cloud sync, nothing uploaded anywhere.

Working name: **AO3 Annotator**. Alternatives considered: FicNotes, Marginalia,
Inkmarks, AO3 Reader.

## Core Goal

Build a private annotation system similar to Kindle/Apple Books margin notes,
but specifically for AO3. Readers should be able to highlight favorite
passages, write personal notes, revisit them later, and browse a personal
library of annotated works — without AO3 ever knowing or being modified.

## Design Principles

- No user accounts, ever.
- Local-first storage only (`chrome.storage.local`, later `unlimitedStorage`).
- Never interfere with AO3's normal functionality, layout, or accessibility.
- Minimize UI clutter — should feel like a built-in reading tool, not a bolted-on plugin.
- Annotation should be effortless: select text → highlight → optional note, nothing more.
- PDF export (later phase) is explicitly personal-use only, to respect authors.

## Target Platform

- Chrome Extension, Manifest V3
- Should also work unmodified on Chromium browsers: Opera, Edge, Brave

## Tech Stack

- TypeScript (preferred over plain JS)
- HTML/CSS for popup and sidebar UI
- Chrome Extension APIs: Content Scripts, `chrome.storage.local`
- PDF generation: `pdf-lib` — Phase 7 only, generated from DOM content directly (not AO3's native PDF export, see Phase 7 notes)
- Text-anchoring approach inspired by `dom-anchor-text-quote` (prefix/suffix + offset fallback)

## Project Structure

```
ao3-annotator/
manifest.json
src/
├── content/
│   ├── content.ts
│   ├── highlight.ts
│   ├── annotation.ts
│   └── storage.ts
├── popup/
│   ├── popup.html
│   ├── popup.ts
│   └── popup.css
├── library/
│   ├── library.ts
│   └── library.css
├── pdf/
│   └── export.ts
└── assets/
```

## Data Structure

Each AO3 work has its own annotation collection:

```json
{
  "workId": "63829213",
  "title": "Crimson Rivers",
  "author": "example_author",
  "url": "...",
  "lastOpened": "...",
  "annotations": [
    {
      "id": "...",
      "chapter": 1,
      "selectedText": "...",
      "contextPrefix": "...",
      "contextSuffix": "...",
      "charOffset": 0,
      "note": "...",
      "color": "yellow"
    }
  ]
}
```

`contextPrefix`/`contextSuffix`/`charOffset` support robust re-anchoring (see
Phase 3) — don't rely on exact-substring matching alone once past Phase 1.

## Known Hard Problems (design for these early)

1. **Highlight re-anchoring.** AO3's DOM can shift (typo fixes, work skins,
   chapter restructuring). Exact-text matching alone will silently fail or
   false-positive on common phrases. Store surrounding context + offset as
   fallback anchors, and decide explicitly what happens when a highlight
   can't be relocated (drop silently vs. flag in sidebar).
2. **Multi-chapter / "entire work" view.** AO3 supports reading chapter-by-
   chapter or as one long page. Content script must detect view mode and
   adjust offsets/restoration accordingly — annotations made in one mode must
   still restore in the other.
3. **Storage limits.** Default `chrome.storage.local` quota (~10MB) may not
   be enough for heavy annotators. Request `unlimitedStorage` permission from
   the start.
4. **Login-gated / mature content.** Content script must still fire correctly
   on works behind the login/18+ click-through gate.

## Phases

### Phase 0 — Setup (1–2 days)
Environment ready, no features yet.
- Scaffold repo with structure above
- "Hello World" Manifest V3 extension loads unpacked in Chrome
- TypeScript build configured (esbuild or vite)
- Content script confirmed injecting only on `archiveofourown.org/works/*`
- **Done when:** console.log fires from the extension on a real AO3 work page

### Phase 1 — Highlighting core (Week 1)
Select text, save a highlight, see it persist across a refresh. Single
session, single chapter, exact-text matching is fine for now.
- Text selection → popup with color options (yellow/blue/green/pink)
- Apply highlight as inline `<span>` wrapping the selected DOM range
- Save to `chrome.storage.local`
- Re-find and re-apply saved highlights on page load
- **Done when:** highlight a sentence, refresh, it's still highlighted

### Phase 2 — Notes (Week 2)
Attach, edit, delete notes on existing highlights.
- Click a highlight → popover to add/edit a note
- Note persists alongside the highlight
- Delete note without deleting the highlight
- Delete highlight (removes its note too)
- **Done when:** full create/edit/delete cycle works and survives a refresh

### Phase 3 — Robust anchoring & multi-chapter (Week 3)
Fix the fragile part before building more on top of it.
- Store prefix/suffix context + char offset, not just exact string match
- Handle "entire work" view vs. per-chapter view
- Graceful failure when a highlight can't be relocated
- **Done when:** highlights survive across view-mode switches and a manually
  edited passage doesn't crash anything

### Phase 4 — Library popup (Week 4)
Extension icon → popup showing every annotated work.
- Popup UI: title, author, highlight count, note count, last opened
- Click a work → opens that AO3 URL
- Update `lastOpened` on visit
- **Done when:** you can browse annotated works without digging through AO3 history

### Phase 5 — Sidebar (Week 5)
In-page collapsible panel listing annotations for the current work.
- Lists annotations in reading order with text preview + note
- Click → scrolls to that passage
- Edit/delete directly from sidebar
- Both inline highlight edits and sidebar edits go through a single shared
  `updateAnnotation(id, changes)` function — no duplicated update logic
- **Done when:** editing from either the sidebar or inline stays in sync

### Phase 6 — Polish pass (Week 6)
Make it feel like a real product, not a prototype.
- Empty states (no annotations yet, empty library)
- Visual polish that complements AO3's aesthetic without clashing
- Switch to `unlimitedStorage` permission
- Manual test pass on Brave/Edge/Opera
- Basic error handling (storage quota, malformed data, deleted works)
- **Done when:** comfortable having someone else install it

### Phase 7 — Stretch: PDF export (Week 7+)
Only after everything above is solid.
- **Library: `pdf-lib`.** Chosen over jsPDF for its friendlier document-layout
  API (text flow, embedded fonts, drawing highlight rectangles, appending
  endnote sections) and because it works fine in a browser/extension context.
- **Generate the PDF from the extension's own DOM content, not from AO3's
  native "Download PDF."** Considered post-processing AO3's server-generated
  PDF instead, but rejected: AO3's PDF layout (fonts, line/page breaks) is
  decided server-side and out of the extension's control, so matching
  highighted passages to exact pixel coordinates in an already-rendered PDF
  requires `pdf.js` text extraction + coordinate mapping — more fragile and
  more work than just building the PDF directly from content the extension
  already has (it already stores `selectedText`, `chapter`, `note`, `color` —
  everything needed to lay the page out itself).
- Render story text with highlight colors preserved
- **Note display: endnotes per chapter.** Each highlighted passage gets a
  small superscript reference number; notes are collected and listed at the
  end of their chapter (not the very end of the whole work, and not inline).
  Chosen over margin notes (layout too fiddly with dynamic paragraph length)
  and inline bracketed notes (clutters the story text). Keeps the story body
  visually clean — just highlight color + a number — and is straightforward
  to implement since notes are appended sequentially rather than needing
  column/position math.
- **Done when:** exported PDF is readable, story text stays clean, and every
  numbered reference has a clearly matching endnote at the chapter's end

## Explicitly Out of Scope (MVP)

Search library, favorite works, bookmark chapter locations, cloud sync, user
accounts, statistics, export-annotations-only, import/export backups, dark
mode, keyboard shortcuts. Revisit post-v1.

## Notes for Claude Code

- Phase 3 (robust anchoring) is the one most likely to get skipped in favor
  of more visually satisfying features — don't let it get skipped. Every
  later phase depends on anchoring being reliable.
- Prefer exact-text matching in Phase 1 deliberately — don't over-engineer
  anchoring before Phase 3. Ship the simple version first, replace it later.
- Keep the content script's DOM footprint minimal; never mutate AO3's own
  elements beyond wrapping selected text in highlight `<span>`s.
