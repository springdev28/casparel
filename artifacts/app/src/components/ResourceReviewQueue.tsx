import { useCallback, useEffect, useState } from "react";
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
import { formatName } from "@/lib/resource-format";

interface QueueItem {
  id: number;
  title: string;
  url: string;
  description: string | null;
  format: string;
  subject: string;
  gradeLevel: string;
  createdAt: string;
  verificationStatus: "unverified" | "verified" | "rejected";
  submittedByName: string | null;
  submittedByEmail: string | null;
  submittedByRole: string | null;
  submitterVerified: boolean | null;
}

function apiUrl(path: string) {
  return import.meta.env.BASE_URL.replace(/\/$/, "") + "/api" + path;
}

async function adminRequest(path: string, init?: RequestInit) {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      Authorization: "Bearer " + localStorage.getItem("schoolar_token"),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error || "Administrator action failed");
  }
  return response.status === 204 ? null : response.json();
}

function daysWaiting(createdAt: string) {
  const days = Math.floor(
    (Date.now() - new Date(createdAt).getTime()) / 86_400_000,
  );
  return days <= 0 ? "today" : days === 1 ? "1 day" : `${days} days`;
}

export function ResourceReviewQueue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await adminRequest(
        "/admin/resources/review-queue?status=unverified&limit=50",
      )) as { items: QueueItem[]; pendingTotal: number };
      setItems(data.items ?? []);
      setPendingTotal(data.pendingTotal ?? 0);
    } catch (error) {
      toast({
        title: "Could not load the review queue",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(
    id: number,
    status: "verified" | "rejected",
    reason?: string,
  ) {
    setBusyId(id);
    try {
      await adminRequest(`/admin/resources/${id}/verification`, {
        method: "PATCH",
        body: JSON.stringify({ status, ...(reason ? { note: reason } : {}) }),
      });
      setItems((current) => current.filter((item) => item.id !== id));
      setPendingTotal((current) => Math.max(0, current - 1));
      setRejectingId(null);
      setNote("");
      toast({
        title: status === "verified" ? "Resource approved" : "Resource rejected",
      });
    } catch (error) {
      toast({
        title: "Action failed",
        description: error instanceof Error ? error.message : undefined,
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
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-warning-text">
              {pendingTotal} pending
            </span>
          ) : null}
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </CardHeader>

      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
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
                      {item.subject} · {item.gradeLevel} · {formatName(item.format)} ·
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
