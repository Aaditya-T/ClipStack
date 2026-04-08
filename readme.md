# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Browser Extension

A standalone Chromium browser extension is located at `browser-extension/`.

### Features
- Captures clipboard history via `copy` event listener (event-based, not polling)
- Popup UI (click toolbar icon) with search, pin, mask, delete per item
- In-page floating overlay triggered by `Cmd+Shift+V` / `Ctrl+Shift+V`
- Keyboard navigation in overlay (arrows + Enter to copy, Escape to close)
- Smart type detection: URL / code / text with color badges
- Pin items to keep them at top permanently
- Mask (sensitive) mode: replaces text with `••••••••`, still copies real value
- Duplicate detection: consecutive identical copies update timestamp + count
- Max 100 items history (pinned items are unlimited)
- All data stored locally in `chrome.storage.local`

### Installation
1. Go to `brave://extensions` or `chrome://extensions`
2. Enable Developer Mode
3. Click "Load unpacked" → select the `browser-extension/` folder

### Files
- `manifest.json` — Manifest V3 config
- `background.js` — Service worker; handles storage, shortcut, messaging
- `storage.js` — Shared storage helpers (imported by background.js)
- `content.js` — Injected into pages; captures copy events + renders overlay
- `overlay.css` — Styles for the in-page overlay
- `popup.html/js/css` — Toolbar popup UI
- `icons/` — 16, 48, 128px PNG icons
