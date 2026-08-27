/**
 * @fileOverview Public account-deletion instructions and off-app request path.
 * System connection: mounted at /delete-account for Google Play, app-store reviewers,
 * and people who no longer have the Casparel app or cannot sign in.
 */
import { useEffect } from "react";
import { Link } from "wouter";
import {
  Clock3,
  Database,
  Mail,
  ShieldCheck,
  Smartphone,
  Trash2,
} from "lucide-react";
import { Button } from "@workspace/edu-ds/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/edu-ds/components/ui/card";

const SUPPORT_EMAIL = "support@casparel.com";
const DELETION_MAILTO =
  `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Casparel account deletion request")}` +
  `&body=${encodeURIComponent("Casparel account email:\n\nI request permanent deletion of my Casparel account and associated personal data.\n")}`;

const appSteps = [
  "Open Casparel on Android or iPhone and sign in.",
  "Tap Profile in the bottom navigation.",
  "Scroll to Closing your account and tap Delete account.",
  "Review the warning, enter your current password, and tap Delete permanently.",
];

const webSteps = [
  "Sign in to Casparel on the web.",
  "Open Settings from the account menu.",
  "Go to Danger zone and choose Delete account.",
  "Enter your current password and confirm Delete account permanently.",
];

export default function DeleteAccountPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Delete your account | Casparel";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-5 py-10 text-foreground sm:px-6 sm:py-14">
      <header className="max-w-3xl space-y-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary-text">
          Casparel account deletion
        </p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Delete your Casparel account
        </h1>
        <p className="text-base leading-7 text-muted-foreground">
          Casparel lets you start permanent account deletion inside the Android,
          iPhone, or web app. If you no longer have the app or cannot sign in,
          you can submit the request by email from this page.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/settings">
              <Trash2 className="mr-2 size-4" /> Open account settings
            </Link>
          </Button>
          <Button asChild variant="outline">
            <a href={DELETION_MAILTO}>
              <Mail className="mr-2 size-4" /> Request deletion by email
            </a>
          </Button>
        </div>
      </header>

      <section aria-labelledby="delete-inside-app" className="space-y-4">
        <div className="flex items-start gap-3">
          <Smartphone className="mt-1 size-5 shrink-0 text-primary-text" aria-hidden="true" />
          <div>
            <h2 id="delete-inside-app" className="text-2xl font-semibold">
              Delete inside Casparel
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Deletion is protected by your current password and cannot be undone.
            </p>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <DeletionSteps title="Android or iPhone app" steps={appSteps} />
          <DeletionSteps title="Web app" steps={webSteps} />
        </div>
      </section>

      <section aria-labelledby="request-without-app">
        <Card>
          <CardHeader>
            <Mail className="size-5 text-primary-text" aria-hidden="true" />
            <CardTitle id="request-without-app">
              Request deletion without the app
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
            <p>
              Email <a className="font-medium text-primary-text underline" href={DELETION_MAILTO}>{SUPPORT_EMAIL}</a> from the address on your Casparel account. Use the subject “Casparel account deletion request” and include the account email address. Never send your password or authentication token.
            </p>
            <p>
              We will verify that the account belongs to you. We normally acknowledge a request within 7 days and complete it within 30 days after verification. If we need more information, we will reply to the account email address.
            </p>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="subscription-before-deletion">
        <Card className="border-amber-500/40">
          <CardHeader>
            <Clock3 className="size-5 text-warning-text" aria-hidden="true" />
            <CardTitle id="subscription-before-deletion">
              Cancel a store subscription first
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-muted-foreground">
            Deleting Casparel does not automatically cancel a recurring subscription billed by Google Play or Apple. Cancel it in the same store before deleting the account to stop the next renewal. Deletion does not refund a period already paid for.
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="data-after-deletion" className="space-y-4">
        <div className="flex items-start gap-3">
          <Database className="mt-1 size-5 shrink-0 text-primary-text" aria-hidden="true" />
          <div>
            <h2 id="data-after-deletion" className="text-2xl font-semibold">
              What happens to your data
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The same deletion rules apply whether you delete inside the app or request deletion by email.
            </p>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <Trash2 className="size-5 text-destructive-text" aria-hidden="true" />
              <CardTitle>Deleted or destroyed</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
                <li>Your sign-in email and password credential</li>
                <li>Your name, avatar, bio, subjects, year group, timezone, website, and profile visibility settings</li>
                <li>Your private goals, evidence, schedules, lists, activities, private canvases, preferences, and local account activity</li>
                <li>Connected Google and calendar tokens and unpublished resources</li>
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <ShieldCheck className="size-5 text-primary-text" aria-hidden="true" />
              <CardTitle>Anonymized shared records</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
              <p>
                Work shared with other people may remain so their classes and collaborative records do not break. This can include class records, messages, published resources, forum contributions, public learning paths, and class-linked activities or canvases.
              </p>
              <p>
                These records are detached from your login and shown as created by “Deleted user”. They remain for as long as the shared item exists, which may be indefinitely. You can ask support to remove a particular contribution where removal does not violate another person’s rights or a legal obligation.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="retention" className="rounded-lg border bg-muted/30 p-5 sm:p-6">
        <h2 id="retention" className="text-xl font-semibold">
          Legal and security retention
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Casparel does not routinely keep a separate copy of your deleted login email, password credential, or profile for an additional legal or security retention period. If a specific law, court order, fraud investigation, or safety obligation requires a record to be preserved, only the required record is retained for the period required by that obligation and then deleted or anonymized. We will explain the applicable period when legally permitted.
        </p>
      </section>

      <footer className="border-t pt-6 text-sm text-muted-foreground">
        For more detail, read the <Link href="/privacy" className="text-primary-text underline">Casparel Privacy Policy</Link> or contact <a href={DELETION_MAILTO} className="text-primary-text underline">{SUPPORT_EMAIL}</a>.
      </footer>
    </main>
  );
}

function DeletionSteps({ title, steps }: { title: string; steps: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="list-decimal space-y-3 pl-5 text-sm leading-6 text-muted-foreground">
          {steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </CardContent>
    </Card>
  );
}
