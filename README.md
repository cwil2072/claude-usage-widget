# Claude Usage Widget

A beautiful, standalone Windows desktop widget that displays your Claude.ai usage statistics in real-time.

![Claude Usage Widget](assets/claude-usage-screenshot.jpg)

## Features

- **Real-time Usage Tracking** - Monitor session, weekly, and Sonnet usage limits
- **Usage History Graph** - Visual chart showing usage trends over time
- **Visual Progress Bars** - Clean, gradient progress indicators
- **Countdown Timers** - Circular timers showing time until reset
- **Auto-refresh** - Updates automatically (configurable interval)
- **Modern UI** - Sleek, draggable widget with dark theme
- **Secure** - Encrypted credential storage
- **Always on Top** - Stays visible across all workspaces
- **System Tray** - Minimizes to tray for easy access
- **Configurable** - Edit config.json to customize behavior
- **Portable** - Single exe, no installation required

## Installation

### Download Portable Exe
1. Download the latest `Claude Usage Widget-Windows-Portable.exe` from [Releases](https://github.com/SlavomirDurej/claude-usage-widget/releases)
2. Run the exe - no installation needed
3. Optionally copy to a permanent location

### Build from Source

**Prerequisites:**
- Node.js 18+ ([Download](https://nodejs.org))
- npm (comes with Node.js)

**Steps:**

```bash
# Clone the repository
git clone https://github.com/yourusername/claude-usage-widget.git
cd claude-usage-widget

# Install dependencies
npm install

# Run in development mode
npm start

# Build portable exe for Windows
npm run build:win

# Build for Mac (requires macOS)
npm run build:mac
```

The portable exe will be created in the `dist/` folder.

## Usage

### First Launch

1. Launch the widget
2. Click "Login to Claude" when prompted
3. A browser window will open - login to your Claude.ai account
4. The widget will automatically capture your session
5. Usage data will start displaying immediately

### Widget Controls

- **Drag** - Click and drag the title bar to move the widget
- **Refresh** - Click the refresh icon to update data immediately
- **Graph** - Click the graph icon to toggle usage history chart
- **Minimize** - Click the minus icon to hide to system tray
- **Close** - Click the X to exit the application

### System Tray Menu

Right-click the tray icon for:
- Show/Hide widget
- Refresh usage data
- Re-login (if session expires)
- Exit application

### CLI (On-demand Usage Check)

You can fetch usage once from the command line (no auto-refresh):

```bash
npm run cli -- --session-key "<your-session-key>"
```

Optional flags:

```bash
# force specific org
npm run cli -- --session-key "<your-session-key>" --organization-id "<org-id>"

# JSON output for scripts
npm run cli -- --session-key "<your-session-key>" --json
```

You can also use environment variables:

```bash
CLAUDE_SESSION_KEY="<your-session-key>" npm run cli -- --json
```

## Configuration

Edit `config.json` in the app directory to customize:

```json
{
  "refreshIntervalMinutes": 5,
  "chartDays": 7,
  "historyRetentionDays": 30,
  "silentLoginTimeoutSeconds": 15,
  "showWeeklySonnet": true
}
```

| Setting | Description | Default |
|---------|-------------|---------|
| `refreshIntervalMinutes` | How often to auto-refresh usage data | 5 |
| `chartDays` | Number of days to show in usage graph | 7 |
| `historyRetentionDays` | How long to keep usage history | 30 |
| `silentLoginTimeoutSeconds` | Timeout for auto-login attempts | 15 |
| `showWeeklySonnet` | Show/hide Weekly Sonnet usage row | true |

Restart the app after making changes.

### Auto-start on Windows Boot

1. Press `Win + R`
2. Type `shell:startup` and press Enter
3. Create a shortcut to the widget executable in this folder

## Understanding the Display

### Current Session
- **Progress Bar** - Shows usage from 0-100%
- **Timer** - Time remaining until 5-hour session resets
- **Color Coding**:
  - Purple: Normal usage (0-74%)
  - Orange: High usage (75-89%)
  - Red: Critical usage (90-100%)

### Weekly All Models
- **Progress Bar** - Shows weekly usage from 0-100%
- **Timer** - Time remaining until weekly reset
- Blue color theme

### Weekly Sonnet
- **Progress Bar** - Shows Sonnet-specific weekly usage
- **Timer** - Time remaining until reset
- Green color theme
- Can be hidden via config

## Troubleshooting

### "Login Required" keeps appearing
- Your Claude.ai session may have expired
- Click "Login to Claude" to re-authenticate
- Check that you're logging into the correct account

### Widget not updating
- Check your internet connection
- Click the refresh button manually
- Ensure Claude.ai is accessible in your region
- Try re-logging in from the system tray menu

### GPU cache errors on startup
- This has been fixed - the app now disables GPU shader disk cache
- If you still see issues, ensure no other instances are running

### Build errors
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

## Privacy & Security

- Your session credentials are stored **locally only** using encrypted storage
- No data is sent to any third-party servers
- The widget only communicates with Claude.ai official API
- Session cookies are stored using Electron's secure storage

## Technical Details

**Built with:**
- Electron 28.0.0
- Pure JavaScript (no framework overhead)
- Chart.js for usage graphs
- electron-store for secure storage

**API Endpoint:**
```
https://claude.ai/api/organizations/{org_id}/usage
```

**Data Storage:**
```
%APPDATA%/claude-usage-widget/
```

## Roadmap

- [x] Remember window position
- [x] Usage history graphs
- [x] Configurable settings
- [x] Portable exe build
- [ ] macOS distribution
- [ ] Linux support
- [ ] Custom themes
- [ ] Notification alerts at usage thresholds
- [ ] Multiple account support
- [ ] Keyboard shortcuts

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use and modify as needed.

## Disclaimer

This is an unofficial tool and is not affiliated with or endorsed by Anthropic. Use at your own discretion.

## Support

If you encounter issues:
1. Check the [Issues](issues) page
2. Create a new issue with details about your problem
3. Include your OS version and any error messages

---

Made with love for the Claude.ai community
