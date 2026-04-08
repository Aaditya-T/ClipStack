# Clipstack – Clipboard History Extension

A Chromium browser extension that silently captures your clipboard history and lets you reuse anything you've copied — with search, pin, and sensitive-item masking.

## Installing in Brave / Chrome

1. Open your browser and go to `brave://extensions` or `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `browser-extension/` folder
5. Clipstack will appear in your extensions bar — click the puzzle icon to pin it

## Using Clipstack

### Popup (toolbar icon)
Click the Clipstack icon in your toolbar to open your clipboard history.

### Keyboard shortcut overlay
Press **Cmd+Shift+V** (Mac) or **Ctrl+Shift+V** (Windows/Linux) on any webpage to bring up a floating history panel without leaving the page.

- **Arrow keys** — navigate through items
- **Enter** — copy the focused item
- **Escape** — close the overlay

### Per-item actions (hover over any item)
- **Pin** (📍) — keeps the item at the top permanently; survives "Clear history"
- **Mask** (👁) — replaces the display with bullets `••••••••` for sensitive values; clicking still copies the real value
- **Delete** (×) — removes the item from history

### Search
Type in the search bar to filter your history in real time.

### Clear history
The trash button in the header clears all non-pinned items.

## How it works

- Clipboard is polled every second using an alarm + active tab detection
- Duplicate consecutive copies update the timestamp instead of creating a new entry
- History is capped at 100 items (pinned items are unlimited)
- All data stays on your device in `chrome.storage.local` — nothing is sent anywhere

## Notes

- The clipboard read permission requires user interaction on the page (clicking or focusing a tab), which is standard browser security behavior
- The extension will not capture copies made on `chrome://`, `brave://`, or other browser-internal pages
- To change the keyboard shortcut: go to `brave://extensions/shortcuts` or `chrome://extensions/shortcuts`
