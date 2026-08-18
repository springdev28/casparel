# Shipping Casparel to iOS, Android and desktop

What it takes to get a build in front of a real person on each platform, what
the repository already does for you, and what only a human with an account can
do.

Casparel is one product on four surfaces: a React web app, an Expo app for iOS
and Android, an Electron shell for macOS, Windows and Linux, and the Express
API all four talk to. The native builds are not separate products; they sign in
to the same account and read the same library.

## What is automated and what is not

| Step | Who does it |
| --- | --- |
| Store-config checks, icons, typecheck, audits | CI, on every pull request |
| iOS and Android binaries | `.github/workflows/mobile-release.yml` (EAS) |
| Store upload | the same workflow, on a tag |
| Desktop installers and GitHub release | `.github/workflows/desktop-release.yml` |
| Store listings, screenshots, review answers | a person, in each console |
| Accounts, certificates, service keys | a person, once |

Nothing below can be done from this repository alone: an Apple Developer
account, a Google Play developer account and an Expo account are prerequisites,
and each is a paid or identity-verified signup. The repository's job is that
once those exist, a release is a tag rather than an afternoon.

## One-time setup

### Accounts

1. **Apple Developer Program** — an organisation or individual membership,
   annual. Create the app record in App Store Connect with the bundle
   identifier `com.casparel.app` (it must match `app.json`).
2. **Google Play Console** — one-off registration fee, plus identity
   verification that can take days. Create the app with package name
   `com.casparel.app`.
3. **Expo** — free. `eas init` from `artifacts/mobile` links this project to an
   EAS project and writes `extra.eas.projectId` into `app.json`. Commit that
   change: `eas.json` is on `appVersionSource: "remote"`, so EAS is where build
   numbers live, and it needs the project to attribute them to.

### Secrets and variables

Repository → Settings → Secrets and variables → Actions.

Secrets:

| Name | Used by | What it is |
| --- | --- | --- |
| `EXPO_TOKEN` | mobile build and submit | expo.dev → Account settings → Access tokens |
| `APPLE_ID` | mobile submit | the Apple ID that owns the app record |
| `ASC_APP_ID` | mobile submit | the numeric App Store Connect app id |
| `APPLE_TEAM_ID` | mobile submit | ten-character team id |
| `APPLE_APP_SPECIFIC_PASSWORD` | mobile submit | appleid.apple.com → App-Specific Passwords |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | mobile submit | Play service account key, whole JSON |
| `CSC_LINK`, `CSC_KEY_PASSWORD` | desktop release | code-signing certificate (macOS, Windows) |

Variables (not secrets — they end up in the shipped bundle):

| Name | Effect |
| --- | --- |
| `VITE_IOS_APP_URL` | the App Store link the website offers |
| `VITE_ANDROID_APP_URL` | the Google Play link the website offers |
| `VITE_DESKTOP_DOWNLOAD_URL` | the desktop releases page the website offers |

All three are unset by default, and that is deliberate: the landing page and
`/download` say "not yet" rather than linking somewhere that 404s. Set each one
the day its store listing goes live, then redeploy the frontend.

Signing keys for the apps themselves — iOS certificates and provisioning
profiles, the Android upload keystore — stay in EAS, not here. `eas credentials`
manages them. Losing the Android upload key is unrecoverable without a Google
reset request, so let EAS hold it rather than a laptop.

## iOS and Android

### Before the first build

- `pnpm --filter @workspace/mobile run check:release` passes. CI runs it on
  every pull request; it is the same check, and it covers the mistakes that
  otherwise surface at upload rather than at build: an icon carrying an alpha
  channel, a permission the app never uses, an `EXPO_PUBLIC_*` value that would
  be inlined as undefined.
- RevenueCat has products, an entitlement and an offering configured, and
  `EXPO_PUBLIC_RC_IOS_KEY` / `EXPO_PUBLIC_RC_ANDROID_KEY` are set as EAS
  environment variables. Without them the paywall degrades to "purchases
  unavailable"; the app still runs, but it cannot sell anything.
