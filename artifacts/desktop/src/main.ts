/**
 * @fileOverview Desktop runtime role: implements the thin Electron shell around the canonical Casparel web client.
 * System connection: controls navigation/deep links and loads the configured web origin; it does not duplicate server data or business logic.
 */
import {
  app,
  BrowserWindow,
  Menu,
  session,
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

/** Validate the configured remote app before it becomes a trusted origin. */
function configuredAppUrl(rawUrl: string): URL {
  const target = new URL(rawUrl);
  if (
    (target.protocol !== "https:" && target.protocol !== "http:") ||
    target.username ||
    target.password
  ) {
    throw new Error(
      "CASPAREL_URL must be an HTTP(S) URL without embedded credentials",
    );
  }
  return target;
}

/** Where the shell points. Override with CASPAREL_URL for staging or local dev. */
const APP_TARGET = configuredAppUrl(
  process.env.CASPAREL_URL ?? "https://casparel.com",
);
const APP_URL = APP_TARGET.toString();
const APP_ORIGIN = APP_TARGET.origin;

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

/**
 * A deep link that arrived before there was a window to show it in.
 *
 * Launching the app by clicking casparel://resources/123 delivers the URL
 * during startup, when mainWindow is still null, so the old code dropped it
 * and opened the home page instead. Only ALREADY-RUNNING links worked.
 *
 * Only in-app targets are ever queued. Queuing whatever arrives would let an
 * arbitrary third-party URL be stashed here and then loaded as the first page
 * of the app window, which is exactly what the origin pinning below exists to
 * prevent.
 */
let pendingDeepLink: string | null = null;

type UrlTarget =
  | { kind: "in-app"; url: string }
  | { kind: "external"; url: string }
  | { kind: "ignore" };

/** Decide where a URL belongs, without acting on it. */
function resolveUrl(rawUrl: string): UrlTarget {
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return { kind: "ignore" };
  }

  if (target.protocol === `${PROTOCOL}:`) {
    // casparel://resources/123 -> https://casparel.com/resources/123
    const path = `${target.hostname}${target.pathname}`.replace(/^\/+/, "");
    return {
      kind: "in-app",
      url: `${APP_ORIGIN}/${path}${target.search}${target.hash}`,
    };
  }

  if (target.origin === APP_ORIGIN) {
    return { kind: "in-app", url: target.toString() };
  }

  // Anything else is the wider web: hand it to the user's real browser, where
  // their extensions, passwords and history live.
  if (target.protocol === "https:" || target.protocol === "http:") {
    return { kind: "external", url: target.toString() };
  }

  return { kind: "ignore" };
}

/** Open only normal web URLs in the system browser. */
function openExternalHttp(rawUrl: string): void {
  try {
    const target = new URL(rawUrl);
    if (
      (target.protocol === "https:" || target.protocol === "http:") &&
      !target.username &&
      !target.password
    ) {
      void shell.openExternal(target.toString());
    }
  } catch {
    // Invalid/non-web protocols are deliberately inert.
  }
}

/** Route a URL to the app window when it is ours, and to the browser when not. */
function openUrl(rawUrl: string): void {
  const target = resolveUrl(rawUrl);
  if (target.kind === "ignore") return;

  if (target.kind === "external") {
    openExternalHttp(target.url);
    return;
  }

  if (!mainWindow) {
    // Cold start: remember it and let createWindow open it as the first page.
    pendingDeepLink = target.url;
    return;
  }

  void mainWindow.loadURL(target.url);
  mainWindow.show();
}

/**
 * Decide what the page may ask the OS for.
 *
 * Electron grants every permission a page requests by default when no handler
 * is installed, and there was none: the remote page - and, more to the point,
 * anything embedded in it - could take camera, microphone, geolocation and
 * notifications silently, with none of the prompting a browser would do. A
 * resource page renders third-party iframes, including a PDF frame whose src
 * is an arbitrary URL supplied with the resource, so "we trust our own site"
 * is not the same as "we trust everything running inside it".
 *
 * The origin checked is the REQUESTING frame's, never webContents.getURL():
 * that returns the top-level URL, which is always casparel.com, so an embed
 * would inherit the app's own trust.
 */

