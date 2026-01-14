# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Run Commands

```bash
# Install dependencies
npm install

# Run in development mode (with DevTools)
npm run dev

# Run in production mode
npm start

# Build Windows portable exe (outputs to dist/)
npm run build:win

# Build Mac app (requires macOS)
npm run build:mac

# Build all platforms
npm run build
```

## Configuration

User-editable settings in `config.json`:

```json
{
  "refreshIntervalMinutes": 5,
  "chartDays": 7,
  "historyRetentionDays": 30,
  "silentLoginTimeoutSeconds": 15,
  "showWeeklySonnet": true
}
```

Settings are loaded at startup. Restart app after changes.

## Architecture

This is an Electron desktop widget that displays Claude.ai usage statistics. It's a Windows-focused app using vanilla JavaScript (no frameworks).

### Main Process (`main.js`)
- Creates frameless, always-on-top widget window
- Manages system tray with context menu
- Handles OAuth/session authentication with Claude.ai
- Makes API requests to `https://claude.ai/api/organizations/{org_id}/usage`
- Uses `electron-store` for encrypted credential storage
- Implements silent login (hidden window) with fallback to visible login window
- Loads user config from `config.json` with defaults fallback
- Disables GPU shader disk cache to prevent Windows lock issues

### Preload Script (`preload.js`)
- Exposes `window.electronAPI` bridge for renderer using context isolation
- Provides IPC methods: credentials, window controls, login events, usage data fetching, config

### Renderer (`src/renderer/`)
- `app.js` - Main application logic, UI state management, countdown timers, chart rendering
- `index.html` - Widget layout with progress bars and circular timers
- `styles.css` - Dark theme styling

### IPC Communication Pattern
- Main → Renderer events: `login-success`, `refresh-usage`, `session-expired`, `silent-login-started`, `silent-login-failed`
- Renderer → Main handlers: `get-credentials`, `save-credentials`, `delete-credentials`, `fetch-usage-data`, `get-config`, `get-usage-history`, window controls

### Key Constants (configurable via config.json)
- `refreshIntervalMinutes`: 5 (auto-refresh interval)
- `silentLoginTimeoutSeconds`: 15
- `chartDays`: 7 (days shown in usage graph)
- `historyRetentionDays`: 30
- `showWeeklySonnet`: true (toggle weekly sonnet row)
- Widget size: 480x204 pixels (480x170 without sonnet row)

## API Integration

The app fetches from Claude.ai's internal API:
- `/api/organizations` - Get user's organization ID
- `/api/organizations/{org_id}/usage` - Get usage data with `five_hour`, `seven_day`, and `seven_day_sonnet` utilization

Session authentication uses the `sessionKey` cookie from Claude.ai.
