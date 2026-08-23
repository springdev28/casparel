/**
 * @fileOverview Web UI role: provides the reusable Load Failure component or bridge.
 * System connection: consumed by pages or shells and kept separate to share presentation, accessibility, and interaction behavior.
 */
import { AlertCircle, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@workspace/edu-ds/components/ui/button";

/**
 * "This did not load", said plainly, instead of "you have nothing".
 *
 * With the server unreachable the schedule showed "No plans" against all
 * seven days, classes showed "You haven't joined any classes yet", and the
 * dashboard reported no goal and no evidence. Every one of those is a claim
 * about the person's own work, and every one was false: the app had not
 * managed to ask. The schedule is the worst of them, because somebody acts on
 * it -- they re-add a block they already have, or walk away thinking the
 * afternoon is free.
 *
 * The profile page already did this correctly, alone. The wording matches the
 * phone app's ErrorState so the two do not describe the same failure
 * differently, and each sentence is whole and uninterpolated so
 * UiTranslationBridge can match it -- the HTTP status is deliberately not in
 * the prose, which would make the sentence untranslatable in every language.
 */
export function describeLoadFailure(error: unknown): {
  title: string;
  description: string;
  Icon: typeof WifiOff;
} {
  const status = (error as { status?: unknown } | null)?.status;

  // No status at all means the request never got an answer: no signal, a
  // captive portal, a dropped connection. Everything else here is a reply.
  if (typeof status !== "number") {
    return {
      title: "You're offline",
      description:
        "We couldn't reach the server. Check your connection and try again.",
      Icon: WifiOff,
    };
  }
  if (status === 401 || status === 403) {
    return {
      title: "You don't have access to this",
      description: "Your session may have expired. Sign in again, then retry.",
      Icon: AlertCircle,
    };
  }
  return {
    title: "Couldn't load this",
    description: "Something went wrong at our end. Try again in a moment.",
    Icon: AlertCircle,
  };
}

export function LoadFailure({
  error,
  onRetry,
  retrying = false,
  className = "",
}: {
  error: unknown;
  onRetry: () => void;
  retrying?: boolean;
  className?: string;
}) {
  const { title, description, Icon } = describeLoadFailure(error);
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center ${className}`}
      data-testid="load-failure"
    >
      <Icon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
        <RefreshCw className={`mr-2 h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />
        Try again
      </Button>
    </div>
  );
}
