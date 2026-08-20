# Casparel code signing policy

How Casparel's desktop installers are built, signed and verified, and who can
cause a signature to happen.

Published so that anyone downloading Casparel can check that what they have is
what this repository built, and so that a signature means something specific
rather than something reassuring.

**Status: signing is not yet in place.** This policy describes the process as
it stands and as it will operate once a certificate is issued; the sections
that depend on one are marked. Releases before that point are unsigned, and
this document says so rather than implying otherwise.

Everything except the certificates themselves is in place. The release workflow
reads the signing credentials, electron-builder signs and then notarises from
them without further configuration, and the platform verifiers check the result.
The verifiers take their cue from whether a certificate is configured: with none
they report what they found and assert nothing, and the moment one exists an
unsigned or unreadable signature **fails the release** rather than printing a
note. That switch is the point — a signing step that quietly stops working would
otherwise produce unsigned installers and a green run, and the first person to
notice would be a user reading a Gatekeeper warning.

What is missing is exactly two things, and neither can be obtained from inside
this repository: an Apple Developer Program membership, and a Windows
certificate. See **Turning signing on** below.

## Scope

This policy covers the **Casparel desktop application** — the Electron shell
for macOS, Windows and Linux, built from `artifacts/desktop/` in this
repository.

It does **not** cover the iOS and Android apps. Those are signed by Apple and
Google through Expo Application Services as part of store distribution, using
credentials held by EAS; the stores, not this policy, govern them.

## What is signed, and by whom

Signing is not one thing. Each platform has its own trust system, and no single
certificate covers them all.

| Artifact | Platform | Signed with | Status |
| --- | --- | --- | --- |
| `Casparel-<version>-<arch>.exe` | Windows (NSIS, x64 and arm64) | SignPath Foundation certificate | pending certificate |
| `Casparel-<version>-<arch>.dmg` | macOS (x64 and arm64) | Apple Developer ID Application, plus notarisation | pending membership |
| `Casparel-<version>-x86_64.AppImage` | Linux | not code-signed | by design |
| `Casparel-<version>-amd64.deb` | Linux | not code-signed | by design |

Linux packages are not Authenticode- or Apple-signed, because Linux has no
equivalent single-vendor trust chain for a downloaded installer. Their
integrity is established by the checksums published with each GitHub release
and by the fact that they are built in public from a public commit.

## What a signature means here

A Casparel signature asserts exactly one thing: **this binary was produced by
the release workflow in this repository, from a specific public commit.**

It is not a statement that the software is free of defects, and it is not a
review of the code it downloads. The desktop application is a hardened shell
around `casparel.com`, so the web content it renders is served at runtime and
is not part of what the signature covers.

## Build provenance

Every signed artifact is produced by
[`.github/workflows/desktop-release.yml`](../.github/workflows/desktop-release.yml),
on GitHub-hosted runners, one per platform. Nothing is ever built or signed
from a personal machine.

The chain is:

1. A release is started either by pushing a `desktop-v<version>` tag, or by
   running the workflow from the Actions tab with the **release** input ticked.
2. Each platform builds from the exact commit the run was started against.
   macOS targets can only be produced on macOS and Windows targets on Windows,
   so the three run in parallel on separate runners.
3. On Linux, `artifacts/desktop/scripts/verify-package.mjs` opens the built
   `.deb` and checks what it actually contains — the applications-menu entry,
   the installed icon sizes, the declared licence, and whether the
   `casparel://` scheme is registered — before anything is uploaded.
4. The tag is created **after** every platform has built successfully, never
   before, and is never moved once it exists. A released version number
   therefore always refers to one commit and one set of artifacts.
5. The installers are attached to a GitHub release on the public repository.

Anyone can re-run this from the same tag and compare. The source is public and
MIT licensed, and the workflow is in the repository alongside it.

## Team roles

Casparel is currently maintained by one person, so all three SignPath roles
resolve to the same individual. That is stated plainly rather than dressed up:
a second reviewer is a control this project does not yet have.

| Role | Who | Responsibility |
| --- | --- | --- |
| Author | Bahar Yüksel (`springdev28`) | Writes and merges the code; starts release builds |
| Reviewer | Bahar Yüksel (`springdev28`) | Reviews changes before they reach `main` |
| Approver | Bahar Yüksel (`springdev28`) | Approves each individual signing request |

**Every signing request requires explicit manual approval.** No automated
process can obtain a signature without a person approving that specific
request in SignPath. A compromised CI token cannot, on its own, produce a
signed binary.

If additional maintainers join, this table is updated before they are granted
any signing-related access.

## Security practices

These are split deliberately. A reviewer reading a list of controls should be
able to tell which ones a machine refuses to break and which ones depend on a
person keeping their word, and a policy that blurs the two is claiming more
than it has.

**Enforced by the repository and its workflows:**

- **No signing key exists in this repository, at any point in its history.**
  The private key for the Windows certificate is held in SignPath's hardware
  security module and is never exported, downloaded or handled by the project.
- **All release credentials live in GitHub Actions secrets**, scoped to this
  repository, and are never written to logs. The release workflow reports
  whether a credential is present, never its value.
- **Every artifact is built on a GitHub-hosted runner**, from the commit the
  run was started against, by the workflow in this repository. There is no
  path by which a locally built binary becomes a release.
- **The tag is created only after every platform has built**, and is never
  moved.

**Operational commitments by the maintainers**, not enforced by tooling:

- **Multi-factor authentication** on every account with write access to the
  repository and on SignPath access.
