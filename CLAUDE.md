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

### Phase 1 — Highlighting core (Week 1) — ✅ built, has open bugs (see log below)
Select text, save a highlight, see it persist across a refresh. Single
session, single chapter, exact-text matching is fine for now.
- Text selection → popup with color options (yellow/blue/green/pink) — done
- Apply highlight as inline `<span>` wrapping the selected DOM range — done
- Save to `chrome.storage.local` — done
- Re-find and re-apply saved highlights on page load — done, but see
  Known Issue #4 (highlights sometimes don't reappear after refresh)
- Overlapping/layered highlights are allowed on purpose — dragging over
  already-highlighted text creates a second, separate highlight span rather
  than recoloring or blocking. This was a deliberate choice (see log).
- **Done when:** highlight a sentence, refresh, it's still highlighted

### Phase 2 — Notes (Week 2) — ✅ built
Attach, edit, delete notes on existing highlights.
- Click a highlight (no drag) → popover to add/edit a note — done
- Note persists alongside the highlight — done
- Delete note without deleting the highlight — done
- Delete highlight (removes its note too) — done
- Color can also be changed from the same note popover (color swatches at
  top, current color has a dark ring) — done
- Both popovers (color-pick and note) have a drag handle so the user can
  reposition them anywhere on screen — done
- **Done when:** full create/edit/delete cycle works and survives a refresh

---

## Known Issues / Bug Log (Phase 1–2)

Keeping this so fixes aren't lost or re-broken by future edits.

1. **Cross-paragraph selection corrupts the page.** Dragging a selection
   that starts in one `<p>` and ends in another breaks the DOM (extracted
   content merges paragraphs together, popover renders inline instead of
   floating). **Fix status: written but not yet confirmed applied** — a
   guard was added to `handleSelection` in `content.ts` that checks
   `range.startContainer`/`endContainer` against their closest `<p>`, and
   silently clears the selection (no popover) if they don't match or either
   is missing a paragraph ancestor. **Double check this guard is actually in
   the current `content.ts` before relying on it** — it was written once,
   then temporarily set aside, and may not have been re-applied after later
   rewrites of the file. Real fix belongs in Phase 3 (proper multi-paragraph
   anchoring).

2. **Popover reappearing intermittently ("sometimes the highlight option
   doesn't show up").** Root cause was a leftover
   `document.addEventListener("click", ..., { once: true })` from the
   previous popover that hadn't been cleaned up, so it fired on the very
   next click and closed the new popover instantly. **Fixed** —
   `popover.ts` now tracks its own listener references (`outsideClickHandler`,
   `escHandler`) and explicitly removes them in `removeColorPopover()`.

3. **New selection blocked when starting a drag on top of the still-open
   popover.** If the user didn't click away first and instead immediately
   drag-selected new text near where the popover was rendered, the
   mousedown landed on the popover element and ate the gesture. **Fixed** —
   `content.ts` now closes the popover on `mousedown` (not just `mouseup`),
   so it's never in the way when a new selection starts.

4. **Highlights sometimes don't survive a page refresh ("text not found"
   warnings in console).** Root cause: `findTextRange` in `highlight.ts`
   originally skipped text that was already inside a highlight `<span>`
   (via an `acceptNode` filter on the `TreeWalker`). Once overlapping
   highlights were intentionally allowed (see Known Issue #5), restoring the
   first overlapping highlight would wrap that text, and the walker would
   then skip past it when searching for the second one's text, causing a
   false "text not found." **Fix status: written and should be applied** —
   `findTextRange` was simplified to a plain `TreeWalker` with no
   `acceptNode` filter, so it can find and wrap text regardless of whether
   it's already inside another highlight span. **If highlights are still not
   reappearing after refresh, check `highlight.ts`:**
   - Confirm `findTextRange` has no `acceptNode` filtering logic left in it
   - Confirm the `locate()` helper function still exists at the bottom of
     the file (it's easy to accidentally delete when replacing
     `findTextRange`, since it's not called anywhere else) — `findTextRange`
     will fail to compile without it, which would also stop restoration
     silently
   - If both of those are correct and highlights still vanish on refresh,
     check whether `restoreHighlights()` in `content.ts` is actually
     awaited before the click/selection listeners are attached in `init()`

5. **Overlapping/layered highlights: recolor-in-place vs. allow layering.**
   Two designs were tried. First pass: re-selecting text fully inside an
   existing highlight would recolor that span in place rather than create a
   new overlapping one (to avoid a visual "wrong color shows through"
   layering bug). This was then **explicitly reverted** — layering is
   wanted, so a new selection over existing highlighted text now just
   creates an independent second span on top, same as if the text weren't
   highlighted at all. Current `handleSelection` in `content.ts` should
   **not** contain any `findEnclosingHighlight`/overlap-detection logic —
   if it does, that's a leftover from the reverted approach and should be
   removed.

6. **Popover textarea didn't fit its container / had a manual resize
   handle that wasn't wanted.** Root cause: `basePopoverStyle` in
   `popover.ts` didn't set `box-sizing: border-box`, so padding pushed
   child elements outside the visual border. **Fixed** — added
   `el.style.boxSizing = "border-box"` to `basePopoverStyle`, and changed
   the note textarea's `resize` from `"vertical"` to `"none"` so its size is
   fixed rather than user-adjustable.

7. **Mobile/iPad support is not possible for this architecture.** Chrome
   for Android has no extension system at all, and iOS requires all
   browsers (including "Chrome" on iOS) to use Apple's WebKit engine, which
   also doesn't support Chrome extensions. This project is desktop-only:
   Chrome, Brave, Edge, Opera, on Windows/Mac/Linux. A mobile version would
   need a separate project (Firefox for Android's WebExtensions support, a
   userscript-based approach, or a standalone reader app) — explicitly out
   of scope for now, not a bug to fix.

**Workflow note for whoever picks this up:** prefer "replace this whole
file" over partial edits where possible — several of the bugs above were
introduced or reintroduced by partial pastes (leftover duplicate imports,
an accidentally-deleted helper function, a fix that was written but not
actually re-applied after a later rewrite). Full-file replacement plus a
rebuild + reload-extension + refresh-page cycle after every change is the
safest loop.

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