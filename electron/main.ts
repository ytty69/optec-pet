import { app, BrowserWindow, ipcMain, screen, globalShortcut, Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';

// Force a single device scale factor across all displays. Windows'
// per-monitor DPI awareness confuses transparent + alwaysOnTop windows that
// try to span mixed-DPI monitors (e.g. laptop @125% + external @100%): the
// window ends up rendered/routing events only on one display. Locking the
// scale factor to 1 makes the coordinate system consistent.
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('high-dpi-support', '1');

process.env.APP_ROOT = path.join(__dirname, '..');
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let pollTimer: NodeJS.Timeout | null = null;
let dragTimer: NodeJS.Timeout | null = null;
let petBounds: { x: number; y: number; w: number; h: number } | null = null;
let ignoring = true;
let forceInteractive = false;
let dragMode = false;

/** Generate a 16×16 orange paw-ish icon for the tray at runtime — no asset file
 *  required, avoids "Tray icon missing" issues on Windows. */
function makeTrayIcon(): Electron.NativeImage {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  const inCircle = (x: number, y: number, cx: number, cy: number, r: number) => {
    const dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy <= r * r;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let painted = false;
      // main pad
      if (inCircle(x, y, 8, 10, 4)) painted = true;
      // toe beans
      if (inCircle(x, y, 4, 5, 2)) painted = true;
      if (inCircle(x, y, 8, 3, 2)) painted = true;
      if (inCircle(x, y, 12, 5, 2)) painted = true;
      if (painted) {
        // BGRA byte order works for both Windows and macOS with createFromBitmap.
        buf[i]     = 35;    // B
        buf[i + 1] = 166;   // G
        buf[i + 2] = 245;   // R
        buf[i + 3] = 255;   // A
      }
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

function togglePetWindow() {
  if (!win) return;
  if (win.isVisible()) win.hide();
  else win.showInactive();
  refreshTrayMenu();
}

function refreshTrayMenu() {
  if (!tray) return;
  const isVis = !!win?.isVisible();
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: isVis ? '隐藏宠物' : '显示宠物',
      click: () => togglePetWindow(),
    },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]));
}

function createTray() {
  tray = new Tray(makeTrayIcon());
  tray.setToolTip('Optec Pet');
  tray.on('click', () => togglePetWindow());
  refreshTrayMenu();
}

function debugToRenderer(msg: string) {
  win?.webContents.send('debug', msg);
}

function setIgnore(shouldIgnore: boolean) {
  if (!win) return;
  const changed = shouldIgnore !== ignoring;
  ignoring = shouldIgnore;
  // Always call the OS API — the no-op check saves cycles but also hides
  // whether we're actually issuing the call. We want it visible while debugging.
  if (shouldIgnore) {
    win.setIgnoreMouseEvents(true, { forward: true });
  } else {
    win.setIgnoreMouseEvents(false);
  }
  if (changed) debugToRenderer(`main setIgnore(${shouldIgnore})`);
}

function createWindow() {
  // Windows cannot reliably composite a transparent + alwaysOnTop window
  // across multiple displays. Instead, cover ONE display at a time and, when
  // the user drags the pet toward another monitor, migrate the whole window
  // to that display in the drag polling loop.
  const primary = screen.getPrimaryDisplay().workArea;
  const displays = screen.getAllDisplays();
  console.log('[optec-pet] displays:', displays.map(d => ({
    id: d.id,
    workArea: d.workArea,
    scaleFactor: d.scaleFactor,
  })));
  console.log('[optec-pet] initial window on primary:', primary);

  // Icon is available in dev from public/, in prod from the bundled dist/.
  const iconPath = VITE_DEV_SERVER_URL
    ? path.join(process.env.APP_ROOT!, 'public', 'assets', 'logo.png')
    : path.join(RENDERER_DIST, 'assets', 'logo.png');

  win = new BrowserWindow({
    x: primary.x,
    y: primary.y,
    width: primary.width,
    height: primary.height,
    icon: iconPath,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    thickFrame: false,
    focusable: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  // Use plain true (WS_EX_TOPMOST) instead of the 'screen-saver' level —
  // higher levels can interact oddly with mouse input on some Windows setups.
  win.setAlwaysOnTop(true);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  win.on('ready-to-show', () => {
    win?.showInactive();
    win?.setIgnoreMouseEvents(true, { forward: true });
    setTimeout(() => win?.setIgnoreMouseEvents(true, { forward: true }), 200);
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

function startCursorPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (!win) return;
    if (forceInteractive) {
      setIgnore(false);
      return;
    }
    if (!petBounds) return;
    const cursor = screen.getCursorScreenPoint();
    const wb = win.getBounds();
    const rx = cursor.x - wb.x;
    const ry = cursor.y - wb.y;
    const inside =
      rx >= petBounds.x &&
      rx <= petBounds.x + petBounds.w &&
      ry >= petBounds.y &&
      ry <= petBounds.y + petBounds.h;
    setIgnore(!inside);
  }, 50);
}

ipcMain.on('pet:updateBounds', (_e, bounds: { x: number; y: number; w: number; h: number }) => {
  petBounds = bounds;
});

ipcMain.on('pet:setForceInteractive', (_e, force: boolean) => {
  forceInteractive = force;
  debugToRenderer(`main forceInteractive=${force}`);
  if (force) setIgnore(false);
});

ipcMain.on('pet:setDragMode', (_e, drag: boolean) => {
  dragMode = drag;
  if (drag) {
    if (dragTimer) clearInterval(dragTimer);
    dragTimer = setInterval(() => {
      if (!win || !dragMode) return;
      const cur = screen.getCursorScreenPoint();
      // If the cursor moved to another display, migrate the window there so
      // the transparent overlay actually renders on that monitor.
      const disp = screen.getDisplayNearestPoint(cur);
      const wb = win.getBounds();
      const w = disp.workArea;
      if (wb.x !== w.x || wb.y !== w.y || wb.width !== w.width || wb.height !== w.height) {
        win.setBounds(w);
      }
      const nb = win.getBounds();
      win.webContents.send('drag:cursor', {
        x: cur.x - nb.x,
        y: cur.y - nb.y,
      });
    }, 16);
  } else if (dragTimer) {
    clearInterval(dragTimer);
    dragTimer = null;
  }
});

ipcMain.handle('pet:quit', () => {
  app.quit();
});

ipcMain.on('pet:hide', () => {
  win?.hide();
});

ipcMain.handle('pet:getWorkArea', () => {
  return screen.getPrimaryDisplay().workArea;
});

app.whenReady().then(() => {
  createWindow();
  createTray();
  startCursorPolling();

  globalShortcut.register('Control+Alt+Q', () => app.quit());
  globalShortcut.register('Control+Alt+P', () => {
    if (!win) return;
    togglePetWindow();
  });
  globalShortcut.register('Control+Alt+I', () => {
    setIgnore(!ignoring);
    debugToRenderer(`main manual toggle → ignoring=${ignoring}`);
  });
  // F12 is rarely bound by third-party utilities on Chinese Windows setups,
  // whereas Ctrl+Alt+D collides with a bunch of dictionary tools.
  globalShortcut.register('Control+Alt+F12', () => {
    win?.webContents.send('ui:toggleDebug');
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (dragTimer) {
    clearInterval(dragTimer);
    dragTimer = null;
  }
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
