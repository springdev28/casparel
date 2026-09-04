/**
 * @fileOverview Web screen role: renders the Settings Page route and coordinates its page-level data and interactions.
 * System connection: mounted from App.tsx; composes generated API hooks, local helpers, and reusable UI components.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { Button } from "@workspace/edu-ds/components/ui/button";
import { Switch } from "@workspace/edu-ds/components/ui/switch";
import { toast } from "@workspace/edu-ds/hooks/use-toast";
import {
  BookOpen,
  Ban,
  Bell,
  ChevronRight,
  Compass,
  Languages,
  MessageCircle,
  Palette,
  RotateCcw,
  ShieldAlert,
  Trash2,
  UserRound,
  Volume2,
} from "lucide-react";
import {
  AccountActionDialog,
  type AccountAction,
} from "../components/AccountActionDialog";
import { AuthLanguageSelect } from "../components/AuthLanguageSelect";
import ThemeCustomizer from "../components/ThemeCustomizer";
import { PlanSection } from "../components/PlanSection";
import { useAuthLanguage } from "../lib/auth-locale";
import { usePlan } from "../lib/use-plan";
import {
  useUpdateUserPreferences,
  useUserPreferences,
} from "../lib/user-preferences";

type NativeAdPreferences = {
  isNativeShell: boolean;
  soundMuted: boolean;
  adsDisabled: boolean;
  canDisableAds: boolean;
};

function readNativeAdPreferences(): NativeAdPreferences {
  return {
    isNativeShell: localStorage.getItem("casparel_native_shell") === "true",
    soundMuted: localStorage.getItem("casparel_ad_sound_muted") === "true",
    adsDisabled: localStorage.getItem("casparel_ads_disabled") === "true",
    canDisableAds: localStorage.getItem("casparel_can_disable_ads") === "true",
  };
}

function sendNativeAdPreference(preference: {
  soundMuted?: boolean;
  adsDisabled?: boolean;
}) {
  const bridge = (
    window as Window & {
      ReactNativeWebView?: { postMessage: (message: string) => void };
    }
  ).ReactNativeWebView;
  bridge?.postMessage(
    JSON.stringify({ type: "ad-preferences", ...preference }),
  );
}

type NotificationKey = "enabled" | "messages" | "classes" | "activities" | "goals" | "schedule" | "account" | "announcements";
const DEFAULT_NOTIFICATIONS = {
  enabled: true, messages: true, classes: true, activities: true,
  goals: true, schedule: true, account: true, announcements: true,
};

export default function SettingsPage() {
  const { data: me } = useGetMe();
  const { language, setLanguage, copy } = useAuthLanguage();
  const preferences = useUserPreferences(Boolean(me));
  const updatePreferences = useUpdateUserPreferences();
  const [accountAction, setAccountAction] = useState<AccountAction | null>(
    null,
  );
  const [nativeAds, setNativeAds] = useState(readNativeAdPreferences);

  useEffect(() => {
    const sync = () => setNativeAds(readNativeAdPreferences());
    window.addEventListener("casparel-ad-preferences-change", sync);
    return () =>
      window.removeEventListener("casparel-ad-preferences-change", sync);
  }, []);

  // On the plain web there is no native bridge: eligibility comes from the
  // account's plan, and the saved values come from the account preferences.
  // Inside the native shell the injected localStorage values (kept in sync by
  // the Android AdsContext, which also persists them to the account) win, so
  // the two surfaces cannot disagree for longer than one bridge message.
  const plan = usePlan(Boolean(me));
  const accountAdPrefs = preferences.data?.adPreferences;
  const canDisableAds = nativeAds.isNativeShell
    ? nativeAds.canDisableAds
    : !plan.pending &&
      (plan.level === "pro" ||
        plan.tier === "institutional" ||
        plan.tier === "administrator");
  const soundMuted = nativeAds.isNativeShell
    ? nativeAds.soundMuted
    : (accountAdPrefs?.soundMuted ?? nativeAds.soundMuted);
  const adsDisabled = nativeAds.isNativeShell
    ? nativeAds.adsDisabled
    : (accountAdPrefs?.adsDisabled ?? nativeAds.adsDisabled);

  function persistAdPreferences(next: { adsDisabled: boolean; soundMuted: boolean }) {
    // Account storage is what makes the choice follow the person to other
    // devices; failures fall back to the local copy silently.
    updatePreferences.mutate({ adPreferences: next });
  }

  function changeAdSound(soundOn: boolean) {
    const nextMuted = !soundOn;
    localStorage.setItem("casparel_ad_sound_muted", String(nextMuted));
    setNativeAds((current) => ({ ...current, soundMuted: nextMuted }));
    sendNativeAdPreference({ soundMuted: nextMuted });
    if (!nativeAds.isNativeShell) {
      persistAdPreferences({ adsDisabled, soundMuted: nextMuted });
    }
  }

  function changeAdsDisabled(nextDisabled: boolean) {
    if (!canDisableAds) return;
    localStorage.setItem("casparel_ads_disabled", String(nextDisabled));
    setNativeAds((current) => ({ ...current, adsDisabled: nextDisabled }));
    sendNativeAdPreference({ adsDisabled: nextDisabled });
    if (!nativeAds.isNativeShell) {
      persistAdPreferences({ adsDisabled: nextDisabled, soundMuted });
    }
  }

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

  async function changeNotification(key: NotificationKey, checked: boolean) {
    const notificationPreferences = {
      ...DEFAULT_NOTIFICATIONS,
      ...preferences.data?.notificationPreferences,
      [key]: checked,
    };
    await updatePreferences.mutateAsync({ notificationPreferences });
    const bridge = (window as Window & { ReactNativeWebView?: { postMessage: (message: string) => void } }).ReactNativeWebView;
    bridge?.postMessage(JSON.stringify({ type: "notification-preferences", preferences: notificationPreferences }));
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
            <Volume2 className="mt-0.5 size-5 shrink-0 text-primary-text" />
            <div>
              <h2 className="font-semibold">Ad sound</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Play video ads with sound by default. Muting one ad mutes
                them all.
              </p>
            </div>
          </div>
          <Switch
            checked={!soundMuted}
            onCheckedChange={changeAdSound}
            aria-label="Play ad sound"
          />
        </section>

        <section className="flex items-center justify-between gap-4 border-b p-4 sm:p-5">
          <div className="flex min-w-0 gap-3">
            <Ban className="mt-0.5 size-5 shrink-0 text-primary-text" />
            <div>
              <h2 className="font-semibold">Disable ads</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {canDisableAds
                  ? "Hide sponsored sections everywhere you use Casparel. Saved on your account."
                  : "Available with Casparel Pro or Institutional."}
              </p>
            </div>
          </div>
          <Switch
            checked={adsDisabled}
            disabled={!canDisableAds}
            onCheckedChange={changeAdsDisabled}
            aria-label="Disable ads"
            data-testid="settings-disable-ads"
          />
        </section>

        {nativeAds.isNativeShell ? (
          <section className="border-b p-4 sm:p-5">
            <div className="mb-4 flex min-w-0 gap-3">
              <Bell className="mt-0.5 size-5 shrink-0 text-primary-text" />
              <div>
                <h2 className="font-semibold">Notifications</h2>
                <p className="mt-1 text-sm text-muted-foreground">Choose which Android notifications Casparel may send.</p>
              </div>
            </div>
            <div className="space-y-3 pl-8">
              {([
                ["enabled", "Allow notifications"],
                ["messages", "Messages"],
                ["classes", "Class invitations and updates"],
                ["activities", "Activities and deadlines"],
                ["goals", "Goals and study reminders"],
                ["schedule", "Schedule reminders"],
                ["account", "Account, subscription and payment updates"],
                ["announcements", "Casparel announcements"],
              ] as const).map(([key, label]) => {
                const values = { ...DEFAULT_NOTIFICATIONS, ...preferences.data?.notificationPreferences };
                return (
                  <div key={key} className="flex items-center justify-between gap-4">
                    <span className="text-sm">{label}</span>
                    <Switch
                      checked={values[key]}
                      disabled={preferences.isLoading || updatePreferences.isPending || (key !== "enabled" && !values.enabled)}
                      onCheckedChange={(checked) => void changeNotification(key, checked)}
                      aria-label={label}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

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
          <Switch
            checked={preferences.data?.allowMessageRequests ?? true}
            disabled={preferences.isLoading || updatePreferences.isPending}
            onCheckedChange={(checked) =>
              updatePreferences.mutate({ allowMessageRequests: checked })
            }
            aria-label="Allow message requests"
          />
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
