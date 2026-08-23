/**
 * @fileOverview Web UI role: provides the reusable Resource Review Queue component or bridge.
 * System connection: consumed by pages or shells and kept separate to share presentation, accessibility, and interaction behavior.
 */
import { useState } from "react";
import {
  useListAdminResourceReviewQueue,
  useUpdateAdminResourceVerification,
} from "@workspace/api-client-react";
import { Button } from "@workspace/edu-ds/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/edu-ds/components/ui/card";
import { Textarea } from "@workspace/edu-ds/components/ui/textarea";
import { toast } from "@workspace/edu-ds/hooks/use-toast";
import {
  Check,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { getApiError } from "../lib/api-error";
import { LoadFailure } from "./LoadFailure";

function daysWaiting(createdAt: string) {
  const days = Math.floor(
    (Date.now() - new Date(createdAt).getTime()) / 86_400_000,
  );
  return days <= 0 ? "today" : days === 1 ? "1 day" : `${days} days`;
}

export function ResourceReviewQueue() {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const queue = useListAdminResourceReviewQueue({
    status: "unverified",
    limit: 50,
    offset: 0,
  });
  const updateVerification = useUpdateAdminResourceVerification();
  const items = queue.data?.items ?? [];
  const pendingTotal = queue.data?.pendingTotal ?? 0;
  const loading = queue.isLoading && queue.data === undefined;
  const failed = queue.isError && queue.data === undefined;

  async function decide(
    id: number,
    status: "verified" | "rejected",
    reason?: string,
  ) {
    setBusyId(id);
    try {
      await updateVerification.mutateAsync({
        id,
        data: { status, ...(reason ? { note: reason } : {}) },
      });
      await queue.refetch();
      setRejectingId(null);
      setNote("");
      toast({
        title: status === "verified" ? "Resource approved" : "Resource rejected",
      });
    } catch (error) {
      toast({
        title: "Action failed",
        description: getApiError(error).error ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldCheck size={16} className="text-primary-text" />
          Resource review queue
          {pendingTotal > 0 ? (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
              {pendingTotal} pending
            </span>
          ) : null}
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void queue.refetch()}
          disabled={queue.isFetching}
          className="gap-2"
        >
          <RefreshCw size={14} className={queue.isFetching ? "animate-spin" : ""} />
          Refresh
        </Button>
      </CardHeader>

      <CardContent>
        {queue.isError && queue.data !== undefined ? (
          <LoadFailure
            variant="banner"
            title="Review queue could not be refreshed"
            description="Previously loaded submissions remain visible below."
            onRetry={() => void queue.refetch()}
            retrying={queue.isFetching}
          />
        ) : null}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : failed ? (
          <LoadFailure
            title="Review queue could not be loaded"
            description="The app has not confirmed that the moderation queue is empty."
            onRetry={() => void queue.refetch()}
            retrying={queue.isFetching}
            testId="resource-review-queue-load-error"
          />
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing waiting for review. New submissions from unverified accounts
            will appear here.
          </p>
        ) : (
          <ul className="divide-y">
            {items.map((item) => (
              <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 font-medium hover:underline"
                    >
                      <span className="truncate">{item.title}</span>
                      <ExternalLink size={13} className="shrink-0 opacity-60" />
                    </a>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.subject} · {item.gradeLevel} · {item.format} ·
                      waiting {daysWaiting(item.createdAt)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      by {item.submittedByName ?? "Unknown"}
                      {item.submittedByRole ? ` (${item.submittedByRole})` : ""}
                      {item.submitterVerified ? " · verified account" : ""}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      onClick={() => void decide(item.id, "verified")}
                      disabled={busyId === item.id}
                      className="gap-1.5"
                    >
                      <Check size={14} /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setRejectingId(rejectingId === item.id ? null : item.id)
                      }
                      disabled={busyId === item.id}
                      className="gap-1.5"
                    >
                      <X size={14} /> Reject
                    </Button>
                  </div>
                </div>

                {rejectingId === item.id ? (
                  <div className="mt-2 space-y-2">
                    <Textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Why is this being rejected? The submitter sees this."
                      rows={2}
                      maxLength={1000}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setRejectingId(null);
                          setNote("");
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={!note.trim() || busyId === item.id}
                        onClick={() =>
                          void decide(item.id, "rejected", note.trim())
                        }
                      >
                        Confirm rejection
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
