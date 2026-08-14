import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookCheck,
  BookOpen,
  GraduationCap,
  ListPlus,
  SearchCheck,
  WandSparkles,
  X,
} from "lucide-react";
import { useLocation } from "wouter";
import { Badge } from "@workspace/edu-ds/components/ui/badge";
import { Button } from "@workspace/edu-ds/components/ui/button";
import { Card, CardContent } from "@workspace/edu-ds/components/ui/card";
import { Progress } from "@workspace/edu-ds/components/ui/progress";

type WorkflowAction =
  | "review"
  | "save"
  | "create_activity"
  | "share_class"
  | "assign_class";

type ContinueWorkflow = {
  resourceId: number;
  title: string;
  subject: string;
  format: string;
  lastEventAt: string;
  nextAction: WorkflowAction;
  completedSteps: number;
  totalSteps: number;
  activity: { id: number; title: string } | null;
  classShare: { id: number; name: string | null } | null;
};

const actionDetails: Record<
  WorkflowAction,
  { label: string; description: string; icon: typeof BookOpen }
> = {
  review: {
    label: "Verify source",
    description: "Check credibility before building on this source.",
    icon: SearchCheck,
  },
  save: {
    label: "Save resource",
    description: "Organize the verified source in a focused list.",
    icon: ListPlus,
  },
  create_activity: {
    label: "Build activity",
    description: "Turn the source into reusable active practice.",
    icon: WandSparkles,
  },
  share_class: {
    label: "Share with class",
    description: "Put the activity in front of the right learners.",
    icon: GraduationCap,
  },
  assign_class: {
    label: "Create assignment",
    description: "Add instructions and a deadline for the class.",
    icon: BookCheck,
  },
};

const DISMISSED_KEY = "schoolar_dismissed_workflows";

function readDismissed(): number[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((value): value is number => typeof value === "number")
      : [];
  } catch {
    return [];
  }
}

function writeDismissed(ids: number[]) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids));
  } catch {
    // Storage can be unavailable in private modes; the in-memory removal still
    // hides the item for this session.
  }
}

function workflowHref(item: ContinueWorkflow) {
  if (item.nextAction === "create_activity") {
    return `/activities?fromResource=${item.resourceId}`;
  }
  if (item.nextAction === "share_class" && item.activity) {
    return `/activities?continueResource=${item.resourceId}&activity=${item.activity.id}`;
  }
  if (item.nextAction === "assign_class" && item.classShare) {
    const activity = item.activity ? `&activity=${item.activity.id}` : "";
    return `/classes/${item.classShare.id}?tab=assignments&resource=${item.resourceId}${activity}`;
  }
  return `/resources/${item.resourceId}`;
}

export function ContinueWorkflows() {
  const [, setLocation] = useLocation();
  const [items, setItems] = useState<ContinueWorkflow[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/workflow/continue", {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${localStorage.getItem("schoolar_token")}`,
      },
    })
      .then((response) => (response.ok ? response.json() : []))
      .then((rows) => {
        const dismissed = new Set(readDismissed());
        setItems(
          Array.isArray(rows)
            ? (rows as ContinueWorkflow[]).filter(
                (row) =>
                  // A row without a resourceId cannot be linked or dismissed,
                  // and every accessor below assumes it is there.
                  typeof row?.resourceId === "number" &&
                  !dismissed.has(row.resourceId),
              )
            : [],
        );
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setItems([]);
      });
    return () => controller.abort();
  }, []);

  function dismissWorkflow(resourceId: number) {
    setItems((current) =>
      current.filter((item) => item.resourceId !== resourceId),
    );
    writeDismissed(Array.from(new Set([...readDismissed(), resourceId])));
    // Best-effort server-side delete so it also clears on other devices; the
    // local removal above already hides it immediately either way.
    void fetch(`/api/workflow/continue/${resourceId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("schoolar_token")}`,
      },
    }).catch(() => undefined);
  }

  if (!items.length) return null;

  return (
    <Card className="overflow-hidden border-primary/25" data-testid="continue-workflows">
      <div className="h-1 bg-primary" />
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <BookOpen className="size-4 text-primary-text" /> Continue workflow
            </h2>
            <p className="text-xs text-muted-foreground">
              Resume unfinished learning work from any device.
            </p>
          </div>
          <Badge variant="secondary">{items.length} in progress</Badge>
        </div>
        <div className="divide-y">
          {items.slice(0, 4).map((item) => {
            const action = actionDetails[item.nextAction];
            const Icon = action.icon;
            const progress = Math.round(
              (item.completedSteps / Math.max(item.totalSteps, 1)) * 100,
            );
            return (
              <div
                key={item.resourceId}
                className="grid min-w-0 gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-center sm:px-5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{item.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.subject} · {item.format}
                    {item.classShare?.name ? ` · ${item.classShare.name}` : ""}
                  </p>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground sm:hidden">
                    <Icon className="size-3.5 text-primary-text" /> {action.description}
                  </p>
                </div>
                <div className="min-w-0">
                  <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                    <span>{item.completedSteps}/{item.totalSteps} steps</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-1.5" />
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    className="flex-1 sm:w-auto sm:flex-none"
                    onClick={() => setLocation(workflowHref(item))}
                  >
                    <Icon className="mr-1.5 size-3.5" /> {action.label}
                    <ArrowRight className="ml-1.5 size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => dismissWorkflow(item.resourceId)}
                    aria-label={`Remove ${item.title} from Continue workflow`}
                    title="Remove from Continue workflow"
                    data-testid="dismiss-workflow"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
