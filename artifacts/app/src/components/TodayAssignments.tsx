/**
 * @fileOverview Web UI role: provides the reusable Today Assignments component or bridge.
 * System connection: consumed by pages or shells and kept separate to share presentation, accessibility, and interaction behavior.
 */
import { useEffect, useState } from "react";
import { useIntlLocale } from "@/lib/date-locale";
import { Bell, BookOpen, Check, Clock3 } from "lucide-react";
import { useLocation } from "wouter";
import { Badge } from "@workspace/edu-ds/components/ui/badge";
import { Button } from "@workspace/edu-ds/components/ui/button";
import { Card, CardContent } from "@workspace/edu-ds/components/ui/card";

type TodayAssignment = {
  id: number;
  classId: number;
  className: string;
  title: string;
  instructions: string | null;
  resourceId: number | null;
  activityId: number | null;
  dueAt: string | null;
  completed: boolean;
};

export function TodayAssignments() {
  const intlLocale = useIntlLocale();
  const [, setLocation] = useLocation();
  const [items, setItems] = useState<TodayAssignment[]>([]);
  const [alertsEnabled, setAlertsEnabled] = useState(
    () =>
      typeof Notification !== "undefined" &&
      Notification.permission === "granted",
  );
  useEffect(() => {
    fetch("/api/assignments/today", {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("schoolar_token")}`,
      },
    })
      .then((response) => (response.ok ? response.json() : []))
      .then((rows) => setItems(rows as TodayAssignment[]))
      .catch(() => setItems([]));
  }, []);
  const pending = items.filter((item) => !item.completed).slice(0, 5);
  if (!pending.length) return null;
  const dueSoon = pending.filter(
    (item) =>
      item.dueAt &&
      new Date(item.dueAt).getTime() - Date.now() < 48 * 60 * 60 * 1000,
  ).length;
  async function enableAlerts() {
    if (typeof Notification === "undefined") return;
    const permission = await Notification.requestPermission();
    setAlertsEnabled(permission === "granted");
    if (permission === "granted" && dueSoon)
      new Notification("Casparel assignments", {
        body: `${dueSoon} assignment${dueSoon === 1 ? " is" : "s are"} due within 48 hours.`,
      });
  }
  return (
    <Card className="border-primary/20">
      <CardContent className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <Clock3 size={17} /> Today
            </h2>
            <p className="text-xs text-muted-foreground">
              Your next class tasks, ordered by deadline.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {dueSoon > 0 && (
              <Badge variant="destructive">
                <Bell size={12} className="mr-1" /> {dueSoon} due soon
              </Badge>
            )}
            {!alertsEnabled &&
              typeof Notification !== "undefined" &&
              Notification.permission !== "denied" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void enableAlerts()}
                >
                  <Bell size={13} className="mr-1.5" /> Enable alerts
                </Button>
              )}
          </div>
        </div>
        <div className="divide-y">
          {pending.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center gap-3 py-3"
            >
              <div className="flex size-7 items-center justify-center rounded-full border">
                <Check size={13} />
              </div>
              <div className="min-w-40 flex-1">
                {/* An assignment title, written by a teacher. */}
                <p translate="no" className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {item.className}
                  {item.dueAt
                    ? ` · Due ${new Date(item.dueAt).toLocaleString(intlLocale)}`
                    : ""}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  item.activityId
                    ? setLocation(`/activities?activity=${item.activityId}`)
                    : item.resourceId
                      ? setLocation(`/resources/${item.resourceId}`)
                      : setLocation(`/classes/${item.classId}`)
                }
              >
                <BookOpen size={13} className="mr-1.5" /> Open
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
