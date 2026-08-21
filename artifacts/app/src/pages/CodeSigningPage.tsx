import { useEffect } from "react";
import { Link } from "wouter";
import { ExternalLink, FileCheck, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@workspace/edu-ds/components/ui/button";

const POLICY_URL =
  "https://github.com/springdev28/casparel/blob/main/docs/code-signing-policy.md";
const RELEASES_URL = "https://github.com/springdev28/casparel/releases";
const SUPPORT_EMAIL = "support@casparel.com";

/**
 * /code-signing — how a Casparel download can be checked.
 *
 * Deliberately a faithful summary rather than a second copy of the policy.
 * The complete document lives in the repository, versioned and reviewed like
 * the code it describes; keeping a full duplicate here, in every language,
 * would guarantee the two drift, and a security policy that contradicts
 * itself is worse than one that is one click away.
 *
 * What this page has to carry on its own is what a person about to run an
 * installer needs: what is signed today, what a signature does and does not
 * promise, and the commands to check one.
 */
function Row({ artifact, platform, signer, status }: {
  artifact: string;
  platform: string;
  signer: string;
  status: "pending" | "none";
}) {
  return (
    <tr className="border-t border-border align-top">
      <td className="py-3 pr-4">
        <code className="text-xs">{artifact}</code>
      </td>
      <td className="py-3 pr-4">{platform}</td>
      <td className="py-3 pr-4">{signer}</td>
      <td className="py-3">
        <span
          className={
            status === "pending"
              ? "rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-warning-text"
              : "text-xs text-muted-foreground"
          }
        >
          {status === "pending" ? "Not yet signed" : "Not applicable"}
        </span>
      </td>
    </tr>
  );
}

export default function CodeSigningPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Code signing | Casparel";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12 text-foreground">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary-text">
          Code signing
        </p>
        <h1 className="text-3xl font-bold tracking-tight">
          How to check that a Casparel download is really ours
        </h1>
        <p className="text-muted-foreground">
          Casparel is open source, and every desktop installer is built in
          public from a commit anyone can read. This page explains what that
          does and does not prove, and how to verify a file yourself.
        </p>
      </header>

      <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning-text" />
        <div className="space-y-1 text-sm">
          <p className="font-medium">The desktop installers are not signed yet.</p>
          <p className="text-muted-foreground">
            Until they are, your computer will warn you when you open one. That
            warning is accurate and you should treat it seriously: check the
            file came from our own releases page before running it.
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <FileCheck className="size-5 text-primary-text" /> What gets signed
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="pb-2 pr-4 font-medium">File</th>
                <th className="pb-2 pr-4 font-medium">Platform</th>
                <th className="pb-2 pr-4 font-medium">Signed by</th>
                <th className="pb-2 font-medium">Today</th>
              </tr>
            </thead>
            <tbody>
              <Row artifact=".exe" platform="Windows" signer="SignPath Foundation" status="pending" />
              <Row artifact=".dmg" platform="macOS" signer="Apple Developer ID" status="pending" />
              <Row artifact=".AppImage" platform="Linux" signer="Checksum only" status="none" />
              <Row artifact=".deb" platform="Linux" signer="Checksum only" status="none" />
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted-foreground">
          Linux packages are not signed the way Windows and macOS ones are,
          because Linux has no single authority that vouches for a downloaded
          installer. Compare the published checksum instead.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="size-5 text-primary-text" /> What a signature
          promises
        </h2>
        <p className="text-sm text-muted-foreground">
          One thing only: that the file came from our release pipeline, built
          from a specific public commit. It is not a promise that the software
          is free of bugs, and it does not cover the pages the app loads from
          this website while you use it.
        </p>
        <p className="text-sm text-muted-foreground">
          Every release is built by a workflow in the open repository, on
          machines we do not control the contents of, one per platform. No
          installer is ever built on a personal computer. Each signing request
          has to be approved by a maintainer by hand, so an automated system
          cannot produce a signed file on its own.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Checking a file yourself</h2>
        <p className="text-sm text-muted-foreground">
          On Windows, right-click the installer, open Properties, and look at
          the Digital Signatures tab. On macOS and Linux, from a terminal:
        </p>
        <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 text-xs">
          <code>{`# macOS
codesign -dv --verbose=4 /Applications/Casparel.app

# Linux
sha256sum Casparel-1.0.0-x86_64.AppImage`}</code>
        </pre>
        <p className="text-sm text-muted-foreground">
          When Windows signing is in place, the publisher will read SignPath
          Foundation rather than Casparel. That is expected: they issue the
          certificate and sign on behalf of open-source projects. Judge a
          download by the page it came from, not by that name.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">If something looks wrong</h2>
        <p className="text-sm text-muted-foreground">
          If you have a Casparel installer that fails these checks, or that came
          from anywhere other than our own releases page, please do not run it.
          Send us where you got it and the file's checksum.
        </p>
        <Button variant="outline" asChild className="gap-2">
          <a href={`mailto:${SUPPORT_EMAIL}?subject=Casparel%20download%20check`}>
            Email {SUPPORT_EMAIL}
          </a>
        </Button>
      </section>

      <section className="space-y-3 border-t border-border pt-6">
        <h2 className="text-lg font-semibold">The full policy</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          The complete code signing policy lives in the repository, where it is
          versioned and reviewed like the rest of the project. It covers build
          provenance, who holds which role, and the security practices behind
          all of this.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="gap-2">
            <a href={POLICY_URL} target="_blank" rel="noopener noreferrer">
              Read the full policy <ExternalLink className="size-4" />
            </a>
          </Button>
          <Button variant="outline" asChild className="gap-2">
            <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer">
              Official releases <ExternalLink className="size-4" />
            </a>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/download">Back to downloads</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
