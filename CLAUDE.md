```markdown
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
- Local-first storage only (`chrome.storage.local`, `unlimitedStorage` — already enabled).
- Never interfere with AO3's normal functionality, layout, or accessibility.
- Minimize UI clutter — should feel like a built-in reading tool, not a bolted-on plugin.
- Annotation should be effortless: select text → highlight → optional note, nothing more.
- PDF export — **decided against building this.** Considered both generating from
  extension data and post-processing AO3's native PDF export; both rejected as
  too fragile/heavy for the value. Not planned.

## Target Platform

- Chrome Extension, Manifest V3
- Should also work unmodified on Chromium browsers: Opera, Edge, Brave (not yet manually tested)

## Tech Stack

- TypeScript
- HTML/CSS for popup UI
- Chrome Extension APIs: Content Scripts, `chrome.storage.local`, `chrome.tabs`
- Text-anchoring: exact-substring matching, now chapter-aware (see Phase 3 below).
  Prefix/suffix/offset fuzzy matching was considered and explicitly **descoped**
  (see Phase 3 notes) in favor of a simpler "tell the reader plainly" approach.

## Project Structure

```
ao3-annotator/
manifest.json
src/
├── content/
│   ├── content.ts
│   ├── highlight.ts
│   ├── annotation.ts
│   ├── storage.ts
│   └── content.css
├── popup/
│   ├── popup.html
│   ├── popup.ts
│   └── popup.css
└── assets/
```

(`library/` and `pdf/` folders from the original plan were never created — PDF
export was descoped, and the popup doubles as the library view.)

## Data Structure

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
      "chapterId": "112331803",
      "selectedText": "...",
      "note": "...",
      "color": "yellow"
    }
  ]
}
```

`chapterId` was added (Phase 3, see below) — AO3's own chapter identifier from
the URL (`/works/<id>/chapters/<chapterId>`), used to avoid false "highlight
missing" reports on multi-chapter works. `contextPrefix`/`contextSuffix`/
`charOffset` still exist as unused optional fields on `Annotation` — the
fuzzy-matching approach they were meant for was descoped, so these are
currently dead fields kept for potential future use.

## Status Summary

| Phase | Status |
|---|---|
| Phase 0 — Setup | ✅ Done |
| Phase 1 — Highlighting core | ✅ Done, exceeds original scope |
| Phase 2 — Notes | ✅ Done |
| Phase 3 — Robust anchoring | ⚠️ Redesigned & partially done — see below |
| Phase 4 — Library popup | ✅ Done, with an extra delete feature |
| Phase 5 — Sidebar | ❌ Not started |
| Phase 6 — Polish pass | ⚠️ Partially done (see below) |
| Phase 7 — PDF export | ❌ Descoped, not planned |

---

## Phase 1 — Highlighting core — ✅ done, exceeds original scope

Original scope (single paragraph, exact-text match, single session) is done
and was substantially extended during bug-fixing:

- Text selection → popup with color options (yellow/blue/green/pink) — done
- Apply highlight as one or more `<span>`s wrapping the selected range — done,
  see "Cross-block and inline-element highlighting" below for why it's
  "one or more"
- Save to `chrome.storage.local` — done
- Re-find and re-apply saved highlights on page load — done
- Overlapping/layered highlights allowed on purpose (unchanged from original
  design) — done

### Cross-block and inline-element highlighting (beyond original scope)

