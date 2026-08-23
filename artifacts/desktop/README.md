# Casparel for desktop

A native window for macOS, Windows and Linux around the same web app the
browser serves.

## Why a shell rather than a second app

The library, classes, canvases, schedules and AI source research are one
codebase. A shell inherits every web deploy without cutting a desktop release,
so the desktop build can never drift behind the web app. What it adds is what a
browser tab cannot: a real application window with remembered geometry, a
native menu, single-instance behaviour, and `casparel://` deep links.

## Security posture

The main process is the only privileged code, and it is deliberately small:

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- No preload bridge. The page has no channel into the OS, so a compromise of
  the web app cannot reach the file system through the shell.
- Navigation is pinned to the Casparel origin. `target="_blank"`, `window.open`
  and `will-navigate` to any other HTTP(S) origin are handed to the system
  browser instead of loading inside a window the user trusts as "Casparel".
  Unsafe protocols and credential-bearing URLs are ignored.
- Webviews and drag/drop navigation are disabled. Permission decisions use the
  requesting frame's origin, so a third-party embed cannot inherit Casparel's
  limited notification or clipboard access.
- An embedded-resource failure leaves the main app visible. A main-frame
  outage shows a local, CSP-constrained “Cannot reach Casparel” page with
  escaped error text; this shell does not claim offline product functionality.
- The shell identifies itself with a `CasparelDesktop/<version>` user-agent
  suffix. That is one-way: the web app reads it to stop advertising a download
  to someone already running the app, and nothing more.

## Running it

```sh
pnpm --filter @workspace/desktop dev
```

Point it somewhere other than production with `CASPAREL_URL`:

```sh
CASPAREL_URL=http://localhost:5173 pnpm --filter @workspace/desktop dev
```

The real-window smoke suite exercises the security and outage boundary:

```sh
pnpm --filter @workspace/desktop run smoke
```

It checks embedded and main-frame failures, cross-origin redirects, cold-start
deep links, approved system-browser handoff, and unsafe-protocol blocking.

## Building installers

```sh
pnpm --filter @workspace/desktop build:mac    # dmg, x64 + arm64
pnpm --filter @workspace/desktop build:win    # nsis installer
pnpm --filter @workspace/desktop build:linux  # AppImage + deb
```

Installers land in `release/`. electron-builder can only build macOS targets on
macOS, so a full three-platform release needs a matrix (or a CI runner per OS).

Signing needs credentials that are deliberately not in the repository:

- macOS: `CSC_LINK` and `CSC_KEY_PASSWORD` for the Developer ID certificate,
  plus `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` to
  notarise. Without them the build still produces a `.dmg`, but Gatekeeper will
  warn on first launch.
- Windows: `CSC_LINK` / `CSC_KEY_PASSWORD` for the code-signing certificate.
  Unsigned installers trigger SmartScreen.

Unsigned builds are fine for local testing and for a demo video.

## Publishing

`DESKTOP_DOWNLOAD_URL` in `artifacts/app/src/pages/LandingPage.tsx` is `null`
until there is a real releases page behind it, at which point the landing page
grows a "Download for desktop" button. Same rule as the store links: a dead
download link is worse than an honest "coming soon".