/** Harmless anywhere, and needed for embedded video to go fullscreen. */
const PERMISSIONS_ANY_ORIGIN = new Set(["fullscreen", "clipboard-sanitized-write"]);
/** Only Casparel itself, never an embed. */
const PERMISSIONS_APP_ONLY = new Set(["notifications", "clipboard-read"]);

function permissionAllowed(permission: string, requestingOrigin: string): boolean {
  if (PERMISSIONS_ANY_ORIGIN.has(permission)) return true;
  if (!PERMISSIONS_APP_ONLY.has(permission)) return false;
  return requestingOrigin === APP_ORIGIN;
}

function originOf(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

/** Escape untrusted Chromium error text before placing it in the offline page. */
function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}

function installPermissionPolicy(): void {
  const target = session.defaultSession;

  target.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    // requestingUrl is the frame that actually asked.
    const requestingUrl = (details as { requestingUrl?: string } | undefined)
      ?.requestingUrl;
    callback(permissionAllowed(permission, originOf(requestingUrl)));
  });

  // The synchronous counterpart, used for things like navigator.permissions
  // queries. webContents is typed nullable here, so it is never dereferenced.
  target.setPermissionCheckHandler((_webContents, permission, requestingOrigin) =>
    permissionAllowed(permission, requestingOrigin),
  );
}

/**
 * Test hook for scripts/smoke.mjs. Inert unless CASPAREL_SMOKE is set, which
 * nothing in a shipped build does.
 *
 * These behaviours - a dead embed not tearing down the window, a cross-origin
 * redirect being refused, a cold-start deep link becoming the first page -
 * only exist at runtime in a real Electron window, so they cannot be covered
 * by a type check or a unit test.
 */
