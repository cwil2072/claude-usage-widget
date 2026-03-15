# AGENTS.md

## Project Overview

Claude Usage Widget is an Electron desktop app for monitoring Claude.ai usage on Windows, macOS, and Linux.

## Key Files

- `main.js`: Electron main process, tray behavior, IPC handlers, persistence, update checks, and usage fetching orchestration.
- `preload.js`: Safe renderer bridge exposed through `contextBridge`.
- `src/renderer/app.js`: Widget UI state, login flow, refresh cycle, chart rendering, and settings interactions.
- `src/renderer/index.html`: Renderer markup.
- `src/renderer/styles.css`: Widget styling and layout.
- `src/fetch-via-window.js`: Hidden-window fetch flow used for Claude session-backed requests.

## Common Commands

- `npm start`: Launch the app.
- `npm run dev`: Launch Electron with `NODE_ENV=development`.
- `npm run build`: Build distributables with `electron-builder`.
- `npm run build:mac`: Build macOS artifacts.
- `npm run build:win`: Build Windows artifacts.
- `npm run build:linux`: Build Linux artifacts.

## Working Notes

- Use Node.js 18+ and npm 9+.
- Keep renderer changes compatible with the preload API instead of enabling direct Node access in the renderer.
- Treat `.claude/`, `.idea/`, `.vscode/`, `.DS_Store`, and build outputs as local artifacts, not source.
- `dist/` is generated output and should stay untracked.
- There is no automated test suite in the repo today, so validate by launching the app when behavior changes.

## Change Guidelines

- Prefer small focused edits and preserve existing Electron architecture.
- If IPC contracts change, update both `main.js` and `preload.js` or the renderer bridge together.
- Avoid committing machine-specific config, editor state, or agent settings.
