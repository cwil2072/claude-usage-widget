const { app, BrowserWindow, ipcMain, Tray, Menu, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

// Prevent GPU cache locking issues on Windows
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
const axios = require('axios');

// Load user config with defaults
const DEFAULT_CONFIG = {
  refreshIntervalMinutes: 5,
  chartDays: 7,
  historyRetentionDays: 30,
  silentLoginTimeoutSeconds: 15,
  showWeeklySonnet: true
};

function loadConfig() {
  const configPath = path.join(__dirname, 'config.json');
  try {
    if (fs.existsSync(configPath)) {
      const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return { ...DEFAULT_CONFIG, ...userConfig };
    }
  } catch (error) {
    console.error('Failed to load config.json, using defaults:', error.message);
  }
  return DEFAULT_CONFIG;
}

const config = loadConfig();
const CLAUDE_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const store = new Store({
  encryptionKey: 'claude-widget-secure-key-2024'
});

const GRAPH_HEIGHT = 232;
const WIDGET_HEIGHT_WITH_SONNET = 204;
const WIDGET_HEIGHT_WITHOUT_SONNET = 170;

function getWidgetHeight() {
  return config.showWeeklySonnet ? WIDGET_HEIGHT_WITH_SONNET : WIDGET_HEIGHT_WITHOUT_SONNET;
}

function getClaudeAuthHeaders(sessionKey) {
  return {
    'Cookie': `sessionKey=${sessionKey}`,
    'User-Agent': CLAUDE_USER_AGENT
  };
}

async function fetchOrganizations(sessionKey) {
  const response = await axios.get('https://claude.ai/api/organizations', {
    headers: getClaudeAuthHeaders(sessionKey)
  });

  if (!Array.isArray(response.data) || response.data.length === 0) {
    throw new Error('No organizations returned');
  }

  return response.data;
}

async function resolveOrganizationId(sessionKey, preferredOrganizationId = null) {
  const organizations = await fetchOrganizations(sessionKey);

  if (preferredOrganizationId) {
    const matchingOrg = organizations.find(org =>
      org.uuid === preferredOrganizationId || org.id === preferredOrganizationId
    );
    if (matchingOrg) {
      return matchingOrg.uuid || matchingOrg.id;
    }
  }

  return organizations[0].uuid || organizations[0].id;
}

async function fetchUsage(sessionKey, organizationId) {
  return axios.get(
    `https://claude.ai/api/organizations/${organizationId}/usage`,
    {
      headers: getClaudeAuthHeaders(sessionKey)
    }
  );
}

function storeUsageHistory(data) {
  const timestamp = Date.now();
  const history = store.get('usageHistory', []);

  history.push({
    timestamp,
    session: data.five_hour?.utilization || 0,
    weekly: data.seven_day?.utilization || 0,
    sonnet: data.seven_day_sonnet?.utilization || 0
  });

  // Prune data older than configured retention period
  const cutoff = timestamp - (config.historyRetentionDays * 24 * 60 * 60 * 1000);
  const pruned = history.filter(h => h.timestamp > cutoff);

  store.set('usageHistory', pruned);
}

let mainWindow = null;
let loginWindow = null;
let silentLoginWindow = null;
let silentLoginInProgress = false;
let nextSilentLoginAttemptAt = 0;
let silentLoginRetryTimer = null;
let tray = null;
const SILENT_LOGIN_RETRY_INTERVAL_MS = 5 * 60 * 1000;

function clearSilentLoginRetryTimer() {
  if (silentLoginRetryTimer) {
    clearTimeout(silentLoginRetryTimer);
    silentLoginRetryTimer = null;
  }
}

function scheduleSilentLoginRetry() {
  clearSilentLoginRetryTimer();

  const delay = Math.max(0, nextSilentLoginAttemptAt - Date.now());
  if (!delay) {
    return;
  }

  console.log(`[Main] Scheduling silent login retry in ${Math.ceil(delay / 1000)}s`);
  silentLoginRetryTimer = setTimeout(() => {
    silentLoginRetryTimer = null;
    attemptSilentLogin();
  }, delay);
}

// Window configuration
const WIDGET_WIDTH = 480;

function createMainWindow() {
  // Load saved position or use defaults
  const savedPosition = store.get('windowPosition');
  const windowOptions = {
    width: WIDGET_WIDTH,
    height: getWidgetHeight(),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: false,
    icon: path.join(__dirname, 'assets/icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  };

  // Apply saved position if it exists
  if (savedPosition) {
    windowOptions.x = savedPosition.x;
    windowOptions.y = savedPosition.y;
  }

  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.loadFile('src/renderer/index.html');

  // Make window draggable
  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.setVisibleOnAllWorkspaces(true);

  // Save position when window is moved
  mainWindow.on('move', () => {
    const position = mainWindow.getBounds();
    store.set('windowPosition', { x: position.x, y: position.y });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Navigation guards — prevent mainWindow from ever leaving the local HTML
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      console.log('[Main] Blocked mainWindow navigation to:', url);
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log('[Main] Blocked new window from mainWindow, opening externally:', url);
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Development tools
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function createLoginWindow() {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus();
    return;
  }

  loginWindow = new BrowserWindow({
    width: 800,
    height: 700,
    parent: mainWindow,
    modal: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  loginWindow.loadURL('https://claude.ai');

  let loginCheckInterval = null;
  let hasLoggedIn = false;

  // Function to check login status
  async function checkLoginStatus() {
    if (hasLoggedIn || !loginWindow) return;

    try {
      const cookies = await session.defaultSession.cookies.get({
        url: 'https://claude.ai',
        name: 'sessionKey'
      });

      if (cookies.length > 0) {
        const sessionKey = cookies[0].value;
        console.log('Session key found, attempting to get org ID...');

        // Try to resolve org ID, but don't block login success on this step.
        let orgId = null;
        try {
          orgId = await resolveOrganizationId(sessionKey, store.get('organizationId'));
          if (orgId) {
            console.log('Org ID fetched from API');
          }
        } catch (err) {
          console.log('Org ID not ready yet, continuing with session only:', err.message);
        }

        if (sessionKey) {
          hasLoggedIn = true;
          if (loginCheckInterval) {
            clearInterval(loginCheckInterval);
            loginCheckInterval = null;
          }

          console.log('Sending login-success to main window...');
          store.set('sessionKey', sessionKey);
          if (orgId) {
            store.set('organizationId', orgId);
          }

          if (mainWindow) {
            mainWindow.webContents.send('login-success', { sessionKey, organizationId: orgId });
            console.log('login-success sent');
          } else {
            console.error('mainWindow is null, cannot send login-success');
          }

          loginWindow.close();
        }
      }
    } catch (error) {
      console.error('Error in login check:', error);
    }
  }

  // Check on page load
  loginWindow.webContents.on('did-finish-load', async () => {
    const url = loginWindow.webContents.getURL();
    console.log('Login page loaded:', url);

    if (url.includes('claude.ai')) {
      await checkLoginStatus();
    }
  });

  // Also check on navigation (URL changes)
  loginWindow.webContents.on('did-navigate', async (event, url) => {
    console.log('Navigated to:', url);
    if (url.includes('claude.ai')) {
      await checkLoginStatus();
    }
  });

  // Poll periodically in case the session becomes ready without a page navigation
  loginCheckInterval = setInterval(async () => {
    if (!hasLoggedIn && loginWindow) {
      await checkLoginStatus();
    } else if (loginCheckInterval) {
      clearInterval(loginCheckInterval);
      loginCheckInterval = null;
    }
  }, 2000);

  loginWindow.on('closed', () => {
    if (loginCheckInterval) {
      clearInterval(loginCheckInterval);
      loginCheckInterval = null;
    }
    loginWindow = null;
  });
}

// Attempt silent login in a hidden browser window
async function attemptSilentLogin() {
  if (silentLoginInProgress) {
    console.log('[Main] Silent login already in progress, skipping');
    return false;
  }

  if (Date.now() < nextSilentLoginAttemptAt) {
    console.log('[Main] Silent login in cooldown, skipping immediate retry');
    scheduleSilentLoginRetry();
    return false;
  }

  silentLoginInProgress = true;
  console.log('[Main] Attempting silent login...');

  // Notify renderer that we're trying to auto-login
  if (mainWindow) {
    mainWindow.webContents.send('silent-login-started');
  }

  return new Promise((resolve) => {
    silentLoginWindow = new BrowserWindow({
      width: 800,
      height: 700,
      show: false, // Hidden window
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    silentLoginWindow.loadURL('https://claude.ai');

    let loginCheckInterval = null;
    let hasLoggedIn = false;
    const SILENT_LOGIN_TIMEOUT = config.silentLoginTimeoutSeconds * 1000;

    // Function to check login status
    async function checkLoginStatus() {
      if (hasLoggedIn || !silentLoginWindow) return;

      try {
        const cookies = await session.defaultSession.cookies.get({
          url: 'https://claude.ai',
          name: 'sessionKey'
        });

        if (cookies.length > 0) {
          const sessionKey = cookies[0].value;
          console.log('[Main] Silent login: Session key found, attempting to get org ID...');

          // Try to resolve org ID, but accept session-only success.
          let orgId = null;
          try {
            orgId = await resolveOrganizationId(sessionKey, store.get('organizationId'));
            if (orgId) {
              console.log('[Main] Silent login: Org ID fetched from API');
            }
          } catch (err) {
            console.log('[Main] Silent login: org lookup not ready yet:', err.message);
          }

          if (sessionKey) {
            hasLoggedIn = true;
            if (loginCheckInterval) {
              clearInterval(loginCheckInterval);
              loginCheckInterval = null;
            }

            console.log('[Main] Silent login successful!');
            silentLoginInProgress = false;
            nextSilentLoginAttemptAt = 0;
            clearSilentLoginRetryTimer();
            store.set('sessionKey', sessionKey);
            if (orgId) {
              store.set('organizationId', orgId);
            }

            if (mainWindow) {
              mainWindow.webContents.send('login-success', { sessionKey, organizationId: orgId });
            }

            silentLoginWindow.close();
            resolve(true);
          }
        }
      } catch (error) {
        console.error('[Main] Silent login check error:', error);
      }
    }

    // Check on page load
    silentLoginWindow.webContents.on('did-finish-load', async () => {
      const url = silentLoginWindow.webContents.getURL();
      console.log('[Main] Silent login page loaded:', url);

      // Log all cookie names for diagnostics (helps detect cookie format changes)
      try {
        const allCookies = await session.defaultSession.cookies.get({ url: 'https://claude.ai' });
        const cookieNames = allCookies.map(c => c.name);
        console.log('[Main] Silent login: claude.ai cookies:', cookieNames.join(', '));
      } catch (err) {
        console.log('[Main] Silent login: failed to read cookies:', err.message);
      }

      if (url.includes('claude.ai')) {
        await checkLoginStatus();
      }
    });

    // Also check on navigation
    silentLoginWindow.webContents.on('did-navigate', async (event, url, httpResponseCode) => {
      console.log('[Main] Silent login navigated to:', url, '(status:', httpResponseCode + ')');
      if (url.includes('claude.ai')) {
        await checkLoginStatus();
      }
    });

    // Log load failures
    silentLoginWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      console.error('[Main] Silent login failed to load:', validatedURL, 'error:', errorCode, errorDescription);
    });

    // Poll periodically
    loginCheckInterval = setInterval(async () => {
      if (!hasLoggedIn && silentLoginWindow) {
        await checkLoginStatus();
      } else if (loginCheckInterval) {
        clearInterval(loginCheckInterval);
        loginCheckInterval = null;
      }
    }, 1000);

    // Timeout - if silent login doesn't work, notify renderer to show login button
    setTimeout(() => {
      if (!hasLoggedIn) {
        console.log('[Main] Silent login timeout');
        silentLoginInProgress = false;
        nextSilentLoginAttemptAt = Date.now() + SILENT_LOGIN_RETRY_INTERVAL_MS;
        scheduleSilentLoginRetry();
        if (loginCheckInterval) {
          clearInterval(loginCheckInterval);
          loginCheckInterval = null;
        }
        if (silentLoginWindow) {
          silentLoginWindow.close();
        }

        resolve(false);
      }
    }, SILENT_LOGIN_TIMEOUT);

    silentLoginWindow.on('closed', () => {
      if (loginCheckInterval) {
        clearInterval(loginCheckInterval);
        loginCheckInterval = null;
      }
      silentLoginWindow = null;
      silentLoginInProgress = false;
    });
  });
}

function createTray() {
  try {
    tray = new Tray(path.join(__dirname, 'assets/tray-icon.png'));

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Widget',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
          } else {
            createMainWindow();
          }
        }
      },
      {
        label: 'Refresh',
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send('refresh-usage');
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Settings',
        click: () => {
          // TODO: Open settings window
        }
      },
      {
        label: 'Re-login',
        click: () => {
          store.delete('sessionKey');
          store.delete('organizationId');
          createLoginWindow();
        }
      },
      { type: 'separator' },
      {
        label: 'Exit',
        click: () => {
          app.quit();
        }
      }
    ]);

    tray.setToolTip('Claude Usage Widget');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
      if (mainWindow) {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
      }
    });
  } catch (error) {
    console.error('Failed to create tray:', error);
  }
}

