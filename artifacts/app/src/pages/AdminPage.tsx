/**
 * @fileOverview Web screen role: renders the Admin Page route and coordinates its page-level data and interactions.
 * System connection: mounted from App.tsx; composes generated API hooks, local helpers, and reusable UI components.
 */
import { Fragment, useDeferredValue, useEffect, useState } from "react";
import { ResourceReviewQueue } from "../components/ResourceReviewQueue";
import {
  useBanAdminUser,
  useGetAdminOverview,
  useGetMe,
  useListAdminUsers,
  useOverrideAdminUserPlan,
  useUnbanAdminUser,
  useUpdateAdminPublisherVerification,
  useUpdateAdminUser,
  type AdminUser as AdminAccount,
} from "@workspace/api-client-react";
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
import { getApiError } from "../lib/api-error";
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

type AdminUser = AdminAccount;

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

function workItemDate(item: AdminWorkItem) {
  const value = item.updatedAt || item.createdAt || item.startsAt || item.dueAt || item.date;
  return value ? new Date(value).toLocaleString() : null;
}

function toLocalDateTimeInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

const metrics = [
  { key: "users", label: "Total accounts", icon: Users },
  { key: "learnerAccounts", label: "Accounts with learner activity", icon: Target },
  { key: "educatorAccounts", label: "Accounts with educator capability", icon: School },
  { key: "accountsBothLearnAndTeach", label: "Accounts that learn and teach", icon: Layers3 },
  { key: "activeClassOwners30d", label: "Active class owners · 30d", icon: Activity },
  { key: "classLearners", label: "Learners enrolled in classes", icon: GraduationCap },
  { key: "admins", label: "Administrators", icon: ShieldCheck },
  { key: "goals", label: "Learning goals", icon: Target },
  { key: "resources", label: "Resources", icon: BookOpen },
  { key: "cachedResearchReports", label: "Cached research reports", icon: SearchCheck },
] as const;

function apiUrl(path: string) {
  return import.meta.env.BASE_URL.replace(/\/$/, "") + "/api" + path;
}