- The API is reachable at `casparel.com`. `utils/api-host.ts` defaults there, so
  a build never points at nothing, but a build pointed at a dead host installs
  and then fails on every screen.

### Building

```sh
# an installable APK / TestFlight-style build, for a phone on a desk
pnpm --filter @workspace/mobile exec eas build --profile preview --platform all

# what goes to the stores
pnpm --filter @workspace/mobile exec eas build --profile production --platform all
```

Or from the Actions tab: **Mobile release** → Run workflow, choosing platform
and profile. The `preview` profile produces an APK rather than an app bundle on
purpose, because an `.aab` can only be uploaded to Play, never installed from a
link.

### Releasing

```sh
# app.json's expo.version must already say 1.0.0; the workflow checks
git tag mobile-v1.0.0 && git push origin mobile-v1.0.0
```

That runs the checks, builds both platforms on EAS, and submits the results to
App Store Connect and the Play internal track. Neither store publishes what it
receives: both wait for a human to complete the listing and submit for review.

### What still needs a person

- Store listing copy, screenshots (App Store wants 6.7" and 6.5" sizes; Play
  wants a feature graphic), and the 1024×1024 icon, which is already generated
  at `artifacts/mobile/assets/images/icon.png`.
- Privacy answers: Apple's nutrition labels and Play's Data safety form. Both
  ask what is collected and why; the app collects an account email, profile
  content the user creates, and purchase state via RevenueCat.
- A reviewer account. Both stores review signed in, and a reviewer who cannot
  get past the login screen rejects the build. Leave demo credentials in the
  review notes.
- Age rating, content rating questionnaire, export compliance (already answered
  in `app.json` via `ITSAppUsesNonExemptEncryption: false`, which is correct for
  an app whose only cryptography is HTTPS).

## Desktop

```sh
git tag desktop-v1.0.0 && git push origin desktop-v1.0.0
```

`.github/workflows/desktop-release.yml` builds on macOS, Windows and Linux
runners — electron-builder can only produce macOS targets on macOS — and
attaches `.dmg`, `.exe`, `.AppImage` and `.deb` to a GitHub release. A manual
run leaves the installers on the workflow run without releasing them, which is
what to use for a demo video.

Unsigned builds work and install, but macOS Gatekeeper and Windows SmartScreen
warn on first launch, which costs more trust than the certificates cost money.
`CSC_LINK` / `CSC_KEY_PASSWORD` (and `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
`APPLE_TEAM_ID` for notarisation) turn that off.

The shell checks for a newer release on launch and offers the Help menu item
that opens the releases page. It reads the public releases API, so this only
works once releases are readable without credentials. See
`artifacts/desktop/README.md`.

## After a release

Set the matching `VITE_*` repository variable and redeploy the frontend, so the
website offers what now exists. Until you do, the apps are live and the site
still says they are not.

## Deliberately not done yet

- **Universal and App Links.** `casparel://` deep links work today, on desktop
  and mobile. Claiming `https://casparel.com/*` needs more than an entitlement:
  the mobile routes are `/resource/[id]` and `/class/[id]` where the web routes
  are `/resources/:id` and `/classes/:id`, so a link claimed today would open
  the app on a not-found screen more often than on the page the person wanted.
  That mapping has to come first, along with serving
  `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`.
- **EAS Update (over-the-air JS).** The build profiles already carry channels,
  so adding `expo-updates` later is a small change. It is worth doing before the
  first store release is old enough to need a hotfix, and it is a real capability
  with its own release discipline rather than a config line, which is why it is
  not switched on by default here.
- **Monochrome Android icon.** Material You themed icons want a single-colour
  silhouette, which cannot be derived from the drawing automatically. The
  adaptive icon is correct without it.
