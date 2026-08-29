/**
 * @fileOverview Web screen role: renders the Settings Page route and coordinates its page-level data and interactions.
 * System connection: mounted from App.tsx; composes generated API hooks, local helpers, and reusable UI components.
 */
import { useState } from "react";
import { Link } from "wouter";
import { getGetMeQueryKey, useGetMe } from "@workspace/api-client-react";
import { Button } from "@workspace/edu-ds/components/ui/button";
import { Switch } from "@workspace/edu-ds/components/ui/switch";
import { toast } from "@workspace/edu-ds/hooks/use-toast";
import {
  BookOpen,
  ChevronRight,
  Compass,
  Languages,
  MessageCircle,
  Palette,
  RotateCcw,
  ShieldAlert,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  AccountActionDialog,
  type AccountAction,
} from "../components/AccountActionDialog";
import { AuthLanguageSelect } from "../components/AuthLanguageSelect";
import ThemeCustomizer from "../components/ThemeCustomizer";
import { PlanSection } from "../components/PlanSection";
import { useAuthLanguage } from "../lib/auth-locale";
import { LoadFailure } from "@/components/LoadFailure";
import {
  useUpdateUserPreferences,
  useUserPreferences,
} from "../lib/user-preferences";

export default function SettingsPage() {
  const {
    data: me,
    isError: meFailed,
    error: meError,
    isFetching: meFetching,
    refetch: refetchMe,
  } = useGetMe({ query: { retry: false, queryKey: getGetMeQueryKey() } });
  /*
   * Whether this page knows whose settings it is showing.
   *
   * The preferences query is gated on `me`, so a failed /users/me leaves it
   * disabled -- reporting neither data nor an error -- and every control
   * below falls back to its default. That is the same failure as the
   * catalogue's `identityUnknown`, and it is worse here: a default shown as
   * a setting is a setting the reader thinks they chose.
   */
  const meStatus = (meError as { status?: number } | null)?.status;
  const identityUnknown = meFailed && meStatus !== 401 && meStatus !== 403;
  const { language, setLanguage, copy } = useAuthLanguage();
  const preferences = useUserPreferences(Boolean(me));
  const updatePreferences = useUpdateUserPreferences();
  const [accountAction, setAccountAction] = useState<AccountAction | null>(
    null,
  );

  async function changeLanguage(next: typeof language) {
    setLanguage(next);
    try {
      await updatePreferences.mutateAsync({ language: next });
    } catch (error) {
      toast({
        title: "Could not save language",
        description:
          error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-4 sm:p-6 lg:p-8">
      <header className="mb-7">
        <h1 className="text-2xl font-bold text-page-contrast sm:text-3xl">
          Settings
        </h1>
        <p className="mt-2 text-sm text-page-contrast-muted">
          Manage how Casparel looks, communicates, and guides your work.
        </p>
      </header>

      <div className="overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm">
        <PlanSection />

        <section className="grid gap-4 border-b p-4 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,20rem)] sm:items-center sm:p-5">
          <div className="flex min-w-0 gap-3">
            <Languages className="mt-0.5 size-5 shrink-0 text-primary-text" />
            <div>
              <h2 className="font-semibold">Language</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose the language used across the interface.
              </p>
            </div>
          </div>
          <AuthLanguageSelect
            language={language}
            label={copy.language}
            onChange={changeLanguage}
          />
        </section>

        <section className="flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex min-w-0 gap-3">
            <Palette className="mt-0.5 size-5 shrink-0 text-primary-text" />
            <div>
              <h2 className="font-semibold">Appearance</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Adjust the interface palette and readable contrast.
              </p>
            </div>
          </div>
          <ThemeCustomizer
            accountId={me?.id}
            showLabel
            className="justify-start sm:justify-center"
          />
        </section>

        <section className="flex items-center justify-between gap-4 border-b p-4 sm:p-5">
          <div className="flex min-w-0 gap-3">
            <MessageCircle className="mt-0.5 size-5 shrink-0 text-primary-text" />
            <div>
              <h2 className="font-semibold">Message requests</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Allow people you have not added to request a conversation.
              </p>
            </div>
          </div>
          {/*
            * A setting nobody could read is not a setting that is on.
            *
            * This fell back to `?? true`, so a reader whose preferences did
            * not load saw the switch on whatever they had chosen -- and it
            * stayed usable, so flipping it wrote a value derived from a state
            * the page had invented. Somebody who had turned message requests
            * off was shown them on. The page had never been rendered against
            * a server that would not answer.
            */}
          {identityUnknown || preferences.isError ? (
            <LoadFailure
              className="max-w-xs border-none p-0 text-left"
              error={identityUnknown ? meError : preferences.error}
              retrying={identityUnknown ? meFetching : preferences.isFetching}
              onRetry={() => {
                void (identityUnknown ? refetchMe() : preferences.refetch());
              }}
            />
          ) : (
            <Switch
              checked={preferences.data?.allowMessageRequests ?? true}
              disabled={preferences.isLoading || updatePreferences.isPending}
              onCheckedChange={(checked) =>
                updatePreferences.mutate({ allowMessageRequests: checked })
              }
              aria-label="Allow message requests"
            />
          )}
        </section>

        <section className="flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex min-w-0 gap-3">
            <Compass className="mt-0.5 size-5 shrink-0 text-primary-text" />
            <div>
              <h2 className="font-semibold">Product tour</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Replay the guided first-run walkthrough of Casparel’s core
                workflow at any time.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/tutorial">
              Start the tour <ChevronRight className="size-4" />
            </Link>
          </Button>
        </section>

        <section className="flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex min-w-0 gap-3">
            <BookOpen className="mt-0.5 size-5 shrink-0 text-primary-text" />
            <div>
              <h2 className="font-semibold">Complete guide</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                A full reference to every feature, kept up to date with each
                release, including what’s new.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/guide">
              Open the guide <ChevronRight className="size-4" />
            </Link>
          </Button>
        </section>

        <section className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex min-w-0 gap-3">
            <UserRound className="mt-0.5 size-5 shrink-0 text-primary-text" />
            <div>
              <h2 className="font-semibold">Profile and privacy</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Edit your profile, visibility, subjects, and avatar.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/profile">
              Manage profile <ChevronRight className="size-4" />
            </Link>
          </Button>
        </section>
      </div>

      {/*
       * Destructive account controls live in their own visually separated
       * region. They are not ordinary preferences: both open a consequence
       * warning, and neither request can be sent until the current password is
       * entered in AccountActionDialog.
       */}
      <section className="mt-6 overflow-hidden rounded-lg border border-destructive/35 bg-card text-card-foreground shadow-sm">
        <header className="flex gap-3 border-b border-destructive/20 p-4 sm:p-5">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive-text" />
          <div>
            <h2 className="font-semibold">Danger zone</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              These actions remove account data. Review the warning and confirm
              your current password before continuing.
            </p>
          </div>
        </header>

        <div className="flex flex-col gap-4 border-b border-destructive/20 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h3 className="font-medium">Reset account data</h3>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Return your private workspace, profile, and preferences to a fresh
              state while keeping your login and shared work.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="shrink-0 gap-2 border-destructive/40 text-destructive-text hover:bg-destructive/10"
            onClick={() => setAccountAction("reset")}
          >
            <RotateCcw className="size-4" /> Reset account
          </Button>
        </div>

        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h3 className="font-medium text-destructive-text">
              Delete account
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Permanently close the account, remove its private workspace, and
              anonymize contributions that must remain for collaborators.
            </p>
          </div>
          <Button
            type="button"
            variant="destructive"
            className="shrink-0 gap-2"
            onClick={() => setAccountAction("delete")}
          >
            <Trash2 className="size-4" /> Delete account
          </Button>
        </div>
      </section>

      {accountAction ? (
        <AccountActionDialog
          action={accountAction}
          open
          onOpenChange={(open) => {
            if (!open) setAccountAction(null);
          }}
        />
      ) : null}
    </div>
  );
}
