/**
 * @fileOverview Web screen role: renders the Support Page route and coordinates its page-level data and interactions.
 * System connection: mounted from App.tsx; composes generated API hooks, local helpers, and reusable UI components.
 */
import { useEffect } from "react";
import { BookOpen, Mail, ShieldCheck, UserRound } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@workspace/edu-ds/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/edu-ds/components/ui/card";

const SUPPORT_EMAIL = "support@casparel.com";

export default function SupportPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Support | Casparel";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12 text-foreground">
      <header className="max-w-2xl space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary-text">
          Casparel support
        </p>
        <h1 className="text-3xl font-bold tracking-tight">How can we help?</h1>
        <p className="text-muted-foreground">
          Tell us what you were trying to do, what happened, and which device
          you use. Never send your password or a store receipt containing full
          payment details.
        </p>
        <Button asChild>
          <a href={`mailto:${SUPPORT_EMAIL}?subject=Casparel%20support`}>
            <Mail className="mr-2 size-4" /> Email {SUPPORT_EMAIL}
          </a>
        </Button>
      </header>

      <section
        aria-label="Support topics"
        className="grid gap-4 md:grid-cols-3"
      >
        <Card>
          <CardHeader>
            <UserRound className="size-5 text-primary-text" />
            <CardTitle className="text-base">Account access</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Include the email on the account and the exact error. Do not include
            your password or authentication token.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <BookOpen className="size-5 text-primary-text" />
            <CardTitle className="text-base">Resources and research</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Send the resource URL and explain which search, citation, or source
            report did not work as expected.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <ShieldCheck className="size-5 text-primary-text" />
            <CardTitle className="text-base">Subscriptions and privacy</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Use Restore purchases in the mobile app first. For privacy requests,
            state whether you need access, correction, export, or deletion.
          </CardContent>
        </Card>
      </section>

      <section className="border-t pt-6 text-sm text-muted-foreground">
        <p>
          Review the{" "}
          <Link href="/terms" className="text-primary-text underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/code-signing" className="text-primary-text underline">
            Code signing
          </Link>{" "}
          explains how to verify a desktop download.{" "}
          <Link href="/privacy" className="text-primary-text underline">
            Privacy Policy
          </Link>
          . Review the public <Link href="/delete-account" className="text-primary-text underline">account deletion instructions</Link>. You can delete your account from account settings; if you cannot sign in, email support from the address associated with the account.
        </p>
      </section>
    </main>
  );
}