// IPC Handlers
ipcMain.handle('get-credentials', () => {
  return {
    sessionKey: store.get('sessionKey'),
    organizationId: store.get('organizationId')
  };
});

ipcMain.handle('save-credentials', (event, { sessionKey, organizationId }) => {
  store.set('sessionKey', sessionKey);
  if (organizationId) {
    store.set('organizationId', organizationId);
  }
  return true;
});

ipcMain.handle('delete-credentials', async () => {
  store.delete('sessionKey');
  store.delete('organizationId');

  // Clear the session cookie to ensure actual logout
  try {
    await session.defaultSession.cookies.remove('https://claude.ai', 'sessionKey');
    // Also try checking for other auth cookies or clear storage if needed
    // await session.defaultSession.clearStorageData({ storages: ['cookies'] });
  } catch (error) {
    console.error('Failed to clear cookies:', error);
  }

  return true;
});

ipcMain.on('open-login', () => {
  createLoginWindow();
});

ipcMain.on('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('close-window', () => {
  app.quit();
});

ipcMain.handle('get-window-position', () => {
  if (mainWindow) {
    return mainWindow.getBounds();
  }
  return null;
});

ipcMain.handle('set-window-position', (event, { x, y }) => {
  if (mainWindow) {
    mainWindow.setPosition(x, y);
    return true;
  }
  return false;
});

ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url);
});

