# Casparel for desktop

A native window for macOS, Windows and Linux around the same web app the
browser serves.

## Why a shell rather than a second app

The library, classes, canvases, schedules and AI source research are one
codebase. A shell inherits every web deploy without cutting a desktop release,
so the desktop build can never drift behind the web app. What it adds is what a
browser tab cannot: a real application window with remembered geometry and
zoom, a native menu with Print, single-instance behaviour, and `casparel://`
deep links.

Zoom is remembered because Casparel is read for an hour at a time. Setting the
text to a size you can work at and having it reset on every launch is the
difference between an application and a tab with its own icon.

## Security posture

The main process is the only privileged code, and it is deliberately small:

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- No preload bridge. The page has no channel into the OS, so a compromise of
  the web app cannot reach the file system through the shell.
- Navigation is pinned to the Casparel origin. `target="_blank"`, `window.open`
  and `will-navigate` to any other origin are handed to the system browser
  instead of loading inside a window the user trusts as "Casparel".
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

## Building installers

```sh
pnpm --filter @workspace/desktop build:mac    # dmg, x64 + arm64
pnpm --filter @workspace/desktop build:win    # nsis installer
pnpm --filter @workspace/desktop build:linux  # AppImage + deb
```

Installers land in `release/`. electron-builder can only build macOS targets on
macOS, so a full three-platform release needs a matrix (or a CI runner per OS).

A successful build says nothing about what the installers contain, and the
things that go wrong there are invisible until somebody installs the app: the
applications-menu entry, the icon sizes actually shipped, whether the
`casparel://` scheme is registered at all. `pnpm run verify:package` opens the
built `.deb` and checks them; the release workflow runs it on the Linux job.

Signing needs credentials that are deliberately not in the repository:

- macOS: `CSC_LINK` and `CSC_KEY_PASSWORD` for the Developer ID certificate,
  plus `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` to
  notarise. Without them the build still produces a `.dmg`, but Gatekeeper will
  warn on first launch.
- Windows: `CSC_LINK` / `CSC_KEY_PASSWORD` for the code-signing certificate.
  Unsigned installers trigger SmartScreen.

Unsigned builds are fine for local testing and for a demo video.

## Publishing

`.github/workflows/desktop-release.yml` builds on one runner per platform.
Three ways to start it, depending on what you want out of it:

```sh
# 1. build only, nothing published — installers stay on the workflow run
#    (Actions → Desktop release → Run workflow, leave "release" unchecked)

# 2. build, then tag and publish, without pushing a tag yourself
#    (Actions → Desktop release → Run workflow, tick "release")

# 3. build and publish from a tag you push
git tag desktop-v1.0.0 && git push origin desktop-v1.0.0
```

Option 2 exists because a release needs a tag and not everyone who can run a
workflow can push one. It tags the exact commit it built, only after every
platform has built, and refuses to move a tag that already exists.

Option 1 is what to use the first time, and before any release worth caring
about: it is the only way to install and try the macOS and Windows builds
before they are public, since neither can be produced on a Linux machine.

### Signing

The two platforms are not the same problem, and it is worth knowing which one
you are solving before spending anything.

**macOS is the one signing actually fixes.** A Developer ID Application
certificate plus notarisation removes the "cannot verify the developer" dialog
outright. The certificate exports from Keychain as a `.p12`, so it goes in as
repository secrets and the existing workflow picks it up:

| Secret | For |
| --- | --- |
| `CSC_LINK` | the certificate: `base64 -w0 certificate.p12` |
| `CSC_KEY_PASSWORD` | the password that `.p12` was exported with |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | notarising |

It needs Apple Developer Program membership, which the iOS app needs anyway, so
the two costs collapse into one.

**Windows is different in two ways that change the decision.**

The first: `CSC_LINK` as a base64 `.pfx` no longer describes how a Windows
certificate arrives. Since June 2023 the CA/Browser Forum has required code
signing private keys to live on a hardware token or HSM, and software-only
`.pfx` delivery ended with it. A USB token also cannot be plugged into a
GitHub-hosted runner, so a token-delivered certificate needs either a cloud HSM
option from the CA or a self-hosted runner.

The second, and the one worth reading twice: **signing no longer stops
SmartScreen warning your users.** EV certificates used to bypass it outright on
first download; that behaviour was removed in 2024. Signed or not, reputation
now accumulates per file hash over time, so a freshly signed installer still
warns. Paying the EV premium to avoid that is no longer justified.

So the Windows options, in the order worth considering them here:

| Option | Cost | Fit for this project |
| --- | --- | --- |
| SignPath Foundation | free | OSS programme, OV-level, key on their HSM, no token. This repository is public and MIT, which is the main gate. Windows shows the publisher as "SignPath Foundation", not Casparel. |
| OV certificate from a CA | $150–300/yr | Works anywhere, but the key is on a token or cloud HSM, so the pipeline needs one of those rather than a secret. |
| Azure Artifact Signing | ~$9.99/mo | Cheapest and most CI-friendly, but organisations must be in the USA, Canada, the EU or the UK, and individuals in the USA or Canada. |

Certificate lifetimes also dropped to 15 months from March 2026, so whichever
path is taken becomes a renewal in a bit over a year rather than three.

None of this blocks a release. It decides how loudly Windows complains about
one, and on macOS whether it complains at all.

## Staying current

The shell loads the hosted web app, so the product updates itself and only the
window around it can go stale. It checks once, ten seconds after launch, and
when a newer release exists it says so once for that version and then not
again, however many times the app is opened. `Help → Check for Updates…` asks
on demand and answers every outcome. The Help menu also grows a permanent item
while an update is outstanding, but that cannot be the notification on its own:
this shell hides the menu bar behind Alt on Windows and Linux.

Nothing is ever downloaded or run for the user, which is deliberate: an
auto-updater is a large amount of new trust to ask for on behalf of a window,
and this shell has no preload bridge precisely so that a compromise of the web
app cannot reach the machine.

Two things this depends on: releases have to be readable without credentials
(the check reads the public GitHub releases API and stays quiet when it gets
nothing), and the release tag has to be `desktop-v<version>` matching
`package.json`. `CASPAREL_NO_UPDATE_CHECK=1` turns the check off entirely, for
anyone redistributing the shell through a package manager that owns updates.
