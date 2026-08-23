/**
 * @fileOverview Web screen role: renders the Admin Page route and coordinates its page-level data and interactions.
 * System connection: mounted from App.tsx; composes generated API hooks, local helpers, and reusable UI components.
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import { ResourceReviewQueue } from "../components/ResourceReviewQueue";
import { useGetAdminOverview, useGetMe } from "@workspace/api-client-react";
import { Button } from "@workspace/edu-ds/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/edu-ds/components/ui/card";
import { Input } from "@workspace/edu-ds/components/ui/input";
import { Textarea } from "@workspace/edu-ds/components/ui/textarea";
import { Badge } from "@workspace/edu-ds/components/ui/badge";
import { Skeleton } from "@workspace/edu-ds/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/edu-ds/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/edu-ds/components/ui/tabs";
import { toast } from "@workspace/edu-ds/hooks/use-toast";
import {
  Activity,
  Ban,
  BarChart3,
  BookOpen,
  CalendarDays,
  DollarSign,
  ExternalLink,
  FileText,
  GraduationCap,
  Layers3,
  Loader2,
  Pencil,
  RotateCcw,
  School,
  Search,
  SearchCheck,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  Users,
  Save,
  Trash2,
} from "lucide-react";
import { useIntlLocale } from "@/lib/date-locale";

type AdminUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  activeRole: string;
  teacherVerified: boolean;
  avatarUrl: string | null;
  bio: string | null;
  subjects: string[] | null;
  gradeOrDept: string | null;
  timezone: string | null;
  profileVisibility: string;
  libraryVisibility: string;
  showBio: boolean;
  showSubjects: boolean;
  showGradeOrDept: boolean;
  showWebsite: boolean;
  websiteUrl: string | null;
  bannedAt: string | null;
  bannedReason: string | null;
  createdAt: string;
};

type AdminWorkItem = {
  id: number;
  title?: string | null;
  name?: string | null;
  concept?: string | null;
  body?: string | null;
  description?: string | null;
  instructions?: string | null;
  reflection?: string | null;
  notes?: string | null;
  subject?: string | null;
  status?: string | null;
  moderationStatus?: string | null;
  format?: string | null;
  kind?: string | null;
  url?: string | null;
  classId?: number | null;
  cards?: Array<{ id: string; term: string; answer: string; imageAlt?: string | null; hasImage: boolean }>;
  nodes?: Array<{ kind: string; title: string; text?: string; url?: string }>;
  connectionCount?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  startsAt?: string | null;
  dueAt?: string | null;
  date?: string | null;
};

type AdminUserDetails = {
  user: AdminUser;
  affiliations: {
    ownedClasses: Array<{ id: number; name: string; subject: string; gradeLevel: string; createdAt: string }>;
    classMemberships: Array<{ classId: number; name: string; subject: string; gradeLevel: string; role: string; teacherNote: string | null; joinedAt: string }>;
    canvasCollaborations: Array<{ canvasId: number; title: string; role: string; addedAt: string }>;
  };
  work: Record<AdminWorkCategory, AdminWorkItem[]>;
};

type AdminWorkCategory =
  | "goals"
  | "resources"
  | "materials"
  | "posts"
  | "comments"
  | "activities"
  | "canvases"
  | "lists"
  | "assignments"
  | "schedule"
  | "studySessions"
  | "learningEvidence";

const workCategories: Array<{ key: AdminWorkCategory; label: string }> = [
  { key: "goals", label: "Goals" },
  { key: "resources", label: "Resources" },
  { key: "materials", label: "Forum materials" },
  { key: "posts", label: "Posts" },
  { key: "comments", label: "Comments" },
  { key: "activities", label: "Activities" },
  { key: "canvases", label: "Canvases" },
  { key: "lists", label: "Lists" },
  { key: "assignments", label: "Assignments" },
  { key: "schedule", label: "Schedule" },
  { key: "studySessions", label: "Study sessions" },
  { key: "learningEvidence", label: "Learning evidence" },
];

function workItemName(item: AdminWorkItem) {
  return item.title || item.name || item.concept || item.body || "Untitled item";
}

function workItemDescription(item: AdminWorkItem) {
  return item.description || item.instructions || item.reflection || item.notes || item.body || "";
}

function workItemDate(item: AdminWorkItem, intlLocale: string) {
  const value = item.updatedAt || item.createdAt || item.startsAt || item.dueAt || item.date;
  return value ? new Date(value).toLocaleString(intlLocale) : null;
}

const metrics = [
  { key: "users", label: "Total accounts", icon: Users },
  { key: "students", label: "Students", icon: Users },
  { key: "teachers", label: "Teachers", icon: Users },
  { key: "admins", label: "Administrators", icon: ShieldCheck },
  { key: "goals", label: "Learning goals", icon: Target },
  { key: "resources", label: "Resources", icon: BookOpen },
  { key: "cachedResearchReports", label: "Cached research reports", icon: SearchCheck },
] as const;

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
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || "Administrator action failed");
  }
  return response.status === 204 ? null : response.json();
}

export default function AdminPage() {
  const intlLocale = useIntlLocale();
  const { data, isLoading, isFetching, error, refetch } = useGetAdminOverview();
  const { data: me } = useGetMe();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
  const [busyUserId, setBusyUserId] = useState<number | null>(null);
  const [managedUser, setManagedUser] = useState<AdminUser | null>(null);
  const [managedDetails, setManagedDetails] = useState<AdminUserDetails | null>(null);
  const [managedDetailsLoading, setManagedDetailsLoading] = useState(false);
  const [userDraft, setUserDraft] = useState<AdminUser | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);

  async function loadUsers() {
    setUsersLoading(true);
    try {
      setUsers((await adminRequest("/admin/users")) as AdminUser[]);
    } catch (loadError) {
      toast({
        title: "Could not load accounts",
        description: loadError instanceof Error ? loadError.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setUsersLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user) =>
      [user.name, user.email, user.role, user.bio, user.gradeOrDept, ...(user.subjects ?? [])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [query, users]);

  async function manageAccount(user: AdminUser) {
    setManagedUser(user);
    setManagedDetails(null);
    setManagedDetailsLoading(true);
    try {
      const details = (await adminRequest("/admin/users/" + user.id + "/details")) as AdminUserDetails;
      setManagedDetails(details);
      setUserDraft(details.user);
    } catch (loadError) {
      toast({
        title: "Could not load account work",
        description: loadError instanceof Error ? loadError.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setManagedDetailsLoading(false);
    }
  }

  async function saveAccountProfile() {
    if (!userDraft || !managedDetails) return;
    setSavingAccount(true);
    try {
      const updated = await adminRequest("/admin/users/" + managedDetails.user.id, {
        method: "PATCH",
        body: JSON.stringify({
          name: userDraft.name,
          email: userDraft.email,
          role: userDraft.role,
          activeRole: userDraft.activeRole,
          bio: userDraft.bio,
          subjects: userDraft.subjects,
          gradeOrDept: userDraft.gradeOrDept,
          timezone: userDraft.timezone,
          websiteUrl: userDraft.websiteUrl,
          profileVisibility: userDraft.profileVisibility,
          libraryVisibility: userDraft.libraryVisibility,
          showBio: userDraft.showBio,
          showSubjects: userDraft.showSubjects,
          showGradeOrDept: userDraft.showGradeOrDept,
          showWebsite: userDraft.showWebsite,
        }),
      }) as AdminUser;
      applyUpdatedUser(updated);
      setUserDraft(updated);
      toast({ title: "Account details saved" });
    } catch (error) {
      toast({ title: "Could not save account", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setSavingAccount(false);
    }
  }

  async function editOwnedClass(item: AdminUserDetails["affiliations"]["ownedClasses"][number]) {
    if (!managedDetails) return;
    const name = window.prompt("Class name", item.name);
    if (name === null) return;
    const subject = window.prompt("Subject", item.subject);
    if (subject === null) return;
    const gradeLevel = window.prompt("Grade level", item.gradeLevel);
    if (gradeLevel === null) return;
    try {
      const updated = await adminRequest(`/admin/users/${managedDetails.user.id}/classes/${item.id}`, { method: "PATCH", body: JSON.stringify({ name, subject, gradeLevel }) }) as typeof item;
      setManagedDetails((current) => current ? { ...current, affiliations: { ...current.affiliations, ownedClasses: current.affiliations.ownedClasses.map((row) => row.id === item.id ? { ...row, ...updated } : row) } } : current);
      toast({ title: "Class information updated" });
    } catch (error) { toast({ title: "Could not update class", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }); }
  }

  async function editMembership(item: AdminUserDetails["affiliations"]["classMemberships"][number]) {
    if (!managedDetails) return;
    const role = window.prompt("Membership role (student or teacher)", item.role);
    if (role === null) return;
    const teacherNote = window.prompt("Private teacher/admin note", item.teacherNote ?? "");
    if (teacherNote === null) return;
    try {
      await adminRequest(`/admin/users/${managedDetails.user.id}/classes/${item.classId}/membership`, { method: "PATCH", body: JSON.stringify({ role, teacherNote: teacherNote.trim() || null }) });
      setManagedDetails((current) => current ? { ...current, affiliations: { ...current.affiliations, classMemberships: current.affiliations.classMemberships.map((row) => row.classId === item.classId ? { ...row, role, teacherNote: teacherNote.trim() || null } : row) } } : current);
      toast({ title: "Class membership updated" });
    } catch (error) { toast({ title: "Could not update membership", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }); }
  }

  async function editWorkItem(category: AdminWorkCategory, item: AdminWorkItem) {
    if (!managedDetails) return;
    const primary = window.prompt("Title or primary text", workItemName(item));
    if (primary === null || !primary.trim()) return;
    const secondary = window.prompt("Description or supporting text", workItemDescription(item));
    if (secondary === null) return;
    try {
      await adminRequest(`/admin/users/${managedDetails.user.id}/work/${category}/${item.id}`, { method: "PATCH", body: JSON.stringify({ primary, secondary: secondary.trim() || null }) });
      await manageAccount(managedDetails.user);
      toast({ title: "User work updated" });
    } catch (error) { toast({ title: "Could not update work", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }); }
  }

  async function deleteWorkItem(category: AdminWorkCategory, item: AdminWorkItem) {
    if (!managedDetails || !window.confirm(`Permanently delete “${workItemName(item)}”?`)) return;
    try {
      await adminRequest(`/admin/users/${managedDetails.user.id}/work/${category}/${item.id}`, { method: "DELETE" });
      setManagedDetails((current) => current ? { ...current, work: { ...current.work, [category]: current.work[category].filter((row) => row.id !== item.id) } } : current);
      toast({ title: "User work deleted" });
    } catch (error) { toast({ title: "Could not delete work", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }); }
  }

  function applyUpdatedUser(updated: AdminUser) {
    setUsers((current) => current.map((item) => item.id === updated.id ? updated : item));
    setManagedUser((current) => current?.id === updated.id ? updated : current);
    setManagedDetails((current) => current?.user.id === updated.id ? { ...current, user: updated } : current);
  }

  async function banUser(user: AdminUser) {
    const reason = window.prompt("Reason for banning this account:", user.bannedReason ?? "");
    if (reason === null) return;
    setBusyUserId(user.id);
    try {
      const updated = (await adminRequest("/admin/users/" + user.id + "/ban", {
        method: "PATCH",
        body: JSON.stringify({ reason }),
      })) as AdminUser;
      applyUpdatedUser(updated);
      toast({ title: user.name + " was banned" });
    } catch (actionError) {
      toast({
        title: "Could not ban account",
        description: actionError instanceof Error ? actionError.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusyUserId(null);
    }
  }

  async function unbanUser(user: AdminUser) {
    setBusyUserId(user.id);
    try {
      const updated = (await adminRequest("/admin/users/" + user.id + "/ban", {
        method: "DELETE",
      })) as AdminUser;
      applyUpdatedUser(updated);
      toast({ title: user.name + " was unbanned" });
    } catch (actionError) {
      toast({
        title: "Could not unban account",
        description: actionError instanceof Error ? actionError.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusyUserId(null);
    }
  }

  async function setTeacherVerification(user: AdminUser, verified: boolean) {
    setBusyUserId(user.id);
    try {
      const updated = (await adminRequest("/admin/users/" + user.id + "/teacher-verification", {
        method: "PATCH",
        body: JSON.stringify({ verified }),
      })) as AdminUser;
      applyUpdatedUser(updated);
      toast({ title: user.name + (verified ? " is now a verified teacher" : " is no longer verified") });
    } catch (actionError) {
      toast({
        title: "Could not update teacher verification",
        description: actionError instanceof Error ? actionError.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusyUserId(null);
    }
  }

  const workflowStages: Array<{
    label: string;
    count: number;
    conversion: number | null;
  }> = [
    { label: "Viewed", count: data?.workflow?.funnel.viewed ?? 0, conversion: null },
    { label: "Verified", count: data?.workflow?.funnel.reviewed ?? 0, conversion: data?.workflow?.funnel.viewToReviewRate ?? 0 },
    { label: "Saved", count: data?.workflow?.funnel.saved ?? 0, conversion: data?.workflow?.funnel.reviewToSaveRate ?? 0 },
    { label: "Activity", count: data?.workflow?.funnel.activityCreated ?? 0, conversion: data?.workflow?.funnel.saveToActivityRate ?? 0 },
    { label: "Class share", count: data?.workflow?.funnel.classShared ?? 0, conversion: data?.workflow?.funnel.activityToClassRate ?? 0 },
    { label: "Assignment", count: data?.workflow?.funnel.assignmentCreated ?? 0, conversion: data?.workflow?.funnel.classToAssignmentRate ?? 0 },
  ];
  const largestDropOff = workflowStages.slice(1).reduce((lowest, stage) =>
    (stage.conversion ?? 100) < (lowest.conversion ?? 100) ? stage : lowest,
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-primary-text" />
          <h1 className="text-2xl font-bold">Administrator panel</h1>
        </div>
        <p className="mt-2 text-muted-foreground">
          Full account moderation, platform activity, and unlimited administrator access.
        </p>
      </div>

      {error ? (
        <Card className="border-destructive">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6 text-destructive-text">
            <div>
              <p className="font-medium">Administrator data could not be loaded.</p>
              <p className="mt-1 text-sm">{error instanceof Error ? error.message : "The server did not return administrator data."}</p>
            </div>
            <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
              <RotateCcw className={"mr-2 size-4 " + (isFetching ? "animate-spin" : "")} />Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map(({ key, label, icon: Icon }) => (
          <Card key={key} className="ui-lift min-w-0 overflow-hidden">
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 p-4 pb-2 sm:p-6 sm:pb-2">
              <CardTitle className="min-w-0 text-xs font-medium leading-snug sm:text-sm">{label}</CardTitle>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary-text">
                <Icon className="size-4" />
              </span>
            </CardHeader>
            <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
              {isLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">{data?.[key] ?? 0}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-5 text-primary-text" /> Learning workflow
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Resource discovery to verified, reusable classroom learning.
              </p>
            </div>
            <Badge variant="secondary">
              {data?.workflow?.funnel.completedJourneys ?? 0} assigned journeys
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 overflow-hidden rounded-md border sm:grid-cols-3 xl:grid-cols-6">
            {workflowStages.map(({ label, count, conversion }, index) => (
              <div key={label} className="relative border-b border-r p-3 sm:p-4 xl:border-b-0 xl:last:border-r-0">
                <span className="absolute inset-x-0 top-0 h-0.5 bg-primary/60" />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
                  <span className="text-xs text-muted-foreground">{index + 1}/6</span>
                </div>
                <p className="mt-2 text-2xl font-bold">{count}</p>
                {typeof conversion === "number" ? (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                      <span>From prior step</span><span>{conversion.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${Math.min(100, conversion)}%` }} />
                    </div>
                  </div>
                ) : <p className="mt-3 text-xs text-muted-foreground">Journey starts</p>}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-l-amber-500 bg-amber-500/10 p-3">
            <div className="flex min-w-0 items-start gap-2">
              <TrendingDown className="mt-0.5 size-4 shrink-0 text-warning-text" />
              <div>
                <p className="text-sm font-medium">Largest workflow drop-off</p>
                <p className="text-xs text-muted-foreground">
                  {workflowStages[0].count > 0
                    ? `${largestDropOff.label}: ${(largestDropOff.conversion ?? 0).toFixed(1)}% continued from the previous step.`
                    : "Journey conversion will appear after the first resource workflow begins."}
                </p>
              </div>
            </div>
            {workflowStages[0].count > 0 ? (
              <Badge variant="outline">{(100 - (largestDropOff.conversion ?? 0)).toFixed(1)}% drop</Badge>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              ["Active users · 7d", data?.workflow?.engagement.activeUsers7d ?? 0],
              ["Active users · 30d", data?.workflow?.engagement.activeUsers30d ?? 0],
              ["Active classes · 7d", data?.workflow?.engagement.weeklyActiveClasses ?? 0],
              ["Minutes to first activity", data?.workflow?.engagement.avgMinutesToFirstActivity ?? 0],
              ["Invitation acceptance", `${(data?.workflow?.engagement.inviteAcceptanceRate ?? 0).toFixed(1)}%`],
              ["Assignment completion", `${(data?.workflow?.engagement.assignmentCompletionRate ?? 0).toFixed(1)}%`],
              ["Activity remix rate", `${(data?.workflow?.engagement.remixRate ?? 0).toFixed(1)}%`],
              ["Teacher approval rate", `${(data?.workflow?.engagement.teacherApprovalRate ?? 0).toFixed(1)}%`],
              ["Reports / 1,000 items", data?.workflow?.engagement.reportsPerThousand ?? 0],
              ["Stored user content", `${(data?.workflow?.engagement.estimatedStoredMb ?? 0).toFixed(2)} MB`],
            ].map(([label, value]) => (
              <div key={String(label)} className="ui-lift min-w-0 rounded-md border border-l-2 border-l-primary/40 bg-muted/20 p-3">
                <p className="text-xs leading-snug text-muted-foreground">{label}</p>
                <p className="mt-1 text-lg font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="render-later">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Account management</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Administrators can inspect all profile and privacy-controlled information, then ban or restore accounts.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={loadUsers} disabled={usersLoading}>
              <RotateCcw className={"mr-2 size-4 " + (usersLoading ? "animate-spin" : "")} /> Refresh
            </Button>
          </div>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search every account field..." aria-label="Search accounts" className="pl-9" />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {usersLoading ? <Skeleton className="h-52 w-full" /> : (
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2">Account</th>
                  <th className="pb-2">Role</th>
                  <th className="pb-2">Visibility</th>
                  <th className="pb-2">Joined</th>
                  <th className="pb-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <Fragment key={user.id}>
                    <tr className="border-b last:border-0">
                      <td className="py-3">
                        <button type="button" className="text-left" onClick={() => setExpandedUserId((id) => id === user.id ? null : user.id)}>
                          <p translate="no" className="font-medium hover:underline">{user.name}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </button>
                      </td>
                      <td className="py-3 capitalize">{user.role} <span className="text-xs text-muted-foreground">({user.activeRole})</span></td>
                      <td className="py-3 text-xs">{user.profileVisibility} profile / {user.libraryVisibility} library</td>
                      <td className="py-3">{new Date(user.createdAt).toLocaleDateString(intlLocale)}</td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Badge variant={user.bannedAt ? "destructive" : "secondary"}>{user.bannedAt ? "Banned" : "Active"}</Badge>
                          <Button size="sm" variant="outline" onClick={() => void manageAccount(user)}>
                            <Settings2 className="mr-1 size-3.5" /> Manage account
                          </Button>
                          {user.role === "teacher" && (
                            <Button size="sm" variant="outline" onClick={() => setTeacherVerification(user, !user.teacherVerified)} disabled={busyUserId === user.id}>
                              <ShieldCheck className="mr-1 size-3.5" /> {user.teacherVerified ? "Remove verification" : "Verify teacher"}
                            </Button>
                          )}
                          {user.id !== me?.id && (
                            user.bannedAt ? (
                              <Button size="sm" variant="outline" onClick={() => unbanUser(user)} disabled={busyUserId === user.id}>
                                <RotateCcw className="mr-1 size-3.5" /> Unban
                              </Button>
                            ) : (
                              <Button size="sm" variant="destructive" onClick={() => banUser(user)} disabled={busyUserId === user.id}>
                                <Ban className="mr-1 size-3.5" /> Ban
                              </Button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedUserId === user.id && (
                      <tr className="border-b bg-muted/30">
                        <td colSpan={5} className="p-4">
                          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <div><p className="text-xs font-medium text-muted-foreground">Bio</p><p>{user.bio || "Not set"}</p></div>
                            <div><p className="text-xs font-medium text-muted-foreground">Subjects</p><p>{user.subjects?.join(", ") || "Not set"}</p></div>
                            <div><p className="text-xs font-medium text-muted-foreground">Grade / department</p><p>{user.gradeOrDept || "Not set"}</p></div>
                            <div><p className="text-xs font-medium text-muted-foreground">Timezone</p><p>{user.timezone || "Not set"}</p></div>
                            <div><p className="text-xs font-medium text-muted-foreground">Website</p><p className="break-all">{user.websiteUrl || "Not set"}</p></div>
                            <div><p className="text-xs font-medium text-muted-foreground">Field visibility</p><p>Bio {String(user.showBio)}, subjects {String(user.showSubjects)}, grade {String(user.showGradeOrDept)}, website {String(user.showWebsite)}</p></div>
                            <div><p className="text-xs font-medium text-muted-foreground">Teacher verification</p><p>{user.role === "teacher" ? (user.teacherVerified ? "Verified" : "Not verified") : "Not applicable"}</p></div>
                            <div><p className="text-xs font-medium text-muted-foreground">Ban date</p><p>{user.bannedAt ? new Date(user.bannedAt).toLocaleString(intlLocale) : "Not banned"}</p></div>
                            <div><p className="text-xs font-medium text-muted-foreground">Ban reason</p><p>{user.bannedReason || "None"}</p></div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
          {!usersLoading && filteredUsers.length === 0 && <p className="py-8 text-center text-muted-foreground">No matching accounts.</p>}
        </CardContent>
      </Card>

      <ResourceReviewQueue />

      <Dialog
        open={managedUser !== null}
        onOpenChange={(open) => {
          if (!open) {
            setManagedUser(null);
            setManagedDetails(null);
            setUserDraft(null);
          }
        }}
      >
        <DialogContent className="max-h-[92dvh] max-w-6xl overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4 pr-12">
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span>{managedUser?.name ?? "Manage account"}</span>
              {managedUser ? <Badge variant={managedUser.bannedAt ? "destructive" : "secondary"}>{managedUser.bannedAt ? "Banned" : "Active"}</Badge> : null}
            </DialogTitle>
            <DialogDescription>{managedUser?.email} · Full administrator view</DialogDescription>
          </DialogHeader>

          {managedDetailsLoading ? (
            <div className="flex min-h-72 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-primary-text" />
            </div>
          ) : managedDetails ? (
            <Tabs defaultValue="profile" className="min-h-0 px-5 pb-5">
              <TabsList className="mt-4 grid h-auto w-full grid-cols-2 sm:grid-cols-4">
                <TabsTrigger value="profile"><FileText className="mr-2 size-4" />Profile</TabsTrigger>
                <TabsTrigger value="affiliations"><School className="mr-2 size-4" />Affiliations</TabsTrigger>
                <TabsTrigger value="work"><Layers3 className="mr-2 size-4" />Work</TabsTrigger>
                <TabsTrigger value="account"><Settings2 className="mr-2 size-4" />Account</TabsTrigger>
              </TabsList>

              <TabsContent value="profile" className="max-h-[65dvh] overflow-y-auto pt-4">
                {userDraft ? <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="space-y-1 text-sm"><span className="font-medium">Name</span><Input value={userDraft.name} onChange={(e) => setUserDraft({ ...userDraft, name: e.target.value })} /></label>
                    <label className="space-y-1 text-sm"><span className="font-medium">Email</span><Input type="email" value={userDraft.email} onChange={(e) => setUserDraft({ ...userDraft, email: e.target.value })} /></label>
                    <label className="space-y-1 text-sm"><span className="font-medium">Role</span><select className="h-10 w-full rounded-md border bg-background px-3" value={userDraft.role} onChange={(e) => setUserDraft({ ...userDraft, role: e.target.value, activeRole: e.target.value })}><option value="student">Student</option><option value="teacher">Teacher</option><option value="admin">Administrator</option></select></label>
                    <label className="space-y-1 text-sm"><span className="font-medium">Active role</span><select className="h-10 w-full rounded-md border bg-background px-3" value={userDraft.activeRole} onChange={(e) => setUserDraft({ ...userDraft, activeRole: e.target.value })}><option value="student">Student</option><option value="teacher">Teacher</option>{userDraft.role === "admin" ? <option value="admin">Administrator</option> : null}</select></label>
                    <label className="space-y-1 text-sm"><span className="font-medium">Grade / department</span><Input value={userDraft.gradeOrDept ?? ""} onChange={(e) => setUserDraft({ ...userDraft, gradeOrDept: e.target.value || null })} /></label>
                    <label className="space-y-1 text-sm"><span className="font-medium">Timezone</span><Input value={userDraft.timezone ?? ""} onChange={(e) => setUserDraft({ ...userDraft, timezone: e.target.value || null })} /></label>
                    <label className="space-y-1 text-sm sm:col-span-2"><span className="font-medium">Subjects</span><Input value={userDraft.subjects?.join(", ") ?? ""} onChange={(e) => setUserDraft({ ...userDraft, subjects: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })} /></label>
                    <label className="space-y-1 text-sm"><span className="font-medium">Website</span><Input value={userDraft.websiteUrl ?? ""} onChange={(e) => setUserDraft({ ...userDraft, websiteUrl: e.target.value || null })} /></label>
                    <label className="space-y-1 text-sm sm:col-span-2 lg:col-span-3"><span className="font-medium">Bio</span><Textarea rows={4} value={userDraft.bio ?? ""} onChange={(e) => setUserDraft({ ...userDraft, bio: e.target.value || null })} /></label>
                    <label className="space-y-1 text-sm"><span className="font-medium">Profile visibility</span><select className="h-10 w-full rounded-md border bg-background px-3" value={userDraft.profileVisibility} onChange={(e) => setUserDraft({ ...userDraft, profileVisibility: e.target.value })}>{["everyone", "classmates", "private"].map((v) => <option key={v}>{v}</option>)}</select></label>
                    <label className="space-y-1 text-sm"><span className="font-medium">Library visibility</span><select className="h-10 w-full rounded-md border bg-background px-3" value={userDraft.libraryVisibility} onChange={(e) => setUserDraft({ ...userDraft, libraryVisibility: e.target.value })}>{["everyone", "classmates", "private"].map((v) => <option key={v}>{v}</option>)}</select></label>
                  </div>
                  <div className="flex flex-wrap gap-4 border p-3" style={{ borderRadius: 8 }}>{[["Bio", "showBio"], ["Subjects", "showSubjects"], ["Grade", "showGradeOrDept"], ["Website", "showWebsite"]].map(([label, key]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(userDraft[key as keyof AdminUser])} onChange={(e) => setUserDraft({ ...userDraft, [key]: e.target.checked })} />Show {label}</label>)}</div>
                  <div className="flex justify-end"><Button onClick={() => void saveAccountProfile()} disabled={savingAccount}>{savingAccount ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}Save account changes</Button></div>
                </div> : null}
              </TabsContent>

              <TabsContent value="affiliations" className="max-h-[65dvh] space-y-5 overflow-y-auto pt-4">
                <section>
                  <div className="mb-2 flex items-center gap-2"><GraduationCap className="size-4 text-primary-text" /><h3 className="font-semibold">Classes owned ({managedDetails.affiliations.ownedClasses.length})</h3></div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {managedDetails.affiliations.ownedClasses.map((item) => (
                      <div key={item.id} className="border p-3" style={{ borderRadius: 8 }}>
                        <div className="flex items-start justify-between gap-2"><p className="font-medium">{item.name}</p><Button size="icon" variant="ghost" onClick={() => void editOwnedClass(item)} title="Edit class"><Pencil className="size-4" /></Button></div>
                        <p className="text-sm text-muted-foreground">{item.subject} · {item.gradeLevel}</p>
                      </div>
                    ))}
                    {!managedDetails.affiliations.ownedClasses.length ? <p className="text-sm text-muted-foreground">No owned classes.</p> : null}
                  </div>
                </section>
                <section>
                  <div className="mb-2 flex items-center gap-2"><Users className="size-4 text-primary-text" /><h3 className="font-semibold">Class memberships ({managedDetails.affiliations.classMemberships.length})</h3></div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {managedDetails.affiliations.classMemberships.map((item) => (
                      <div key={item.classId} className="border p-3" style={{ borderRadius: 8 }}>
                        <div className="flex items-start justify-between gap-2"><p className="font-medium">{item.name}</p><div className="flex items-center gap-1"><Badge variant="outline" className="capitalize">{item.role}</Badge><Button size="icon" variant="ghost" onClick={() => void editMembership(item)} title="Edit membership and private note"><Pencil className="size-4" /></Button></div></div>
                        <p className="text-sm text-muted-foreground">{item.subject} · {item.gradeLevel}</p>
                        <p className="mt-2 text-xs"><span className="font-medium text-muted-foreground">Private member note:</span> {item.teacherNote || "None"}</p>
                      </div>
                    ))}
                    {!managedDetails.affiliations.classMemberships.length ? <p className="text-sm text-muted-foreground">No class memberships.</p> : null}
                  </div>
                </section>
                <section>
                  <div className="mb-2 flex items-center gap-2"><Layers3 className="size-4 text-primary-text" /><h3 className="font-semibold">Canvas collaborations ({managedDetails.affiliations.canvasCollaborations.length})</h3></div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {managedDetails.affiliations.canvasCollaborations.map((item) => (
                      <div key={item.canvasId} className="flex items-center justify-between gap-3 border p-3" style={{ borderRadius: 8 }}>
                        <p className="min-w-0 truncate font-medium">{item.title}</p><Badge variant="outline" className="capitalize">{item.role}</Badge>
                      </div>
                    ))}
                    {!managedDetails.affiliations.canvasCollaborations.length ? <p className="text-sm text-muted-foreground">No canvas collaborations.</p> : null}
                  </div>
                </section>
              </TabsContent>

              <TabsContent value="work" className="max-h-[65dvh] space-y-5 overflow-y-auto pt-4">
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {workCategories.map(({ key, label }) => (
                    <div key={key} className="border p-3 text-center" style={{ borderRadius: 8 }}>
                      <p className="text-xl font-bold">{managedDetails.work[key].length}</p><p className="text-xs text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>
                {workCategories.map(({ key, label }) => {
                  const items = managedDetails.work[key];
                  if (!items.length) return null;
                  return (
                    <section key={key}>
                      <div className="mb-2 flex items-center gap-2"><BookOpen className="size-4 text-primary-text" /><h3 className="font-semibold">{label} ({items.length})</h3></div>
                      <div className="space-y-2">
                        {items.map((item) => {
                          const description = workItemDescription(item);
                          const date = workItemDate(item, intlLocale);
                          return (
                            <div key={item.id} className="border p-3" style={{ borderRadius: 8 }}>
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="break-words font-medium">{workItemName(item)}</p>
                                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                                    {item.subject ? <span>{item.subject}</span> : null}
                                    {item.status || item.moderationStatus ? <Badge variant="outline" className="capitalize">{item.status || item.moderationStatus}</Badge> : null}
                                    {item.format || item.kind ? <Badge variant="outline" className="capitalize">{item.format || item.kind}</Badge> : null}
                                    {item.classId ? <span>Class #{item.classId}</span> : null}
                                    {item.cards ? <span>{item.cards.length} cards</span> : null}
                                    {item.nodes ? <span>{item.nodes.length} nodes · {item.connectionCount ?? 0} connections</span> : null}
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">{date ? <span className="text-xs text-muted-foreground">{date}</span> : null}<Button size="icon" variant="ghost" title="Edit user work" onClick={() => void editWorkItem(key, item)}><Pencil className="size-4" /></Button><Button size="icon" variant="ghost" title="Delete user work" onClick={() => void deleteWorkItem(key, item)}><Trash2 className="size-4 text-destructive-text" /></Button></div>
                              </div>
                              {description && description !== workItemName(item) ? <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{description}</p> : null}
                              {item.cards?.length ? <div className="mt-2 space-y-1 border-t pt-2 text-xs">{item.cards.map((card) => <p key={card.id}><strong>{card.term}</strong>: {card.answer}{card.hasImage ? " · image attached" : ""}</p>)}</div> : null}
                              {item.nodes?.length ? <div className="mt-2 space-y-1 border-t pt-2 text-xs">{item.nodes.map((node, index) => <p key={`${node.kind}-${index}`}><strong>{node.title}</strong>{node.text ? `: ${node.text}` : ""}</p>)}</div> : null}
                              {item.url ? <a className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary-text underline" href={item.url} target="_blank" rel="noreferrer">Open source <ExternalLink className="size-3" /></a> : null}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
                {!workCategories.some(({ key }) => managedDetails.work[key].length) ? <p className="py-10 text-center text-sm text-muted-foreground">This account has not created any work yet.</p> : null}
              </TabsContent>

              <TabsContent value="account" className="max-h-[65dvh] space-y-4 overflow-y-auto pt-4">
                <section className="border p-4" style={{ borderRadius: 8 }}>
                  <h3 className="font-semibold">Account status</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{managedDetails.user.bannedAt ? `Banned ${new Date(managedDetails.user.bannedAt).toLocaleString(intlLocale)}. ${managedDetails.user.bannedReason || "No reason recorded."}` : "This account is active."}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {managedDetails.user.id !== me?.id ? (
                      managedDetails.user.bannedAt ? (
                        <Button variant="outline" onClick={() => void unbanUser(managedDetails.user)} disabled={busyUserId === managedDetails.user.id}><RotateCcw className="mr-2 size-4" />Unban account</Button>
                      ) : (
                        <Button variant="destructive" onClick={() => void banUser(managedDetails.user)} disabled={busyUserId === managedDetails.user.id}><Ban className="mr-2 size-4" />Ban account</Button>
                      )
                    ) : <p className="text-sm text-muted-foreground">You cannot ban your own administrator account.</p>}
                  </div>
                </section>
                {managedDetails.user.role === "teacher" ? (
                  <section className="border p-4" style={{ borderRadius: 8 }}>
                    <h3 className="font-semibold">Teacher verification</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Current status: {managedDetails.user.teacherVerified ? "Verified" : "Not verified"}</p>
                    <Button className="mt-4" variant="outline" onClick={() => void setTeacherVerification(managedDetails.user, !managedDetails.user.teacherVerified)} disabled={busyUserId === managedDetails.user.id}>
                      <ShieldCheck className="mr-2 size-4" />{managedDetails.user.teacherVerified ? "Remove verification" : "Verify teacher"}
                    </Button>
                  </section>
                ) : null}
                <section className="border p-4" style={{ borderRadius: 8 }}>
                  <div className="flex items-center gap-2"><CalendarDays className="size-4 text-primary-text" /><h3 className="font-semibold">Account record</h3></div>
                  <p className="mt-2 text-sm">User ID: {managedDetails.user.id}</p>
                  <p className="text-sm">Created: {new Date(managedDetails.user.createdAt).toLocaleString(intlLocale)}</p>
                </section>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="min-h-72 p-6 text-center text-sm text-muted-foreground">Account details could not be loaded.</div>
          )}
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div><CardTitle>Current plan</CardTitle><p className="mt-1 text-sm text-muted-foreground">Access and account limits</p></div>
            <Sparkles className="size-5 text-primary-text" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                {/* A plan name -- Free, Student Pro -- which this product does not
                    translate in any language. 

                    `plan.status` under it is a database enum whose only value
                    is "active", and it was printed straight out with a
                    `capitalize` on top -- so the card read "Active", which is
                    a column name wearing a capital letter rather than anything
                    written for a reader. A sentence instead, which also gives
                    the translation bridge something to carry. */}
                <div><p translate="no" className="text-xl font-semibold">{data?.plan.name ?? "Administrator"}</p><p className={data?.plan.status === "active" ? "text-sm text-success-text" : "text-sm text-muted-foreground"}>{data?.plan.status === "active" ? "Active on this account" : "Not currently active"}</p></div>
                <Badge>Unlimited</Badge>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                {["API requests", "AI searches", "Deep research"].map((label) => <div key={label} className="rounded-md bg-muted p-3"><p className="text-muted-foreground">{label}</p><p className="mt-1 font-semibold">Unlimited</p></div>)}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div><CardTitle>Usage today</CardTitle><p className="mt-1 text-sm text-muted-foreground">Platform-wide AI activity</p></div>
            <Activity className="size-5 text-primary-text" />
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <div className="rounded-md border p-4"><p className="text-sm text-muted-foreground">AI searches</p><p className="mt-2 text-3xl font-bold">{data?.usage.aiSearchesToday ?? 0}</p></div>
            <div className="rounded-md border p-4"><p className="text-sm text-muted-foreground">Deep research</p><p className="mt-2 text-3xl font-bold">{data?.usage.deepResearchToday ?? 0}</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle>Total AI requests</CardTitle><BarChart3 className="size-5 text-primary-text" /></CardHeader><CardContent><p className="text-3xl font-bold">{data?.usage.totalAiRequests ?? 0}</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle>Estimated AI cost</CardTitle><DollarSign className="size-5 text-primary-text" /></CardHeader><CardContent><p className="text-3xl font-bold">${(data?.usage.estimatedCostUsd ?? 0).toFixed(2)}</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Last 30 days</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">{data ? Object.entries(data.usage.byFeature).map(([feature, usage]) => <div key={feature} className="flex justify-between"><span className="capitalize">{feature.replaceAll("-", " ")}</span><span className="font-semibold">{usage.month}</span></div>) : <Skeleton className="h-20 w-full" />}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>AI usage by user</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="pb-2">User</th><th className="pb-2 text-right">Search</th><th className="pb-2 text-right">Quick</th><th className="pb-2 text-right">Deep</th><th className="pb-2 text-right">Metadata</th><th className="pb-2 text-right">Total</th><th className="pb-2 text-right">Est. cost</th></tr></thead>
            <tbody>{data?.usage.byUser.map((user) => <tr key={user.userId} className="border-b last:border-0"><td className="py-3"><p className="font-medium">{user.name}</p><p className="text-xs text-muted-foreground">{user.email}</p></td><td className="py-3 text-right">{user.searches}</td><td className="py-3 text-right">{user.quickReviews}</td><td className="py-3 text-right">{user.deepResearch}</td><td className="py-3 text-right">{user.metadata}</td><td className="py-3 text-right font-semibold">{user.total}</td><td className="py-3 text-right">${user.estimatedCostUsd.toFixed(2)}</td></tr>)}</tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
