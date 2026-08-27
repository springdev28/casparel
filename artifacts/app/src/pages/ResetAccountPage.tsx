/**
 * @fileOverview Public instructions for resetting a Casparel account without deleting it.
 * System connection: mounted at /reset-account and linked from Support for people
 * who need to understand the reset before opening the password-protected control.
 */
import { useEffect } from "react";
import { Link } from "wouter";
import {
  Database,
  LifeBuoy,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { Button } from "@workspace/edu-ds/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/edu-ds/components/ui/card";

const appSteps = [
  "Open Casparel on Android or iPhone and sign in.",
  "Tap Profile in the bottom navigation.",
  "Scroll to Closing your account and tap Reset account data.",
  "Review the warning, enter your current password, and tap Reset account data.",
];

const webSteps = [
  "Sign in to Casparel on the web.",
  "Open Settings from the account menu.",
  "Go to Danger zone and choose Reset account.",
  "Review the warning, enter your current password, and confirm Reset account.",
];

export default function ResetAccountPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Reset your account data | Casparel";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-5 py-10 text-foreground sm:px-6 sm:py-14">
      <header className="max-w-3xl space-y-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary-text">
          Casparel account reset
        </p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Reset your Casparel account data
        </h1>
        <p className="text-base leading-7 text-muted-foreground">
          Reset returns your private workspace, profile, and preferences to a
          fresh state while keeping your login and shared work. It cannot be
          undone, but it does not delete your Casparel account.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/settings">
              <RotateCcw className="mr-2 size-4" /> Open account settings
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/support#contact-support">
              <LifeBuoy className="mr-2 size-4" /> Contact support
            </Link>
          </Button>
        </div>
      </header>

      <section aria-labelledby="reset-inside-app" className="space-y-4">
        <div className="flex items-start gap-3">
          <Smartphone
            className="mt-1 size-5 shrink-0 text-primary-text"
            aria-hidden="true"
          />
          <div>
            <h2 id="reset-inside-app" className="text-2xl font-semibold">
              Reset inside Casparel
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Reset is protected by your current password and keeps you signed
              in when it finishes.
            </p>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <ResetSteps title="Android or iPhone app" steps={appSteps} />
          <ResetSteps title="Web app" steps={webSteps} />
        </div>
      </section>

      <section aria-labelledby="reset-data" className="space-y-4">
        <div className="flex items-start gap-3">
          <Database
            className="mt-1 size-5 shrink-0 text-primary-text"
            aria-hidden="true"
          />
          <div>
            <h2 id="reset-data" className="text-2xl font-semibold">
              What reset changes
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Reset clears private account data while preserving the account and
              work other people rely on.
            </p>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <RotateCcw
                className="size-5 text-destructive-text"
                aria-hidden="true"
              />
              <CardTitle>Reset removes</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
                <li>
                  Your avatar, bio, subjects, year group, timezone, website, and
                  profile visibility settings
                </li>
                <li>
                  Your private goals, evidence, schedules, lists, activities,
                  and private canvases
                </li>
                <li>
                  Your preferences, tutorial state, and local account activity
                </li>
                <li>
                  Connected Google and calendar tokens and unpublished resources
                </li>
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <ShieldCheck
                className="size-5 text-primary-text"
                aria-hidden="true"
              />
              <CardTitle>Reset keeps</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
                <li>
                  Your sign-in email, password, name, account role, and access
                  to Casparel
                </li>
                <li>Your subscription and current signed-in session</li>
                <li>Your classes, messages, and class-linked work</li>
                <li>
                  Your submitted or published resources, shared work, and public
                  contributions
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="reset-security">
        <Card>
          <CardHeader>
            <LockKeyhole
              className="size-5 text-primary-text"
              aria-hidden="true"
            />
            <CardTitle id="reset-security">
              Security and account access
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              Casparel support will never ask for your password. The reset must
              be confirmed while you are signed in by entering your current
              password in Casparel.
            </p>
            <p>
              If you cannot sign in, recover access first or send a request
              through the support form. Support can help with account access,
              but cannot reset private data without the signed-in confirmation.
            </p>
          </CardContent>
        </Card>
      </section>

      <footer className="border-t pt-6 text-sm text-muted-foreground">
        Reset is different from permanent deletion. Read the{" "}
        <Link href="/delete-account" className="text-primary-text underline">
          Casparel account deletion instructions
        </Link>
        .
      </footer>
    </main>
  );
}

function ResetSteps({ title, steps }: { title: string; steps: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="list-decimal space-y-3 pl-5 text-sm leading-6 text-muted-foreground">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