The original plan treated cross-paragraph selection as invalid (see old
Known Issue #1) and multi-paragraph anchoring as a Phase 3 concern. This was
revisited: **cross-paragraph/cross-block highlighting is now a supported
feature**, not blocked.

- `highlight.ts` wraps every individual text node touched by a selection in
  its own `<span>` (all sharing one `annotationId`), instead of trying to
  wrap a whole range in a single `<span>` via `surroundContents()`. This
  correctly handles selections that cross paragraph boundaries, headings,
  blockquotes, and inline elements (links, `<em>`, `<i>`, etc.) without the
  DOM corruption the original single-span approach caused.
- `BLOCK_SELECTOR` (`p, h1-h6, blockquote, li, dd, dt`) defines what counts
  as a splittable block boundary. `getLeafBlocks()` filters out
  container/leaf duplicates (e.g. a `<blockquote><p>` pair only counts once)
  to avoid double-wrapping.
- `unwrapHighlight`/`getHighlightSpans` now operate on **all spans sharing an
  annotation id**, not a single span, since one highlight can now be backed
  by several `<span>` elements.

### Highlighting extended to title, byline, summary, and notes

Originally the content script only watched `#workskin` (chapter text).
`STORY_CONTAINER_SELECTOR` is now `#main`, which also covers the work title,
author byline, Summary, and Notes sections — all of these are now
highlightable and annotatable, not just story paragraphs.

### `findTextRange` boundary-matching fix

A subtle bug: text nodes are concatenated with no separator when computing
match offsets. When a match began or ended exactly at a paragraph seam, the
offset resolved to the wrong side of the boundary, causing an entire
unrelated adjacent paragraph to get swallowed into a highlight on restore.
Fixed by splitting the old single `locate()` helper into `locateStart()` and
`locateEnd()` — `locateStart` rolls forward to the next node on an exact
boundary match; `locateEnd` stays put. This was found and fixed through
extensive before/after-refresh diagnostic testing.

### `wrapSingleRange` root-node fix

When an entire selection sits inside a single text node,
`range.commonAncestorContainer` *is* that text node — a `TreeWalker` rooted
there has no children to walk, so highlighting silently did nothing (data
saved, no visible span). Fixed by using the text node's parent element as
the walker root whenever the raw root is itself a text node.

**Done when:** highlight a sentence (including across paragraphs, through
inline elements, or in the title/summary/notes), refresh, it's still
highlighted with the correct color and boundaries. ✅ Confirmed via repeated
before/after-refresh testing across several multi-chapter fics.

## Phase 2 — Notes — ✅ done

All original scope done: add/edit/delete note, delete highlight (removes
note too), recolor from the note popover, drag handle on both popovers.

### Popover sizing/layout fixes (beyond original scope)

- Note popover width increased (220px → 300px) and button row given
  `flex-wrap` + non-shrinking buttons (`flex: 0 0 auto`) so the three action
  buttons (Delete highlight / Delete note / Save) never overflow the
  popover's border regardless of button padding/font size.
- Buttons given explicit `line-height` and `inline-flex` centering to fix
  text rendering below the button's visual box (inherited AO3 line-height
  was pushing labels off-center).

**Done when:** full create/edit/delete cycle works and survives a refresh. ✅

---

## Phase 3 — Robust anchoring & multi-chapter — ⚠️ redesigned

The original plan (prefix/suffix + offset fuzzy matching to survive author
text edits) was **explicitly descoped** as a deliberate decision — judged too
likely to introduce new fragile-matching bugs for the value it added.
Replaced with a much lighter approach:

### What was built instead

- **Missing-highlights banner.** `restoreHighlights()` in `content.ts` counts
  annotations whose `selectedText` can no longer be found on the page. If
  any are missing, `popover.ts`'s `showMissingHighlightsBanner(count)` shows
  a dismissible banner fixed to the top of the page: *"N of your highlights
  couldn't be found — this fic may have been updated since you last read
  it."* Auto-dismisses after 5 seconds, or immediately via a Dismiss button.
  No attempt is made to relocate the highlight — this is an honest notice,
  not a fuzzy-match fallback.
