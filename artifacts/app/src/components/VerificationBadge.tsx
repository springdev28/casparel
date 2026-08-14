import { ShieldAlert, ShieldX } from "lucide-react";

type Status = "unverified" | "verified" | "rejected" | undefined | null;

/**
 * Trust label for a user-submitted resource.
 *
 * Verified resources render nothing on purpose, once most of the library is
 * verified, a badge on every card is noise. Absence is the signal; only the
 * exceptions are called out.
 */
export function VerificationBadge({
  status,
  note,
  className = "",
}: {
  status: Status;
  /** Reviewer's reason. Only pass this on surfaces the owner/admin sees. */
  note?: string | null;
  className?: string;
}) {
  if (status !== "unverified" && status !== "rejected") return null;

  const pending = status === "unverified";
  const Icon = pending ? ShieldAlert : ShieldX;

  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold " +
        (pending
          ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          : "border-destructive/40 bg-destructive/10 text-destructive") +
        (className ? " " + className : "")
      }
      title={note ?? (pending ? "Waiting for a reviewer to check this source" : undefined)}
      data-testid="verification-badge"
    >
      <Icon className="size-3" />
      {pending ? "Pending review" : "Not approved"}
    </span>
  );
}
