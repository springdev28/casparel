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
- Production Android advertising has a real AdMob application ID and native
  dashboard ad-unit ID set in the EAS `production` environment. AdMob Privacy &
  messaging, blocked categories, impression-level ad revenue, and RevenueCat
  Ads are enabled. The dynamic Expo config rejects a production build that
  would otherwise ship Google's test identifiers. Preview APKs intentionally
  use official test inventory.
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
  content the user creates, and purchase state via RevenueCat. Play must also
  declare that the Android app contains ads and accurately describe AdMob and
  RevenueCat Ads data, the target audience, and the Families-policy decision.
- The Google Play reviewer account is `review@casparel.com`. It is provisioned
  as a permanent Institutional seat so reviewers can exercise the entire paid
  product without making a real purchase; it remains a normal student account,
  never an administrator. Keep its password only in Play Console's App access
  instructions, never in this repository. Before every submission, test a
  clean install, sign-in, the Institutional label/allowances, and absence of
  sponsored cards. Apple may reuse the account when appropriate.
- The public support mailbox is `support@casparel.com`; confirm it can receive
  mail before submission because every in-app support and legal link uses it.
- Age rating, content rating questionnaire, export compliance (already answered
  in `app.json` via `ITSAppUsesNonExemptEncryption: false`, which is correct for
  an app whose only cryptography is HTTPS).

## Desktop

`.github/workflows/desktop-release.yml` builds on macOS, Windows and Linux
runners — electron-builder can only produce macOS targets on macOS — and
attaches `.dmg`, `.exe`, `.AppImage` and `.deb` to a GitHub release.

Run it from the Actions tab with **release** unchecked to build without
publishing, or with it ticked to tag the built commit and publish. Pushing a
`desktop-v*` tag does the same thing. The tag is always made after the build
and never moved once it exists, so a version number stays a fixed point.

**All three platforms build today, and the installers are unsigned.** How much
that matters is not the same on each, and an earlier version of this document
got Windows wrong, so it is worth being precise.

**macOS**: signing plus notarisation removes the "cannot verify the developer"
dialog outright. A Developer ID Application certificate exports from Keychain
as a `.p12`, so `CSC_LINK` (`base64 -w0 certificate.p12`) and
`CSC_KEY_PASSWORD` as repository secrets, plus `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` to notarise, and the existing
workflow signs. It needs the Apple Developer Program membership the iOS app
needs anyway, so it is one cost rather than two. This is the half worth doing
first, because it is the half that actually removes a warning.

**Windows**: two things make it a different decision.

A `.pfx` in `CSC_LINK` is not how a Windows certificate arrives any more. Since
June 2023 the CA/Browser Forum has required code signing keys to live on a
hardware token or HSM, and software-only delivery ended with it. A USB token
cannot go into a GitHub-hosted runner, so that path needs a cloud HSM or a
self-hosted runner.

And signing does not stop SmartScreen warning users. EV certificates used to
bypass it on first download; that was removed in 2024. Signed or not,
reputation now builds per file hash over time. The certificate is still worth
having — it is what lets reputation accumulate against a publisher at all — but
it does not buy a clean first install, and no amount of money buys one.

How this is all meant to work, in the form SignPath Foundation asks for and a
downloader can check, is the [code signing policy](code-signing-policy.md).

Three ways to sign Windows, best fit first for this project:

| Option | Cost | Notes |
| --- | --- | --- |
| SignPath Foundation | free | Free OV-level signing for open source, key on their HSM, no token. This repository is public and MIT, which is the main gate; the publisher shown in Windows is "SignPath Foundation" rather than Casparel. |
| OV certificate from a CA | $150–300/yr | Works from anywhere. Needs a cloud HSM rather than a USB token to fit CI. |
| Azure Artifact Signing | ~$9.99/mo | Cheapest and built for CI, but limited to organisations in the USA, Canada, EU or UK, and individuals in the USA or Canada — which rules it out from Istanbul. |

Certificate validity also dropped to 15 months in March 2026, so this becomes a
renewal every year and a bit rather than every three.

### When SignPath approves

Approval is not the end of the work, and the attribution is a condition of the
free certificate rather than a nicety. The checklist lives in a comment at the
foot of [the code signing policy](code-signing-policy.md), next to the exact
wording to publish: credit in the policy, the same credit on `/code-signing` in
all five languages, the signing step added to the release workflow, and the two
"pending" statements — the policy's status line and the page's table — corrected.

Nothing on that list before approval arrives. Publishing "certificate by
SignPath Foundation" while an application is still open would claim a
relationship the project does not have, which is a bad thing for a document
about verifying provenance to do.

A build reporting success says nothing about what the installers contain, and
every Linux packaging defect found so far was of exactly that kind: one icon
size where there should have been eight, a malformed line in the
applications-menu entry, and a menu description that read "Casparel for macOS,
Windows and Linux" to somebody looking at a Linux menu. All three built
cleanly. `pnpm --filter @workspace/desktop run verify:package` opens the built
`.deb` and checks these; the release workflow runs it on the Linux job, after
the build and before the upload.

The macOS and Windows halves of the matrix cannot be built on a Linux machine,
so they are only ever exercised in CI. Doing that before the first release was
worth it: the macOS leg failed every time and always would have, because an
absent signing secret arrives as an empty string and electron-builder reads an
empty `CSC_LINK` as a certificate that was supplied. All three platforms build
now. Keep the habit anyway — run without publishing, install the results, then
release — because nothing else on this repository can tell you whether a macOS
or Windows build works.

The shell checks for a newer release on launch and offers a Help menu item that
opens the releases page. It reads the public releases API and stays quiet when
it gets nothing; the repository is public, so this works as soon as the first
release exists. See `artifacts/desktop/README.md`.

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