ipcMain.handle('get-usage-history', () => {
  const history = store.get('usageHistory', []);
  // Return history for configured chart days
  const cutoff = Date.now() - (config.chartDays * 24 * 60 * 60 * 1000);
  return history.filter(h => h.timestamp > cutoff);
});

ipcMain.handle('get-config', () => {
  return config;
});

ipcMain.on('toggle-graph', (event, visible) => {
  if (mainWindow) {
    const bounds = mainWindow.getBounds();
    const baseHeight = getWidgetHeight();
    const newHeight = visible ? baseHeight + GRAPH_HEIGHT : baseHeight;
    mainWindow.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: WIDGET_WIDTH,
      height: newHeight
    });
  }
});

ipcMain.handle('fetch-usage-data', async () => {
  console.log('[Main] fetch-usage-data handler called');
  const sessionKey = store.get('sessionKey');
  let organizationId = store.get('organizationId');

  console.log('[Main] Session key present:', !!sessionKey);

  if (!sessionKey) {
    throw new Error('Missing credentials');
  }

  try {
    if (!organizationId) {
      console.log('[Main] Organization ID missing, resolving from organizations API...');
      organizationId = await resolveOrganizationId(sessionKey);
      store.set('organizationId', organizationId);
    }

    console.log('[Main] Making API request to usage endpoint');
    const response = await fetchUsage(sessionKey, organizationId);
    console.log('[Main] API request successful, status:', response.status);
    storeUsageHistory(response.data);
    return response.data;
  } catch (error) {
    console.error('[Main] API request failed:', error.message);
    if (error.response) {
      console.error('[Main] Response status:', error.response.status);
      if (error.response.status === 403) {
        // Session may still be valid while org ID changed/staled out.
        try {
          console.log('[Main] 403 received, attempting to resolve organization ID and retry once...');
          const freshOrgId = await resolveOrganizationId(sessionKey);
          if (freshOrgId && freshOrgId !== organizationId) {
            store.set('organizationId', freshOrgId);
            const retryResponse = await fetchUsage(sessionKey, freshOrgId);
            console.log('[Main] Retry with refreshed org ID succeeded, status:', retryResponse.status);
            storeUsageHistory(retryResponse.data);
            return retryResponse.data;
          }
        } catch (retryErr) {
          console.error('[Main] Org re-resolve retry failed:', retryErr.message);
        }
      }

      if (error.response.status === 401 || error.response.status === 403) {
        // Session expired - attempt silent re-login
        console.log('[Main] Session expired, attempting silent re-login...');
        store.delete('sessionKey');
        store.delete('organizationId');

        // Don't clear cookies - we need them for silent login to work with OAuth
        // The silent login will use existing Google/OAuth session if available

        // Attempt silent login (will notify renderer appropriately)
        attemptSilentLogin();

        throw new Error('SessionExpired');
      }
    }
    throw error;
  }
});

// App lifecycle
app.whenReady().then(() => {
  createMainWindow();
  createTray();

  // Check if we have credentials
  // const hasCredentials = store.get('sessionKey') && store.get('organizationId');
  // if (!hasCredentials) {
  //   setTimeout(() => {
  //     createLoginWindow();
  //   }, 1000);
  // }
});

app.on('window-all-closed', () => {
  // Don't quit on macOS
  if (process.platform !== 'darwin') {
    // Keep running in tray
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  } else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
  }
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
