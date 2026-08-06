import { useEffect, useMemo, useState } from "react";
import { useGetAdminOverview, useGetMe } from "@workspace/api-client-react";
import { Button } from "@workspace/edu-ds/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/edu-ds/components/ui/card";
import { Input } from "@workspace/edu-ds/components/ui/input";
import { Badge } from "@workspace/edu-ds/components/ui/badge";
import { Skeleton } from "@workspace/edu-ds/components/ui/skeleton";
import { toast } from "@workspace/edu-ds/hooks/use-toast";
import {
  Activity,
  Ban,
  BarChart3,
  BookOpen,
  DollarSign,
  RotateCcw,
  Search,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from "lucide-react";

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
  const { data, isLoading, error } = useGetAdminOverview();
  const { data: me } = useGetMe();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
  const [busyUserId, setBusyUserId] = useState<number | null>(null);

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

  async function banUser(user: AdminUser) {
    const reason = window.prompt("Reason for banning this account:", user.bannedReason ?? "");
    if (reason === null) return;
    setBusyUserId(user.id);
    try {
      const updated = (await adminRequest("/admin/users/" + user.id + "/ban", {
        method: "PATCH",
        body: JSON.stringify({ reason }),
      })) as AdminUser;
      setUsers((current) => current.map((item) => item.id === user.id ? updated : item));
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
      setUsers((current) => current.map((item) => item.id === user.id ? updated : item));
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
      setUsers((current) => current.map((item) => item.id === user.id ? updated : item));
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

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-primary" />
          <h1 className="text-2xl font-bold">Administrator panel</h1>
        </div>
        <p className="mt-2 text-muted-foreground">
          Full account moderation, platform activity, and unlimited administrator access.
        </p>
      </div>

      {error ? (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-destructive">
            Administrator data could not be loaded. Confirm this account is listed in ADMIN_EMAILS and sign in again.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(({ key, label, icon: Icon }) => (
          <Card key={key}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{label}</CardTitle>
              <Icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">{data?.[key] ?? 0}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
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
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search every account field..." className="pl-9" />
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
                  <>
                    <tr key={user.id} className="border-b last:border-0">
                      <td className="py-3">
                        <button type="button" className="text-left" onClick={() => setExpandedUserId((id) => id === user.id ? null : user.id)}>
                          <p className="font-medium hover:underline">{user.name}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </button>
                      </td>
                      <td className="py-3 capitalize">{user.role} <span className="text-xs text-muted-foreground">({user.activeRole})</span></td>
                      <td className="py-3 text-xs">{user.profileVisibility} profile / {user.libraryVisibility} library</td>
                      <td className="py-3">{new Date(user.createdAt).toLocaleDateString()}</td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Badge variant={user.bannedAt ? "destructive" : "secondary"}>{user.bannedAt ? "Banned" : "Active"}</Badge>
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
                      <tr key={user.id + "-details"} className="border-b bg-muted/30">
                        <td colSpan={5} className="p-4">
                          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <div><p className="text-xs font-medium text-muted-foreground">Bio</p><p>{user.bio || "Not set"}</p></div>
                            <div><p className="text-xs font-medium text-muted-foreground">Subjects</p><p>{user.subjects?.join(", ") || "Not set"}</p></div>
                            <div><p className="text-xs font-medium text-muted-foreground">Grade / department</p><p>{user.gradeOrDept || "Not set"}</p></div>
                            <div><p className="text-xs font-medium text-muted-foreground">Timezone</p><p>{user.timezone || "Not set"}</p></div>
                            <div><p className="text-xs font-medium text-muted-foreground">Website</p><p className="break-all">{user.websiteUrl || "Not set"}</p></div>
                            <div><p className="text-xs font-medium text-muted-foreground">Field visibility</p><p>Bio {String(user.showBio)}, subjects {String(user.showSubjects)}, grade {String(user.showGradeOrDept)}, website {String(user.showWebsite)}</p></div>
                            <div><p className="text-xs font-medium text-muted-foreground">Teacher verification</p><p>{user.role === "teacher" ? (user.teacherVerified ? "Verified" : "Not verified") : "Not applicable"}</p></div>
                            <div><p className="text-xs font-medium text-muted-foreground">Ban date</p><p>{user.bannedAt ? new Date(user.bannedAt).toLocaleString() : "Not banned"}</p></div>
                            <div><p className="text-xs font-medium text-muted-foreground">Ban reason</p><p>{user.bannedReason || "None"}</p></div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
          {!usersLoading && filteredUsers.length === 0 && <p className="py-8 text-center text-muted-foreground">No matching accounts.</p>}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div><CardTitle>Current plan</CardTitle><p className="mt-1 text-sm text-muted-foreground">Access and account limits</p></div>
            <Sparkles className="size-5 text-primary" />
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
            <div><CardTitle>Usage today</CardTitle><p className="mt-1 text-sm text-muted-foreground">Platform-wide AI activity</p></div>
            <Activity className="size-5 text-primary" />
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <div className="rounded-md border p-4"><p className="text-sm text-muted-foreground">AI searches</p><p className="mt-2 text-3xl font-bold">{data?.usage.aiSearchesToday ?? 0}</p></div>
            <div className="rounded-md border p-4"><p className="text-sm text-muted-foreground">Deep research</p><p className="mt-2 text-3xl font-bold">{data?.usage.deepResearchToday ?? 0}</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle>Total AI requests</CardTitle><BarChart3 className="size-5 text-primary" /></CardHeader><CardContent><p className="text-3xl font-bold">{data?.usage.totalAiRequests ?? 0}</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle>Estimated AI cost</CardTitle><DollarSign className="size-5 text-primary" /></CardHeader><CardContent><p className="text-3xl font-bold">${(data?.usage.estimatedCostUsd ?? 0).toFixed(2)}</p></CardContent></Card>
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
