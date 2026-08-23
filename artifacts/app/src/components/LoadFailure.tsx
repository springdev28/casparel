/**
 * @fileOverview Web UI role: renders a reusable, persistent read-failure state with retry.
 * System connection: collection pages use it to keep transport failures distinct from confirmed empty data.
 */
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@workspace/edu-ds/components/ui/button";

/**
 * A read failure must stay visible until the request succeeds or the user
 * leaves. Toasts alone disappear and can leave a believable empty state behind.
 */
export function LoadFailure({
  title = "This data could not be loaded",
  description = "Nothing has been reported as empty. Retry the request.",
  onRetry,
  retrying = false,
  variant = "block",
  testId,
}: {
  title?: string;
  description?: string;
  onRetry: () => void;
  retrying?: boolean;
  variant?: "block" | "banner";
  testId?: string;
}) {
  if (variant === "banner") {
    return (
      <div
        className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3"
        data-testid={testId}
        role="alert"
      >
        <AlertCircle className="shrink-0 text-destructive-text" size={17} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Button disabled={retrying} onClick={onRetry} size="sm" variant="outline">
          <RefreshCw className={`mr-1.5 ${retrying ? "animate-spin" : ""}`} size={14} />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center justify-center rounded-md border border-destructive/30 bg-card px-6 py-12 text-center"
      data-testid={testId}
      role="alert"
    >
      <AlertCircle className="mb-4 text-destructive-text" size={36} />
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-lg text-sm text-muted-foreground">{description}</p>
      <Button className="mt-4" disabled={retrying} onClick={onRetry} variant="outline">
        <RefreshCw className={`mr-1.5 ${retrying ? "animate-spin" : ""}`} size={14} />
        Try again
      </Button>
    </div>
  );
}