function reportSmokeResult(win: BrowserWindow, firstUrl: string): void {
  const mode = process.env.CASPAREL_SMOKE;
  const say = (result: string) => {
    process.stdout.write(`SMOKE: ${result}\n`);
    setTimeout(() => app.exit(0), 100);
  };

  if (mode === "deeplink") {
    win.webContents.once("did-finish-load", () => {
      say(new URL(win.webContents.getURL()).pathname);
    });
    return;
  }

  if (mode === "external") {
    // Prevent a real browser launch during the test and report exactly what
    // the shell would have handed off.
    Object.defineProperty(shell, "openExternal", {
      configurable: true,
      value: async (url: string) => say(url),
    });
    win.webContents.once("did-finish-load", () => {
      void win.webContents.executeJavaScript(
        `window.open("https://example.com/approved", "_blank")`,
      );
    });
    return;
  }

  if (mode === "unsafe") {
    let escaped = false;
    Object.defineProperty(shell, "openExternal", {
      configurable: true,
      value: async () => {
        escaped = true;
      },
    });
    win.webContents.once("did-finish-load", () => {
      void win.webContents.executeJavaScript(
        `window.open("file:///etc/passwd", "_blank")`,
      );
      setTimeout(() => {
        say(
          !escaped && originOf(win.webContents.getURL()) === APP_ORIGIN
            ? "blocked"
            : "escaped",
        );
      }, 750);
    });
    return;
  }

  if (mode === "redirect") {
    let blocked = true;
    win.webContents.on("will-navigate", () => {});
    win.webContents.once("did-finish-load", () => {
      void win.webContents.loadURL(`${firstUrl.replace(/\/$/, "")}/leaves`).catch(() => {});
      setTimeout(() => {
        const current = win.webContents.getURL();
        blocked = !current.startsWith("https://example.com");
        say(blocked ? "blocked" : "escaped");
      }, 2_500);
    });
    return;
  }

  if (mode === "mainframe") {
    win.webContents.once("did-finish-load", () => {
      void win.webContents.loadURL(`${firstUrl.replace(/\/$/, "")}/dead-embed`).catch(() => {});
      setTimeout(() => {
        say(win.webContents.getURL().startsWith("data:") ? "offline-page" : "still-loaded");
      }, 2_500);
    });
    return;
  }

  // "embed": the home page renders an iframe that fails. The window must still
  // be showing the app, not the offline page.
  setTimeout(() => {
    say(win.webContents.getURL().startsWith("data:") ? "window-lost" : "app-intact");
  }, 3_500);
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
            if (current) openExternalHttp(current);
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
          click: () => openExternalHttp(APP_URL),
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
      safeDialogs: true,
      webviewTag: false,
      navigateOnDragDrop: false,
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
  //
  // will-redirect matters as much as will-navigate: a same-origin link that
  // the SERVER answers with a 302 to another site never fires will-navigate
  // for the final URL, so checking only the first hop let a redirect walk
  // straight through the origin pin.
  const guardNavigation = (details: { url: string; preventDefault(): void }) => {
    try {
      if (new URL(details.url).origin !== APP_ORIGIN) {
        details.preventDefault();
        openUrl(details.url);
      }
    } catch {
      // Unparseable target: refuse rather than guess.
      details.preventDefault();
    }
  };
  mainWindow.webContents.on("will-navigate", guardNavigation);
  mainWindow.webContents.on("will-redirect", guardNavigation);

  // An offline or unreachable server should say so rather than showing
  // Chromium's error page inside what looks like a native app.
  mainWindow.webContents.on(
    "did-fail-load",
    (_event, code, description, validatedURL, isMainFrame) => {
      if (code === -3) return; // aborted, usually a redirect the shell caused
      // An embed failing is not the app failing. Resource pages render
      // third-party iframes (video, PDFs at an arbitrary supplied URL); without
      // this check a single dead embed replaced the ENTIRE window with the
      // offline page, losing whatever the user was doing.
      if (!isMainFrame) return;
      try {
        if (new URL(validatedURL).origin !== APP_ORIGIN) return;
      } catch {
        // data:/about: - including this error page itself, which must not be
        // able to re-trigger its own handler.
        return;
      }
      void mainWindow?.loadURL(
        "data:text/html;charset=utf-8," +
          encodeURIComponent(
            `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"></head><body style="margin:0;display:grid;place-items:center;height:100vh;background:#0b0f16;color:#e8eef8;font:16px system-ui,sans-serif;text-align:center">
             <div><h1 style="font-size:20px;margin:0 0 8px">Cannot reach Casparel</h1>
             <p style="margin:0 0 16px;opacity:.7">${escapeHtml(description || "Check your connection and try again.")}</p>
             <a href="${escapeHtml(APP_URL)}" style="display:inline-block;padding:8px 16px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none">Try again</a></div>
           </body></html>`,
          ),
      );
    },
  );

  // A deep link that arrived during startup becomes the first page, so
  // clicking casparel://resources/123 from a cold app lands on that resource
  // rather than the home page.
  const firstUrl = pendingDeepLink ?? APP_URL;
  pendingDeepLink = null;
  void mainWindow.loadURL(firstUrl);

  if (process.env.CASPAREL_SMOKE) reportSmokeResult(mainWindow, firstUrl);
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

    installPermissionPolicy();
    buildMenu();

    // Windows and Linux deliver a deep link that STARTED the app as an argv
    // entry, not as an event. Only the second-instance and macOS open-url
    // paths were handled, so clicking casparel://resources/123 with the app
    // closed launched it on the home page and silently dropped the target.
    // openUrl queues it, and createWindow opens it as the first page.
    const launchDeepLink = process.argv.find((arg) =>
      arg.startsWith(`${PROTOCOL}://`),
    );
    if (launchDeepLink) openUrl(launchDeepLink);

    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