- **Releases are cut from `main`**, from a commit that has passed the full CI
  suite — typecheck, unit tests, browser audits across five languages, and the
  desktop shell's own runtime smoke tests. The release workflow can technically
  be run against any branch, because building an installer without publishing
  it is how a change gets tested; what is published comes from `main`.
- **Signing requests are approved individually**, as described above. Once
  signing is in place this becomes an enforced control rather than a
  commitment, because SignPath itself requires the approval.

## Turning signing on

Nothing in this repository can produce a certificate; both have to be bought or
granted by an outside party, and both are tied to a legal identity. Once they
exist, they become GitHub Actions secrets and the next release is signed with no
code change — the workflow already reads every name below.

**None of these values may ever be committed.** They go in
`Settings → Secrets and variables → Actions` on the repository and nowhere else.
A certificate that reaches a commit is burned and has to be revoked and
reissued, and git history keeps it whether or not the commit is reverted.

### macOS

Requires an **Apple Developer Program** membership (US$99/year, individual or
organisation). An organisation membership needs a D-U-N-S number and takes
noticeably longer to be granted.

1. In the Apple Developer portal, create a **Developer ID Application**
   certificate — not "Mac App Distribution", which only signs App Store builds
   and will not satisfy Gatekeeper for a direct download.
2. Export it from Keychain Access as a `.p12` with a password, then
   `base64 -i cert.p12 | pbcopy`.
3. Create an **app-specific password** at appleid.apple.com for notarisation.
   The Apple ID's own password will not work.

| Secret | Value |
| --- | --- |
| `CSC_LINK` | the base64 of the `.p12` |
| `CSC_KEY_PASSWORD` | the password set during export |
| `APPLE_ID` | the Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | the app-specific password, not the account one |
| `APPLE_TEAM_ID` | the ten-character Team ID from the portal |

Signing and notarisation are one step: electron-builder notarises straight after
signing when those three `APPLE_*` variables are present, and staples the ticket
so the app opens without the machine having to reach Apple. The first
notarisation of a release adds several minutes per architecture.

### Windows

The plan of record is a **SignPath Foundation** certificate, which is free for
open-source projects and holds the private key in an HSM the project never
touches. Applications are reviewed, and approval is not immediate. A commercial
OV certificate is the alternative if that is declined; note that SmartScreen
reputation for an OV certificate builds over time, so early downloads may still
be warned about, while an EV certificate starts with reputation but requires a
hardware token that a hosted runner cannot use directly.

SignPath is a signing *service* rather than a certificate file: artifacts are
submitted to it and come back signed, so wiring it up replaces `CSC_LINK` for
Windows with SignPath's submission action and its own credentials. That change
is not made in advance, because it needs the organisation and project
identifiers that only exist once the application is approved.

### Confirming it worked

The next release after the secrets are added should show, in place of today's
`note:` lines:

```
ok   the app is signed with a real identity (Authority=Developer ID Application: ...)
ok   the installer carries a valid Authenticode signature (Valid via pwsh)
```

If a signature is missing or unreadable while a certificate is configured, the
release fails instead of publishing. Verify a published artifact yourself with
the commands under **How to verify a download**.

## How to verify a download

**Windows.** Right-click the `.exe`, choose Properties, and open the Digital
Signatures tab. Or in PowerShell:

```powershell
Get-AuthenticodeSignature .\Casparel-1.0.0-x64.exe | Format-List
```

Once signing is in place the publisher will read **SignPath Foundation**, not
Casparel. That is expected and is a condition of the free certificate
programme: the certificate is issued to the Foundation, which signs on behalf
of approved open-source projects. Verify the project by the repository the
release came from, not by the publisher string.

**macOS.** Once a Developer ID certificate is in place:

```sh
codesign -dv --verbose=4 /Applications/Casparel.app
spctl -a -vvv -t install /Applications/Casparel.app
```

**Linux.** Compare the published checksum against the file you downloaded:

```sh
sha256sum Casparel-1.0.0-x86_64.AppImage
```

## Reporting something suspicious

If you encounter a Casparel binary that fails verification, is signed by an
unexpected publisher, or was obtained anywhere other than the project's own
GitHub releases or `casparel.com`, please report it to
**support@casparel.com** rather than running it.

Please include where it came from, the file's SHA-256, and what the signature
claims. Reports about a possibly-compromised release are read before anything
else.

## Changes to this policy

This document lives in the repository and changes through the same reviewed
pull-request process as the code. Its history is public.

---

<!--
  ON APPROVAL BY SIGNPATH FOUNDATION -- three things fall due, not one. The
  attribution is required, so the first is an obligation rather than a courtesy.

  1. Replace this comment and the placeholder line below it with:

     _Free code signing provided by [SignPath.io](https://signpath.io),
     certificate by [SignPath Foundation](https://signpath.org)._

  2. Put the same credit on the published page, artifacts/app/src/pages/
     CodeSigningPage.tsx, and translate the string into all five languages.
     The policy and the page are both "published" for SignPath's purposes, and
     the page is the one an actual downloader reads.

  3. Add the signing step to .github/workflows/desktop-release.yml and set the
     SignPath credentials as repository secrets. The workflow already builds
     unsigned when no certificate is present, so this is an addition rather
     than a rewrite.

  Then update the status line at the top of this document and the "What gets
  signed" table on the page, both of which currently say Windows is pending.

  None of it before approval: publishing the attribution first would claim a
  relationship that does not exist.
-->

Windows signing is not yet provided by anyone. When it is, the provider is
credited here.
