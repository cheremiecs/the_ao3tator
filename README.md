# AO3 Annotator

A private Chrome extension for highlighting and taking notes on fanfiction over on [Archive of Our Own (AO3)](https://archiveofourown.org). Basically margin notes, but for fic. No accounts, nothing uploaded anywhere, it all just stays in your own browser.

## What it does

- Highlight any part of a fic (story text, summary, notes, even the title) in yellow, blue, green, or pink
- Click a highlight to add a note, edit it, delete it, or change its color
- Everything sticks around after refreshing the page
- Lets you know if a highlight's text can't be found anymore, usually means the author edited that part
- Keeps highlights matched to the right chapter, even on long multi-chapter fics
- A little popup shows every fic you've annotated, click one to jump back in, or delete it if you're done
- You can export a backup of everything and import it back later if you ever need to

## How to install it

Not on the Chrome Web Store, so it's a manual setup for now.

1. Download this repo
2. Open a terminal in the folder and run `npm install`, then `npm run build`
3. Go to `chrome://extensions` in Chrome, turn on Developer mode
4. Click Load unpacked, and select the project folder
5. That's it, it should show up in your extensions

If you ever change the code yourself, just remember to run `npm run build` again and reload the extension for it to actually update.

## Hihihi

- Everything is saved locally in your browser, nothing gets sent anywhere
- If you ever uninstall or clear the extension's data, your highlights are gone for good, so back up now and then if you want peace of mind
- No way yet to browse all your highlights on one fic at a glance, you'll find them by scrolling through the text
- Mostly tested on Chrome, should work on Edge, Brave, or Opera too!!!