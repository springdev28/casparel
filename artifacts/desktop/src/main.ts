import {
  app,
  BrowserWindow,
  Menu,
  shell,
  type MenuItemConstructorOptions,
} from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Casparel for the desktop.
 *
 * A thin, hardened shell around the same web app the browser serves, rather
 * than a second implementation: the library, classes, canvases and AI research
 * are one codebase, and the desktop build inherits every deploy without a
 * release. What the shell adds is what a browser tab cannot: a real app window
 * with remembered geometry, a native menu, and deep links.
 *
 * Everything here runs in the main process, so the security posture matters:
 * no node integration, context isolation on, no preload bridge (the page has
 * no need to reach the OS), and any navigation away from Casparel is handed to
 * the system browser instead of being loaded inside the app frame.
 */

/** Where the shell points. Override with CASPAREL_URL for staging or local dev. */
const APP_URL = process.env.CASPAREL_URL ?? "https://casparel.com";
const APP_ORIGIN = new URL(APP_URL).origin;

/** Custom scheme used for deep links, e.g. casparel://resources/123. */
const PROTOCOL = "casparel";

const MIN_WIDTH = 960;
const MIN_HEIGHT = 640;

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized?: boolean;
}

const DEFAULT_STATE: WindowState = { width: 1360, height: 900 };

function stateFile(): string {
  return join(app.getPath("userData"), "window-state.json");
}

function readState(): WindowState {
  try {
    const parsed = JSON.parse(readFileSync(stateFile(), "utf8")) as WindowState;
    // Guard against a corrupt or hand-edited file leaving an unusable window.
    if (
      typeof parsed.width !== "number" ||
      typeof parsed.height !== "number" ||
      parsed.width < MIN_WIDTH ||
      parsed.height < MIN_HEIGHT
    ) {
      return DEFAULT_STATE;
    }
    return parsed;
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(win: BrowserWindow): void {
  try {
    const bounds = win.getNormalBounds();
    writeFileSync(
      stateFile(),
      JSON.stringify({ ...bounds, maximized: win.isMaximized() }),
    );
  } catch {
    // A window that cannot remember its size is not worth crashing over.
  }
}

let mainWindow: BrowserWindow | null = null;

/** Route a URL to the app window when it is ours, and to the browser when not. */
function openUrl(rawUrl: string): void {
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return;
  }

  if (target.protocol === `${PROTOCOL}:`) {
    // casparel://resources/123 -> https://casparel.com/resources/123
    const path = `${target.hostname}${target.pathname}`.replace(/^\/+/, "");
    mainWindow?.loadURL(`${APP_ORIGIN}/${path}${target.search}`);
    mainWindow?.show();
    return;
  }

  if (target.origin === APP_ORIGIN) {
    mainWindow?.loadURL(target.toString());
    mainWindow?.show();
    return;
  }

  // Anything else is the wider web: hand it to the user's real browser, where
  // their extensions, passwords and history live.
  if (target.protocol === "https:" || target.protocol === "http:") {
    void shell.openExternal(target.toString());
  }
}

function buildMenu(): void {
  const isMac = process.platform === "darwin";
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([{ role: "appMenu" }] satisfies MenuItemConstructorOptions[])
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Home",
          accelerator: "CmdOrCtrl+Shift+H",
          click: () => void mainWindow?.loadURL(APP_URL),
        },
        {
          label: "Open in Browser",
          click: () => {
            const current = mainWindow?.webContents.getURL();
            if (current) void shell.openExternal(current);
          },
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        { role: "toggleDevTools" },
      ],
    },
    {
      label: "History",
      submenu: [
        {
          label: "Back",
          accelerator: isMac ? "Cmd+[" : "Alt+Left",
          click: () => mainWindow?.webContents.navigationHistory.goBack(),
        },
        {
          label: "Forward",
          accelerator: isMac ? "Cmd+]" : "Alt+Right",
          click: () => mainWindow?.webContents.navigationHistory.goForward(),
        },
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        {
          label: "Casparel on the Web",
          click: () => void shell.openExternal(APP_URL),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(): void {
  const state = readState();
  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    // Matches the app's dark surface so the window does not flash white while
    // the first paint is on its way.
    backgroundColor: "#0b0f16",
    autoHideMenuBar: process.platform !== "darwin",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  // Lets the web app tell it is running inside the shell, so it can drop the
  // "download the app" prompts it shows to browser visitors. A UA suffix keeps
  // this one-way: no preload bridge, nothing for the page to call into.
  mainWindow.webContents.setUserAgent(
    `${mainWindow.webContents.getUserAgent()} CasparelDesktop/${app.getVersion()}`,
  );

  if (state.maximized) mainWindow.maximize();

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("close", () => mainWindow && saveState(mainWindow));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // target="_blank" and window.open: never open a second Electron window for
  // an outside link, send it to the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openUrl(url);
    return { action: "deny" };
  });

  // Same rule for in-page navigation, so a stray link cannot replace the app
  // with an arbitrary page inside a window the user trusts as "Casparel".
  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      if (new URL(url).origin !== APP_ORIGIN) {
        event.preventDefault();
        openUrl(url);
      }
    } catch {
      event.preventDefault();
    }
  });

  // An offline or unreachable server should say so rather than showing
  // Chromium's error page inside what looks like a native app.
  mainWindow.webContents.on("did-fail-load", (_event, code, description) => {
    if (code === -3) return; // aborted, usually a redirect the shell caused
    void mainWindow?.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(
          `<html><body style="margin:0;display:grid;place-items:center;height:100vh;background:#0b0f16;color:#e8eef8;font:16px system-ui,sans-serif;text-align:center">
             <div><h1 style="font-size:20px;margin:0 0 8px">Cannot reach Casparel</h1>
             <p style="margin:0;opacity:.7">${description || "Check your connection, then choose View then Reload."}</p></div>
           </body></html>`,
        ),
    );
  });

  void mainWindow.loadURL(APP_URL);
}

// One instance only: a second launch focuses the existing window and hands it
// whatever deep link it was started with.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    const deepLink = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    if (deepLink) openUrl(deepLink);
  });

  // macOS delivers deep links as an event rather than an argv entry.
  app.on("open-url", (event, url) => {
    event.preventDefault();
    openUrl(url);
  });

  void app.whenReady().then(() => {
    if (process.defaultApp) {
      // In `electron .` development the executable is Electron itself, so the
      // scheme has to be registered against this script.
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
          process.argv[1],
        ]);
      }
    } else {
      app.setAsDefaultProtocolClient(PROTOCOL);
    }

    buildMenu();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