function accountCapabilities(user: AdminUser) {
  return [
    "Learner",
    ...(user.educatorEnabled || user.role === "admin" ? ["Educator"] : []),
    ...(user.role === "admin" ? ["Administrator"] : []),
  ];
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

function adminActionError(error: unknown) {
  return getApiError(error).error ??
    (error instanceof Error ? error.message : "Please try again.");
}

export default function AdminPage() {
  const { data, isLoading, isFetching, error, refetch } = useGetAdminOverview();
  const { data: me } = useGetMe();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [roleFilter, setRoleFilter] = useState<"" | AdminUser["role"]>("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "banned">("");
  const [userOffset, setUserOffset] = useState(0);
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
  const [busyUserId, setBusyUserId] = useState<number | null>(null);
  const [managedUser, setManagedUser] = useState<AdminUser | null>(null);
  const [managedDetails, setManagedDetails] = useState<AdminUserDetails | null>(null);
  const [managedDetailsLoading, setManagedDetailsLoading] = useState(false);
  const [userDraft, setUserDraft] = useState<AdminUser | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);
  const [planReason, setPlanReason] = useState("");
  const [banTarget, setBanTarget] = useState<AdminUser | null>(null);
  const [banReason, setBanReason] = useState("");
  const [deleteWorkTarget, setDeleteWorkTarget] = useState<{
    category: AdminWorkCategory;
    item: AdminWorkItem;
  } | null>(null);
  const [deletingWork, setDeletingWork] = useState(false);

  const userPage = useListAdminUsers({
    q: deferredQuery.trim() || undefined,
    role: roleFilter || undefined,
    status: statusFilter || undefined,
    limit: 25,
    offset: userOffset,
  });
  const updateUser = useUpdateAdminUser();
  const overridePlan = useOverrideAdminUserPlan();
  const banAccount = useBanAdminUser();
  const unbanAccount = useUnbanAdminUser();
  const updatePublisherVerification = useUpdateAdminPublisherVerification();
  const usersLoading = userPage.isLoading || userPage.isFetching;
  const filteredUsers = users;

  async function loadUsers() {
    await userPage.refetch();
  }

  useEffect(() => {
    if (userPage.data) setUsers(userPage.data.items);
  }, [userPage.data]);

  useEffect(() => {
    if (!userPage.error) return;
    toast({
      title: "Could not load accounts",
      description: adminActionError(userPage.error),
      variant: "destructive",
    });
  }, [userPage.error]);

  async function manageAccount(user: AdminUser) {
    setManagedUser(user);
    setManagedDetails(null);
    setManagedDetailsLoading(true);
    try {
      const details = (await adminRequest("/admin/users/" + user.id + "/details")) as AdminUserDetails;
      setManagedDetails(details);
      setUserDraft(details.user);
      setPlanReason("");
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
      const updated = await updateUser.mutateAsync({
        id: managedDetails.user.id,
        data: {
          name: userDraft.name,
          email: userDraft.email,
          role: userDraft.role,
          activeRole: userDraft.activeRole,
          educatorEnabled: userDraft.educatorEnabled,
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
        },
      });
      applyUpdatedUser(updated);
      setUserDraft(updated);
      toast({ title: "Account details saved" });
    } catch (error) {
      toast({ title: "Could not save account", description: adminActionError(error), variant: "destructive" });
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

  async function confirmDeleteWorkItem() {
    if (!managedDetails || !deleteWorkTarget) return;
    const { category, item } = deleteWorkTarget;
    setDeletingWork(true);
    try {
      await adminRequest(`/admin/users/${managedDetails.user.id}/work/${category}/${item.id}`, { method: "DELETE" });
      setManagedDetails((current) => current ? { ...current, work: { ...current.work, [category]: current.work[category].filter((row) => row.id !== item.id) } } : current);
      setDeleteWorkTarget(null);
      toast({ title: "User work deleted" });
    } catch (error) {
      toast({ title: "Could not delete work", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setDeletingWork(false);
    }
  }

  function applyUpdatedUser(updated: AdminUser) {
    setUsers((current) => current.map((item) => item.id === updated.id ? updated : item));
    setManagedUser((current) => current?.id === updated.id ? updated : current);
    setManagedDetails((current) => current?.user.id === updated.id ? { ...current, user: updated } : current);
  }

  function requestBan(user: AdminUser) {
    setBanTarget(user);
    setBanReason(user.bannedReason ?? "");
  }

  async function confirmBan() {
    if (!banTarget || banReason.trim().length < 3) return;
    const user = banTarget;
    setBusyUserId(user.id);
    try {
      const updated = await banAccount.mutateAsync({
        id: user.id,
        data: { reason: banReason.trim() },
      });
      applyUpdatedUser(updated);
      setBanTarget(null);
      setBanReason("");
      toast({ title: user.name + " was banned" });
    } catch (actionError) {
      toast({
        title: "Could not ban account",
        description: adminActionError(actionError),
        variant: "destructive",
      });
    } finally {
      setBusyUserId(null);
    }
  }

  async function unbanUser(user: AdminUser) {
    setBusyUserId(user.id);
    try {
      const updated = await unbanAccount.mutateAsync({ id: user.id });
      applyUpdatedUser(updated);
      toast({ title: user.name + " was unbanned" });
    } catch (actionError) {
      toast({
        title: "Could not unban account",
        description: adminActionError(actionError),
        variant: "destructive",
      });
    } finally {
      setBusyUserId(null);
    }
  }

  async function setTeacherVerification(user: AdminUser, verified: boolean) {
    setBusyUserId(user.id);
    try {
      const updated = await updatePublisherVerification.mutateAsync({
        id: user.id,
        data: { verified },
      });
      applyUpdatedUser(updated);
      toast({ title: user.name + (verified ? " is now publishing-verified" : " is no longer publishing-verified") });
    } catch (actionError) {
      toast({
        title: "Could not update publishing verification",
        description: adminActionError(actionError),
        variant: "destructive",
      });
    } finally {
      setBusyUserId(null);
    }
  }

  async function savePlanOverride() {
    if (!userDraft || !managedDetails || planReason.trim().length < 3) return;
    setBusyUserId(userDraft.id);
    try {
      const updated = await overridePlan.mutateAsync({
        id: userDraft.id,
        data: {
          plan: userDraft.plan,
          expiresAt: userDraft.plan === "free" ? null : userDraft.planExpiresAt ?? null,
          reason: planReason.trim(),
        },
      });
      applyUpdatedUser(updated);
      setUserDraft(updated);
      setPlanReason("");
      toast({ title: `${updated.name}'s plan is now ${updated.plan}` });
    } catch (actionError) {
      toast({
        title: "Could not override plan",
        description: adminActionError(actionError),
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
  const reliabilitySloStates = [
    data?.reliability?.lcpSloMet,
    data?.reliability?.inpSloMet,
    data?.reliability?.clsSloMet,
    data?.reliability?.errorFreeUsersSloMet,
  ];
  const hasReliabilitySamples = reliabilitySloStates.some(
    (value) => typeof value === "boolean",
  );
  const reliabilityNeedsAttention = reliabilitySloStates.some(
    (value) => value === false,
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
              <TrendingDown className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" />
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

          <div className="space-y-3 border-t pt-5">
            <div>
              <h3 className="text-sm font-semibold">Beta activation · 30 days</h3>
              <p className="text-xs text-muted-foreground">
                First-party workflow events only; search text and student content are excluded.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ["Registered", data?.workflow?.activation.registered30d ?? 0],
                ["Reached first search", data?.workflow?.activation.firstSearchUsers30d ?? 0],
                ["Checked a source", data?.workflow?.activation.sourceCheckUsers30d ?? 0],
                ["Activated learners", data?.workflow?.activation.activatedLearners30d ?? 0],
                ["Activated educators", data?.workflow?.activation.activatedEducators30d ?? 0],
                ["Classes with 5+ learners", data?.workflow?.activation.classesWithFiveLearners ?? 0],
                ["Average preview coverage", `${(data?.workflow?.activation.avgPreviewCoverage ?? 0).toFixed(1)}%`],
                ["Search no-result rate", `${(data?.workflow?.activation.searchNoResultRate ?? 0).toFixed(1)}%`],
              ].map(([label, value]) => (
                <div key={String(label)} className="min-w-0 rounded-md border bg-muted/20 p-3">
                  <p className="text-xs leading-snug text-muted-foreground">{label}</p>
                  <p className="mt-1 text-lg font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {[
                ["Registration → search", data?.workflow?.activation.registeredToSearchRate ?? 0],
                ["Search → source check", data?.workflow?.activation.searchToSourceCheckRate ?? 0],
                ["Source check → action", data?.workflow?.activation.sourceCheckToActionRate ?? 0],
                ["D1 return", data?.workflow?.activation.d1ReturnRate ?? 0],
                ["D7 return", data?.workflow?.activation.d7ReturnRate ?? 0],
              ].map(([label, rate]) => (
                <div key={String(label)} className="min-w-0 rounded-md border border-l-2 border-l-primary/40 p-3">
                  <p className="text-xs leading-snug text-muted-foreground">{label}</p>
                  <p className="mt-1 text-lg font-semibold">{Number(rate).toFixed(1)}%</p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="render-later overflow-hidden">
        <CardHeader className="gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="size-5 text-primary-text" /> Client reliability · 30 days
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Authenticated field measurements; route families and error categories only. No URLs, messages, stacks, or learner content.
              </p>
            </div>
            <Badge variant={reliabilityNeedsAttention ? "destructive" : "secondary"}>
              {!hasReliabilitySamples
                ? "Awaiting samples"
                : reliabilityNeedsAttention
                  ? "SLO attention needed"
                  : "SLOs met"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Measured users", data?.reliability?.measuredUsers30d ?? 0],
              ["Vital samples", data?.reliability?.vitalSamples30d ?? 0],
              ["Client errors", data?.reliability?.clientErrors30d ?? 0],
              ["Render crashes", data?.reliability?.renderCrashes30d ?? 0],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["LCP p75", data?.reliability?.lcpP75Ms, "≤ 2,500 ms", "ms", data?.reliability?.lcpSloMet],
              ["INP p75", data?.reliability?.inpP75Ms, "≤ 200 ms", "ms", data?.reliability?.inpSloMet],
              ["CLS p75", data?.reliability?.clsP75, "≤ 0.1", "", data?.reliability?.clsSloMet],
              ["Error-free users", hasReliabilitySamples ? data?.reliability?.errorFreeUsersRate : null, "≥ 99%", "%", data?.reliability?.errorFreeUsersSloMet],
            ].map(([label, value, target, unit, met]) => (
              <div key={String(label)} className="rounded-md border border-l-2 border-l-primary/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  {typeof met === "boolean" ? (
                    <Badge variant={met ? "secondary" : "destructive"}>{met ? "Met" : "Missed"}</Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-lg font-semibold">
                  {typeof value === "number" ? `${value}${unit}` : "No sample"}
                </p>
                <p className="text-xs text-muted-foreground">SLO {target}</p>
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
          <div className="grid gap-2 md:grid-cols-[minmax(16rem,1fr)_12rem_12rem]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => { setQuery(event.target.value); setUserOffset(0); }} placeholder="Search name, email, profile, or subjects..." aria-label="Search accounts" className="pl-9" />
            </div>
            <select aria-label="Filter by platform authority" className="h-10 rounded-md border bg-background px-3 text-sm" value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value as "" | AdminUser["role"]); setUserOffset(0); }}>
              <option value="">All authorities</option>
              <option value="student">Standard accounts</option>
              <option value="teacher">Legacy educator accounts</option>
              <option value="admin">Administrators</option>
            </select>
            <select aria-label="Filter by account status" className="h-10 rounded-md border bg-background px-3 text-sm" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as "" | "active" | "banned"); setUserOffset(0); }}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="banned">Banned</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {usersLoading ? <Skeleton className="h-52 w-full" /> : (
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2">Account</th>
                  <th className="pb-2">Capabilities</th>
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
                          <p className="font-medium hover:underline">{user.name}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </button>
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-1">
                          {accountCapabilities(user).map((capability) => <Badge key={capability} variant="outline">{capability}</Badge>)}
                        </div>
                        <span className="mt-1 block text-xs text-muted-foreground">{user.activeRole} workspace</span>
                      </td>
                      <td className="py-3 text-xs">{user.profileVisibility} profile / {user.libraryVisibility} library</td>
                      <td className="py-3">{new Date(user.createdAt).toLocaleDateString()}</td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Badge variant={user.bannedAt ? "destructive" : "secondary"}>{user.bannedAt ? "Banned" : "Active"}</Badge>
                          <Button size="sm" variant="outline" onClick={() => void manageAccount(user)}>
                            <Settings2 className="mr-1 size-3.5" /> Manage account
                          </Button>
                          {user.role !== "admin" && (
                            <Button size="sm" variant="outline" onClick={() => setTeacherVerification(user, !user.teacherVerified)} disabled={busyUserId === user.id}>
                              <ShieldCheck className="mr-1 size-3.5" /> {user.teacherVerified ? "Remove verification" : "Verify publisher"}
                            </Button>
                          )}
                          {user.id !== me?.id && (
                            user.bannedAt ? (
                              <Button size="sm" variant="outline" onClick={() => unbanUser(user)} disabled={busyUserId === user.id}>
                                <RotateCcw className="mr-1 size-3.5" /> Unban
                              </Button>
                            ) : (
                              <Button size="sm" variant="destructive" onClick={() => requestBan(user)} disabled={busyUserId === user.id}>
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
                            <div><p className="text-xs font-medium text-muted-foreground">Publishing verification</p><p>{user.role === "admin" ? "Implicitly trusted" : user.teacherVerified ? "Verified" : "Not verified"}</p></div>
                            <div><p className="text-xs font-medium text-muted-foreground">Ban date</p><p>{user.bannedAt ? new Date(user.bannedAt).toLocaleString() : "Not banned"}</p></div>
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
          {userPage.data && userPage.data.total > 0 ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
              <p className="text-muted-foreground">
                Showing {userPage.data.offset + 1}–{Math.min(userPage.data.offset + userPage.data.items.length, userPage.data.total)} of {userPage.data.total} accounts
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={userOffset === 0 || usersLoading} onClick={() => setUserOffset((current) => Math.max(0, current - 25))}>Previous</Button>
                <Button variant="outline" size="sm" disabled={userOffset + 25 >= userPage.data.total || usersLoading} onClick={() => setUserOffset((current) => current + 25)}>Next</Button>
              </div>
            </div>
          ) : null}
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
                    <label className="space-y-1 text-sm"><span className="font-medium">Platform authority</span><select className="h-10 w-full rounded-md border bg-background px-3" value={userDraft.role} onChange={(e) => setUserDraft({ ...userDraft, role: e.target.value as AdminUser["role"] })}><option value="student">Standard account</option><option value="teacher">Legacy educator account</option><option value="admin">Administrator</option></select></label>
                    <label className="space-y-1 text-sm"><span className="font-medium">Active workspace</span><select className="h-10 w-full rounded-md border bg-background px-3" value={userDraft.activeRole} onChange={(e) => setUserDraft({ ...userDraft, activeRole: e.target.value as AdminUser["activeRole"] })}><option value="student">Learner</option>{userDraft.educatorEnabled || userDraft.role === "admin" ? <option value="teacher">Educator</option> : null}</select><span className="block text-xs text-muted-foreground">Administrator is platform authority, not a workspace.</span></label>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={userDraft.educatorEnabled} onChange={(e) => setUserDraft({ ...userDraft, educatorEnabled: e.target.checked, activeRole: e.target.checked ? userDraft.activeRole : "student" })} /><span><span className="block font-medium">Educator capability</span><span className="text-xs text-muted-foreground">Allows teaching tools independently of the active workspace.</span></span></label>
                    <label className="space-y-1 text-sm"><span className="font-medium">Grade / department</span><Input value={userDraft.gradeOrDept ?? ""} onChange={(e) => setUserDraft({ ...userDraft, gradeOrDept: e.target.value || null })} /></label>
                    <label className="space-y-1 text-sm"><span className="font-medium">Timezone</span><Input value={userDraft.timezone ?? ""} onChange={(e) => setUserDraft({ ...userDraft, timezone: e.target.value || null })} /></label>
                    <label className="space-y-1 text-sm sm:col-span-2"><span className="font-medium">Subjects</span><Input value={userDraft.subjects?.join(", ") ?? ""} onChange={(e) => setUserDraft({ ...userDraft, subjects: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })} /></label>
                    <label className="space-y-1 text-sm"><span className="font-medium">Website</span><Input value={userDraft.websiteUrl ?? ""} onChange={(e) => setUserDraft({ ...userDraft, websiteUrl: e.target.value || null })} /></label>
                    <label className="space-y-1 text-sm sm:col-span-2 lg:col-span-3"><span className="font-medium">Bio</span><Textarea rows={4} value={userDraft.bio ?? ""} onChange={(e) => setUserDraft({ ...userDraft, bio: e.target.value || null })} /></label>
                    <label className="space-y-1 text-sm"><span className="font-medium">Profile visibility</span><select className="h-10 w-full rounded-md border bg-background px-3" value={userDraft.profileVisibility} onChange={(e) => setUserDraft({ ...userDraft, profileVisibility: e.target.value as AdminUser["profileVisibility"] })}>{["everyone", "classmates", "private"].map((v) => <option key={v}>{v}</option>)}</select></label>
                    <label className="space-y-1 text-sm"><span className="font-medium">Library visibility</span><select className="h-10 w-full rounded-md border bg-background px-3" value={userDraft.libraryVisibility} onChange={(e) => setUserDraft({ ...userDraft, libraryVisibility: e.target.value as AdminUser["libraryVisibility"] })}>{["everyone", "classmates", "private"].map((v) => <option key={v}>{v}</option>)}</select></label>
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
                          const date = workItemDate(item);
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
                                <div className="flex shrink-0 items-center gap-1">{date ? <span className="text-xs text-muted-foreground">{date}</span> : null}<Button size="icon" variant="ghost" title="Edit user work" onClick={() => void editWorkItem(key, item)}><Pencil className="size-4" /></Button><Button size="icon" variant="ghost" title="Delete user work" onClick={() => setDeleteWorkTarget({ category: key, item })}><Trash2 className="size-4 text-destructive-text" /></Button></div>
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
                  <p className="mt-1 text-sm text-muted-foreground">{managedDetails.user.bannedAt ? `Banned ${new Date(managedDetails.user.bannedAt).toLocaleString()}. ${managedDetails.user.bannedReason || "No reason recorded."}` : "This account is active."}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {managedDetails.user.id !== me?.id ? (
                      managedDetails.user.bannedAt ? (
                        <Button variant="outline" onClick={() => void unbanUser(managedDetails.user)} disabled={busyUserId === managedDetails.user.id}><RotateCcw className="mr-2 size-4" />Unban account</Button>
                      ) : (
                        <Button variant="destructive" onClick={() => requestBan(managedDetails.user)} disabled={busyUserId === managedDetails.user.id}><Ban className="mr-2 size-4" />Ban account</Button>
                      )
                    ) : <p className="text-sm text-muted-foreground">You cannot ban your own administrator account.</p>}
                  </div>
                </section>
                {userDraft ? (
                  <section className="border p-4" style={{ borderRadius: 8 }}>
                    <h3 className="font-semibold">Plan override</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      This changes server-enforced entitlements. Every override is stored with your administrator ID, the old and new plan, and the reason below.
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1 text-sm">
                        <span className="font-medium">Plan</span>
                        <select className="h-10 w-full rounded-md border bg-background px-3" value={userDraft.plan} onChange={(event) => setUserDraft({ ...userDraft, plan: event.target.value as AdminUser["plan"], planExpiresAt: event.target.value === "free" ? null : userDraft.planExpiresAt })}>
                          <option value="free">Free</option>
                          <option value="plus">Plus</option>
                          <option value="pro">Pro</option>
                        </select>
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="font-medium">Expiry (optional)</span>
                        <Input type="datetime-local" disabled={userDraft.plan === "free"} min={toLocalDateTimeInput(new Date(Date.now() + 60_000).toISOString())} value={toLocalDateTimeInput(userDraft.planExpiresAt)} onChange={(event) => setUserDraft({ ...userDraft, planExpiresAt: event.target.value ? new Date(event.target.value).toISOString() : null })} />
                      </label>
                      <label className="space-y-1 text-sm sm:col-span-2">
                        <span className="font-medium">Audit reason</span>
                        <Textarea rows={3} maxLength={1000} value={planReason} onChange={(event) => setPlanReason(event.target.value)} placeholder="Why is this entitlement override necessary?" />
                        <span className="block text-xs text-muted-foreground">Required · at least 3 characters</span>
                      </label>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <Button onClick={() => void savePlanOverride()} disabled={planReason.trim().length < 3 || busyUserId === userDraft.id}>
                        {busyUserId === userDraft.id ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
                        Save audited plan override
                      </Button>
                    </div>
                  </section>
                ) : null}
                {managedDetails.user.role !== "admin" ? (
                  <section className="border p-4" style={{ borderRadius: 8 }}>
                    <h3 className="font-semibold">Publishing verification</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Current status: {managedDetails.user.teacherVerified ? "Verified" : "Not verified"}</p>
                    <Button className="mt-4" variant="outline" onClick={() => void setTeacherVerification(managedDetails.user, !managedDetails.user.teacherVerified)} disabled={busyUserId === managedDetails.user.id}>
                      <ShieldCheck className="mr-2 size-4" />{managedDetails.user.teacherVerified ? "Remove verification" : "Verify publisher"}
                    </Button>
                  </section>
                ) : null}
                <section className="border p-4" style={{ borderRadius: 8 }}>
                  <div className="flex items-center gap-2"><CalendarDays className="size-4 text-primary-text" /><h3 className="font-semibold">Account record</h3></div>
                  <p className="mt-2 text-sm">User ID: {managedDetails.user.id}</p>
                  <p className="text-sm">Created: {new Date(managedDetails.user.createdAt).toLocaleString()}</p>
                </section>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="min-h-72 p-6 text-center text-sm text-muted-foreground">Account details could not be loaded.</div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={banTarget !== null}
        onOpenChange={(open) => {
          if (!open && busyUserId === null) {
            setBanTarget(null);
            setBanReason("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ban {banTarget?.name ?? "account"}?</DialogTitle>
            <DialogDescription>
              The current session will lose access on its next API request. The reason is retained on the account for administrators to review.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="admin-ban-reason" className="text-sm font-medium">Ban reason</label>
            <Textarea id="admin-ban-reason" autoFocus rows={4} maxLength={500} value={banReason} onChange={(event) => setBanReason(event.target.value)} placeholder="Describe the policy or safety reason..." />
            <p className="text-xs text-muted-foreground">Required · at least 3 characters · visible to administrators</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busyUserId !== null} onClick={() => { setBanTarget(null); setBanReason(""); }}>Cancel</Button>
            <Button variant="destructive" disabled={banReason.trim().length < 3 || busyUserId !== null} onClick={() => void confirmBan()}>
              {busyUserId !== null ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Ban className="mr-2 size-4" />}
              Ban account
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteWorkTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deletingWork) setDeleteWorkTarget(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Permanently delete this work?</DialogTitle>
            <DialogDescription>
              “{deleteWorkTarget ? workItemName(deleteWorkTarget.item) : "This item"}” will be removed from the account. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            Category: {deleteWorkTarget ? workCategories.find(({ key }) => key === deleteWorkTarget.category)?.label : "Unknown"}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={deletingWork} onClick={() => setDeleteWorkTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deletingWork} onClick={() => void confirmDeleteWorkItem()}>
              {deletingWork ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Trash2 className="mr-2 size-4" />}
              Delete permanently
            </Button>
          </div>
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
                <div><p className="text-xl font-semibold">{data?.plan.name ?? "Administrator"}</p><p className="text-sm capitalize text-emerald-600">{data?.plan.status ?? "active"}</p></div>
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
            <div><CardTitle>Current 24-hour window</CardTitle><p className="mt-1 text-sm text-muted-foreground">Platform-wide AI counters reset when their active window ends</p></div>
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
        <Card><CardHeader className="flex flex-row items-center justify-between"><div><CardTitle>Estimated AI cost</CardTitle><p className="mt-1 text-sm text-muted-foreground">All recorded requests · planning estimate</p></div><DollarSign className="size-5 text-primary-text" /></CardHeader><CardContent><p className="text-3xl font-bold">${(data?.usage.estimatedCostUsd ?? 0).toFixed(2)}</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Current 30-day counter window</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">{data ? Object.entries(data.usage.byFeature).map(([feature, usage]) => <div key={feature} className="flex justify-between"><span className="capitalize">{feature.replaceAll("-", " ")}</span><span className="font-semibold">{usage.month}</span></div>) : <Skeleton className="h-20 w-full" />}</CardContent></Card>
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
