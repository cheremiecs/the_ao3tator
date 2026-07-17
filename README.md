# AO3 Annotator

Private highlighting and note-taking for Archive of Our Own. Nothing leaves
your device — see `CLAUDE.md` for the full project spec and phase plan.

## Setup

```bash
npm install
npm run build
```

This bundles `src/content/content.ts` and `src/popup/popup.ts` into `dist/`.

For active development, run the watcher instead so changes rebuild automatically:

```bash
npm run watch
```

## Load into Chrome

1. Go to `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select this project's root folder (`ao3-annotator/`)
5. Visit any AO3 work page, e.g. `https://archiveofourown.org/works/1`
6. Open the DevTools console — you should see `[AO3 Annotator] Loaded on work <id>`

That console log is the Phase 0 "done" checkpoint. From there, work through
the phases in `CLAUDE.md` in order — each has its own done-when checkpoint.

## Notes

- Icons in `src/assets/` are placeholders — swap in real 16/48/128px PNGs
  before shipping, Chrome will otherwise show a default puzzle-piece icon.
- Re-run `npm run build` (or keep `npm run watch` running) any time you edit
  a `.ts` file, then click the refresh icon on the extension card in
  `chrome://extensions` to pick up changes.
