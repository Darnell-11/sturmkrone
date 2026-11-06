/**
 * Sturmkrone als PC-App: ein eigenes Fenster mit der Chrome-Technik von Electron, das genau das Spiel von der
 * Webseite lädt. Dadurch ist es 1:1 dasselbe Spiel, aktualisiert sich selbst und läuft nach dem ersten Start
 * auch ohne Internet (der Offline-Speicher des Spiels liegt im App-Ordner).
 */
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');

// Beim Entwickeln lässt sich eine lokale Testversion laden (STURMKRONE_URL), die fertige App lädt immer die Webseite
const GAME_URL = (!app.isPackaged && process.env.STURMKRONE_URL) || 'https://darnell-11.github.io/sturmkrone/';
const GAME = new URL(GAME_URL);

// Immer die starke Grafikkarte nehmen (Laptops mit zwei Grafikchips) und keine Grafikkarte aussperren
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const inGame = (url) => {
  try {
    const u = new URL(url);
    return (u.origin === GAME.origin && u.pathname.startsWith(GAME.pathname)) || u.protocol === 'file:';
  } catch { return false; }
};

let win = null;

function create() {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    title: 'Sturmkrone',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#0b1a2a',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });
  win.webContents.setUserAgent(win.webContents.getUserAgent() + ' SturmkroneApp/1.0 (Desktop)');
  // Groß und im Vordergrund starten, auch wenn Windows das Fenster minimiert öffnen möchte
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
    win.focus();
    // Wird das Spiel z. B. aus einer Verknüpfung „minimiert“ gestartet, holen wir es in den ersten Sekunden nach vorn
    const front = () => { if (win && win.isMinimized()) { win.restore(); win.maximize(); win.focus(); } };
    const t0 = Date.now();
    win.on('minimize', () => { if (Date.now() - t0 < 3000) setTimeout(front, 50); });
    for (const ms of [300, 1000, 2500]) setTimeout(front, ms);
  });

  // Links nach außen (z. B. GitHub) im normalen Browser öffnen, das Spiel selbst bleibt im Fenster
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!inGame(url)) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); }
  });

  // Ohne Internet und ohne Offline-Speicher (allererster Start): freundliche Seite statt Fehlermeldung
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMain) => {
    if (isMain && code !== -3 && inGame(url) && !url.startsWith('file:')) win.loadFile(path.join(__dirname, 'offline.html'));
  });

  // F11 = Vollbild, F5 = neu laden, Strg+Umschalt+I = Entwicklerwerkzeuge (zur Fehlersuche)
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (input.key === 'F5') { win.loadURL(GAME_URL); e.preventDefault(); }
    else if (input.key === 'I' && input.control && input.shift) { win.webContents.toggleDevTools(); e.preventDefault(); }
  });

  win.loadURL(GAME_URL);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(create);
  app.on('window-all-closed', () => app.quit());
}