- **Multi-chapter awareness (chapterId).** Originally, `restoreHighlights`
  checked every saved annotation against whatever chapter was currently
  loaded, regardless of which chapter it actually belonged to — causing
  false "may have been updated" banners on multi-chapter works, since a
  chapter-1 highlight will correctly fail to be found while viewing chapter
  2. Fixed by adding `chapterId` (AO3's chapter ID from the URL) to
  `Annotation`, set at creation time via `getCurrentChapterId()`. On
  restore, annotations belonging to a different `chapterId` than the one
  currently being viewed are skipped entirely — not attempted, not counted
  toward the missing-highlights banner. Annotations saved before this field
  existed have `chapterId: null` and are still attempted on every chapter
  (harmless) but never count toward the banner, since it's ambiguous
  whether a `null`-chapterId miss is a real edit or a different chapter.
- Exact-text matching (`findTextRange`) is otherwise **unchanged** — no
  fuzzy/prefix-suffix logic was added. `contextPrefix`/`contextSuffix`/
  `charOffset` remain unused fields on `Annotation`, kept in case this
  direction is revisited later.
- Deleted-work handling (what happens if the author deletes the fic
  entirely) was discussed but **not yet implemented** — currently, a
  deleted work's annotations would just perpetually fail to restore and
  likely trigger the missing-highlights banner with a misleading message
  ("may have been updated" vs. the more accurate "no longer exists").
  Flagged for Phase 6 polish.

**Done when (revised):** a highlight whose exact text is no longer present
tells the reader clearly instead of failing silently, and multi-chapter
works don't produce false positives. ✅ Both confirmed via testing.

---

## Phase 4 — Library popup — ✅ done, with an added feature

- Popup lists every annotated work: **title, author, last opened** (highlight
  count/note count were explicitly excluded per request — simpler than
  originally planned)
- Click a work → opens that AO3 URL in a new tab via `chrome.tabs.create()`
  (required adding `"tabs"` to `manifest.json` permissions)
- `lastOpened` updates both when a new highlight is saved AND now also on
  every page visit to an already-annotated work (added in `init()` in
  `content.ts` — original plan only updated it on new-highlight save)
- List sorts by most-recently-opened first
- **Added beyond original scope: per-work Delete button.** Each list item
  has a "Delete" button (with confirmation dialog) that calls the new
  `deleteWork(workId)` in `storage.ts` (`chrome.storage.local.remove`),
  wiping all highlights/notes for that work and removing it from the list
  immediately, no popup reopen needed. Does not affect any already-open tab
  showing that fic until that tab is refreshed.

**Done when:** you can browse annotated works without digging through AO3
history, and remove ones you no longer want tracked. ✅

---

## Known Issues / Bug Log

### Resolved during Phase 1–4 work

All six issues from the original Phase 1–2 bug log are resolved:
1. Cross-paragraph selection — no longer treated as an error case; now a
   supported feature (see Phase 1 above).
2. Popover reappearing intermittently — confirmed fixed, still in place.
3. New selection blocked by open popover — confirmed fixed, still in place.
4. Highlights not surviving refresh — root cause was more nuanced than
   originally diagnosed; see "`findTextRange` boundary-matching fix" and
   "`wrapSingleRange` root-node fix" above for the actual fixes that
   resolved this after extensive testing.
5. Overlapping/layered highlights — confirmed still allowed, no
   `findEnclosingHighlight` regression found.
6. Popover textarea sizing — confirmed fixed; further extended with the
   button-row overflow fixes described in Phase 2 above.
7. Mobile/iPad — unchanged, still correctly out of scope.

### New issues found and fixed during Phase 3–4 work

8. **Multi-paragraph highlight swallowing an unrelated adjacent paragraph on
   restore.** See "`findTextRange` boundary-matching fix" in Phase 1 above.
   Root cause: flat text-node concatenation with no boundary awareness,
   compounded by `#main` becoming a much larger container than the original
   `#workskin`. Fixed via `locateStart`/`locateEnd` split.
9. **Single-text-node highlights silently not rendering.** See
   "`wrapSingleRange` root-node fix" above. Fixed.
10. **False "fic may have been updated" banners on multi-chapter works.**
    See Phase 3 above. Fixed via `chapterId` tracking.
11. **`dist/popup.js` going stale after `popup.ts` edits without a rebuild**
    — not a code bug, a process gotcha: always rebuild before testing.
    Worth remembering if the popup ever appears to ignore changes again.

### Known, not yet fixed

- **Deleted-work detection** (see Phase 3 notes above) — not implemented.
  Flagged for Phase 6.
- Empty-paragraph highlighting produces a tiny near-invisible highlighted
  sliver (visible as a thin colored bar) when a cross-paragraph selection
  spans an empty `<p>` in between. Cosmetic, not corrupting, not yet
  addressed.

---

## Phase 5 — Sidebar — ❌ not started

Original plan unchanged: in-page collapsible panel listing annotations for
the current work, click-to-scroll, inline edit/delete synced with the
existing popover-based editing via a shared `updateAnnotation` path (already
exists in `storage.ts`, just needs a second UI consumer).

## Phase 6 — Polish pass — ⚠️ partially done

- `unlimitedStorage` permission — ✅ already present in `manifest.json`
  (done earlier than planned)
- Empty states — ✅ done for the popup ("No annotated works yet.")
- Deleted-work error handling — ❌ not done (see above)
- Storage-quota / malformed-data error handling — ❌ not done
- Cross-browser manual test pass (Brave/Edge/Opera) — ❌ not done
- Visual polish pass — partially informal (popover sizing fixes count, but
  no dedicated aesthetic pass has been done)

## Phase 7 — PDF export — ❌ descoped, not planned

Discussed two approaches (build from extension data via `pdf-lib`, or
post-process AO3's native PDF export) and decided not to pursue either —
judged not worth the complexity/fragility for this project's scope. Not on
the roadmap unless revisited later.

---

## Explicitly Out of Scope (MVP)

Search library, favorite works, bookmark chapter locations, cloud sync, user
accounts, statistics, export-annotations-only, import/export backups, dark
mode, keyboard shortcuts, PDF export (see Phase 7). Revisit post-v1.

## Notes for whoever picks this up next

- **Rebuild after every source change, always.** Several confusing "nothing
  happened" sessions turned out to just be a stale `dist/*.js` from
  forgetting to rerun the build. Full loop: edit → rebuild → reload
  extension in `chrome://extensions` → refresh the AO3 tab → test.
- **`chapterId` is `null` on any annotation saved before Phase 3's fix.**
  Old test data will keep being attempted on every chapter view and may
  occasionally log a console "not found" warning — this is expected debris,
  not a live bug, unless it's happening on annotations made *after* the fix.
- Fuzzy text re-anchoring (prefix/suffix/offset) was deliberately not built.
  If author-edited-fic accuracy becomes a real pain point later, the unused
  `contextPrefix`/`contextSuffix`/`charOffset` fields are already there to
  build on — but this was a conscious choice to keep matching logic simple
  and debuggable, not an oversight.
- Keep the content script's DOM footprint minimal; never mutate AO3's own
  elements beyond wrapping selected text in highlight `<span>`s. (Unchanged
  principle — still holds even with the expanded `#main` container and
  multi-span highlighting.)
```
```markdown
# AO3 Annotator

## Project Overview

A Chrome browser extension (Manifest V3) that lets readers privately annotate
fanfiction on Archive of Our Own (AO3). Users highlight passages, attach notes,
and everything persists locally via `chrome.storage.local` — no accounts, no
cloud sync, nothing uploaded anywhere.

## Core Goal

Build a private annotation system similar to Kindle/Apple Books margin notes,
but specifically for AO3. Readers can highlight favorite passages, write
personal notes, revisit them later, and browse a personal library of
annotated works — without AO3 ever knowing or being modified.

## Tech Stack

- TypeScript — the language everything is written in
- esbuild — bundles/compiles TypeScript into the JS Chrome actually runs
- HTML/CSS — used for the toolbar popup UI; everything injected onto AO3
  pages is built dynamically in JS instead
- Chrome Extension APIs (Manifest V3): `chrome.storage.local` (+
  `unlimitedStorage`), `chrome.tabs`, Content Scripts

## Project Structure

```
ao3-annotator/
manifest.json
src/
├── content/
│   ├── content.ts
│   ├── highlight.ts
│   ├── annotation.ts
│   ├── storage.ts
│   ├── popover.ts
│   └── content.css
├── popup/
│   ├── popup.html
│   ├── popup.ts
│   └── popup.css
└── assets/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

`dist/` and `node_modules/` are build output and dependencies, both
regenerated via `npm run build` / `npm install`, both gitignored.

## Data Structure

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
      "chapterId": "112331803",
      "selectedText": "...",
      "note": "...",
      "color": "yellow"
    }
  ]
}
```

Note: the old `chapter: number` field (originally hardcoded to `1`, never
functional) was removed from `Annotation` — `chapterId` (AO3's real chapter
ID pulled from the URL) is what actually powers chapter-aware restoring.
`contextPrefix`/`contextSuffix`/`charOffset` were never added — fuzzy
text-matching was considered and explicitly descoped (see below).

---

## What's Built

### Highlighting
- Select text anywhere inside AO3's `#main` container — story text, title,
  author byline, Summary, or Notes, not just the chapter body — and a color
  popup appears (yellow/blue/green/pink).
- Highlighting works across paragraph/heading/blockquote boundaries in a
  single selection, and through inline formatting (links, italics) without
  breaking. Implemented by wrapping every individual text node touched by
  the selection in its own `<span>` (all sharing one annotation ID), rather
  than trying to wrap a whole range in one `<span>`.
- Overlapping/layered highlights are allowed on purpose.
- Highlights persist across page refreshes, saved per AO3 work in
  `chrome.storage.local`.

### Notes
- Click an existing highlight to open a popover: add/edit/delete a note,
  delete the whole highlight, or change its color.
- A highlight spanning multiple `<span>`s (from crossing paragraphs) is
  still treated and edited as one logical highlight, since all its spans
  share the same annotation ID.

### Missing-highlight banner
- If a highlight's exact saved text can no longer be found on the page
  (e.g. the author edited that part of the fic), a dismissible yellow
  banner tells the reader plainly: "N of your highlights couldn't be found
  — this fic may have been updated since you last read it." Auto-dismisses
  after 5 seconds, or immediately via a Dismiss button.
- No fuzzy/prefix-suffix re-matching is attempted — this was a deliberate
  scope decision (see "Explicitly Descoped" below).

### Multi-chapter awareness
- Each highlight is tagged with `chapterId` (extracted from the URL) at
  creation time.
- On restore, a highlight belonging to a different chapter than the one
  currently being viewed is skipped entirely — not attempted, not counted
  toward the missing-highlights banner. This fixes an earlier false-positive
  bug where switching chapters on the same multi-chapter fic incorrectly
  triggered "this fic was updated" banners.
- Annotations saved before `chapterId` existed have `chapterId: null` and
  are still attempted on every chapter (harmless), but never count toward
  the banner, since it's ambiguous whether a miss is a real edit or just a
  different chapter.

### Library popup
- Click the extension's toolbar icon to see every annotated work: title,
  author, last-opened date, sorted most-recently-opened first.
- Click a work to open it in a new tab (`chrome.tabs.create`).
- `lastOpened` updates both when a new highlight is saved and on every
  revisit to an already-annotated work.
- Each entry has a Delete button (with confirmation) that wipes all
  highlights/notes for that specific work and removes it from the list
  immediately.

---

## Known Bugs Fixed Along the Way

- Cross-paragraph selections used to corrupt the DOM — now a fully
  supported feature via per-text-node wrapping.
- Highlight color silently failing on inline-formatted text (links,
  italics) — fixed by splitting text nodes at selection boundaries before
  wrapping, instead of relying on a single `surroundContents()` call across
  a whole range.
- A single-text-node selection could silently fail to render (data saved,
  nothing painted) — fixed by using the text node's parent element as the
  search root instead of the text node itself.
- A highlight matching exactly at a paragraph boundary could swallow an
  entire unrelated adjacent paragraph on restore — fixed by splitting the
  old boundary-matching logic into separate `locateStart`/`locateEnd`
  functions with different boundary-preference rules.
- False "highlight missing" banners on multi-chapter works — fixed via
  `chapterId` tracking (see above).
- Note popover buttons overflowing/misaligning at various widths — fixed
  with explicit `flex-wrap`, non-shrinking buttons, and corrected
  line-height/centering.

---

## Explicitly Descoped

- **Fuzzy text re-anchoring** (prefix/suffix/offset matching to survive
  author text edits) — considered, deliberately not built. Judged too
  likely to introduce new fragile-matching bugs for the value added.
  Replaced with the simpler missing-highlights banner instead.
- **PDF export** — considered two approaches (build from extension data via
  `pdf-lib`, or post-process AO3's native PDF export) and decided not to
  pursue either. Not on the roadmap.

---

## Not Yet Built

- **In-page sidebar** — no collapsible panel listing all highlights for the
  current work with click-to-scroll and inline edit/delete. Currently the
  only way to interact with a highlight is finding and clicking it directly
  in the story text.
- **Backup/export of saved data** — no way to export annotations to a file
  or re-import them. If browser storage is wiped (uninstall, clearing
  extension data, profile reset), all highlights and notes are permanently
  lost with no recovery path.
- **Deleted-work detection** — no distinct handling for "this fic was
  deleted by the author" vs. "this text was edited." Both currently look
  identical to the extension (text not found), and would show the same
  "may have been updated" banner even though the underlying cause is
  different and the message is misleading for a deleted work.
- **Cross-browser testing** — not yet manually verified on Brave, Edge, or
  Opera, despite using standard Chromium extension APIs that should
  theoretically work unmodified.
- **Entire-work vs per-chapter view** — AO3 supports viewing a multi-chapter
  fic as one long page instead of chapter-by-chapter. This interaction has
  not been explicitly tested against the current highlighting/restoring
  logic.
- **Storage-quota and malformed-data error handling** — no explicit handling
  for `chrome.storage.local` quota issues or corrupted saved data, beyond
  what naturally falls out of existing checks.
- **Console log cleanup** — a number of debug `console.log` statements
  (save confirmations, restore diagnostics) were left in throughout
  development. Some have since been commented out during a cleanup pass;
  worth a final sweep before any wider sharing.

---

## Workflow Notes

- Every source change requires a rebuild (`npm run build`) before it's
  reflected in the extension — editing `.ts` files alone does nothing until
  esbuild recompiles them into `dist/`.
- After rebuilding, reload the extension in `chrome://extensions`, then
  fully refresh the AO3 tab — a stale content script from before a reload
  will throw "Extension context invalidated" errors if you try to interact
  with the page without refreshing first.
- Manifest permission changes (e.g. adding `"tabs"`) sometimes require a
  full remove-and-reinstall of the unpacked extension, not just the reload
  button, to take effect.
- `getCurrentChapterId()` is currently duplicated identically in both
  `annotation.ts` and `content.ts` — harmless, but a candidate for a small
  future cleanup (extract to a shared location) rather than an active bug.
```