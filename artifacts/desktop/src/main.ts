import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  net,
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

/** Where the shell points. Override with CASPAREL_URL for staging or local dev. */
const APP_URL = process.env.CASPAREL_URL ?? "https://casparel.com";
const APP_ORIGIN = new URL(APP_URL).origin;

/** Custom scheme used for deep links, e.g. casparel://resources/123. */
const PROTOCOL = "casparel";

/**
 * Where a newer shell would be announced, and where the user is sent to get
 * it. The same repository electron-builder.yml publishes releases to.
 */
const RELEASES_API =
  "https://api.github.com/repos/springdev28/casparel/releases/latest";
const RELEASES_PAGE = "https://github.com/springdev28/casparel/releases/latest";
/** Release tags are `desktop-v1.2.3`; the app's version is `1.2.3`. */
const RELEASE_TAG_PREFIX = "desktop-v";

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
    return { kind: "in-app", url: `${APP_ORIGIN}/${path}${target.search}` };
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

/** Route a URL to the app window when it is ours, and to the browser when not. */
function openUrl(rawUrl: string): void {
  const target = resolveUrl(rawUrl);
  if (target.kind === "ignore") return;

  if (target.kind === "external") {
    void shell.openExternal(target.url);
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

// ---------------------------------------------------------------------------
// Updates: whether a newer shell has been published, and nothing more.
//
// The shell loads the hosted web app, so the product updates itself and only
// the window around it ever goes stale — rarely, and never urgently. That is
// the whole reason this checks rather than updates: an auto-updater would
// download and run code on the user's machine, which is a large amount of new
// trust to ask for on behalf of a window whose entire security posture is that
// it has no channel into the OS. Nothing here executes anything. It reads one
// JSON document, compares two version numbers, and at most opens the releases
// page in the user's own browser.
// ---------------------------------------------------------------------------

/** The newest published version, once a check has found one above ours. */
let availableUpdate: string | null = null;

/** Numeric-part comparison. Returns true when `candidate` is newer. */
function isNewer(candidate: string, current: string): boolean {
  const parse = (value: string) =>
    value
      .split(".")
      .map((part) => Number.parseInt(part, 10))
      .map((part) => (Number.isFinite(part) ? part : 0));
  const left = parse(candidate);
  const right = parse(current);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}

/** The published version, or null if that cannot be established right now. */
async function latestPublishedVersion(): Promise<string | null> {
  try {
    // net.fetch rather than the global: it goes through Chromium's stack, so
    // it honours the system proxy the rest of the app already uses.
    const response = await net.fetch(RELEASES_API, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return null;
    const release = (await response.json()) as { tag_name?: unknown };
    const tag = typeof release.tag_name === "string" ? release.tag_name : "";
    if (!tag.startsWith(RELEASE_TAG_PREFIX)) return null;
    const version = tag.slice(RELEASE_TAG_PREFIX.length);
    return /^\d+(\.\d+)*$/.test(version) ? version : null;
  } catch {
    // Offline, rate limited, or the repository is not public yet. None of
    // those are worth telling anyone about unless they asked.
    return null;
  }
}

/**
 * `silent` is the launch check: it may add an item to the Help menu and must
 * never interrupt. Without it the user asked, so every outcome gets an answer.
 */
async function checkForUpdates(silent: boolean): Promise<void> {
  const current = app.getVersion();
  const latest = await latestPublishedVersion();

  if (latest && isNewer(latest, current)) {
    availableUpdate = latest;
    buildMenu();
    if (silent) return;
  }

  if (silent) return;

  if (!latest) {
    await dialog.showMessageBox({
      type: "info",
      message: "Could not check for updates",
      detail: `Casparel ${current} is installed. The update list could not be reached. Check your connection, or look at ${RELEASES_PAGE}.`,
      buttons: ["OK"],
    });
    return;
  }

  if (!isNewer(latest, current)) {
    await dialog.showMessageBox({
      type: "info",
      message: "Casparel is up to date",
      detail: `Version ${current} is the latest release.`,
      buttons: ["OK"],
    });
    return;
  }

  const { response } = await dialog.showMessageBox({
    type: "info",
    message: `Casparel ${latest} is available`,
    detail: `You have ${current}. Downloads open in your browser; nothing is installed for you.`,
    buttons: ["Open Downloads", "Later"],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) void shell.openExternal(RELEASES_PAGE);
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
        // Only present once a check has actually found something, so the menu
        // never implies an update that is not there.
        ...(availableUpdate
          ? ([
              {
                label: `Casparel ${availableUpdate} is available…`,
                click: () => void shell.openExternal(RELEASES_PAGE),
              },
              { type: "separator" },
            ] satisfies MenuItemConstructorOptions[])
          : []),
        {
          label: "Check for Updates…",
          click: () => void checkForUpdates(false),
        },
        { type: "separator" },
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
            `<html><body style="margin:0;display:grid;place-items:center;height:100vh;background:#0b0f16;color:#e8eef8;font:16px system-ui,sans-serif;text-align:center">
             <div><h1 style="font-size:20px;margin:0 0 8px">Cannot reach Casparel</h1>
             <p style="margin:0 0 16px;opacity:.7">${description || "Check your connection and try again."}</p>
             <a href="${APP_URL}" style="display:inline-block;padding:8px 16px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none">Try again</a></div>
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

    // One quiet look, after the window is up and the first page has had a
    // chance to load, so nothing competes with startup. Only a packaged build
    // can be out of date — `electron .` is whatever is checked out — and
    // CASPAREL_NO_UPDATE_CHECK turns even that off for anyone distributing
    // the shell through a package manager that owns updates itself.
    if (app.isPackaged && !process.env.CASPAREL_NO_UPDATE_CHECK) {
      setTimeout(() => void checkForUpdates(true), 10_000);
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
