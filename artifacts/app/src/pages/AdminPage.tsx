import { useGetAdminOverview } from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/edu-ds/components/ui/card";
import { Skeleton } from "@workspace/edu-ds/components/ui/skeleton";
import {
  ShieldCheck,
  Users,
  Target,
  BookOpen,
  SearchCheck,
  Activity,
  Sparkles,
  DollarSign,
  BarChart3,
} from "lucide-react";

const metrics = [
  { key: "users", label: "Total accounts", icon: Users },
  { key: "students", label: "Students", icon: Users },
  { key: "teachers", label: "Teachers", icon: Users },
  { key: "admins", label: "Administrators", icon: ShieldCheck },
  { key: "goals", label: "Learning goals", icon: Target },
  { key: "resources", label: "Resources", icon: BookOpen },
  {
    key: "cachedResearchReports",
    label: "Cached research reports",
    icon: SearchCheck,
  },
] as const;

export default function AdminPage() {
  const { data, isLoading, error } = useGetAdminOverview();
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-primary" />
          <h1 className="text-3xl font-bold">Administrator panel</h1>
        </div>
        <p className="mt-2 text-muted-foreground">
          Platform activity at a glance. Administrator AI discovery and deep
          research are not subject to regular account quotas.
        </p>
      </div>
      {error ? (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-destructive">
            Administrator data could not be loaded. Confirm this account is
            listed in ADMIN_EMAILS and sign in again.
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(({ key, label, icon: Icon }) => (
          <Card key={key}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-9 w-20" />
              ) : (
                <div className="text-3xl font-bold">{data?.[key] ?? 0}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Current plan</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Access and account limits
              </p>
            </div>
            <Sparkles className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xl font-semibold">{data?.plan.name}</p>
                    <p className="text-sm capitalize text-emerald-600">
                      {data?.plan.status}
                    </p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                    Unlimited
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-muted-foreground">AI searches</p>
                    <p className="mt-1 font-semibold">Unlimited</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-muted-foreground">Deep research</p>
                    <p className="mt-1 font-semibold">Unlimited</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Usage today</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Platform-wide AI activity
              </p>
            </div>
            <Activity className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">AI searches</p>
                  <p className="mt-2 text-3xl font-bold">
                    {data?.usage.aiSearchesToday ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">Deep research</p>
                  <p className="mt-2 text-3xl font-bold">
                    {data?.usage.deepResearchToday ?? 0}
                  </p>
                </div>
              </div>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              Admin requests bypass quotas and are not added to these
              limited-account counters. Duplicate concurrent research protection
              remains enabled.
            </p>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Total AI requests</CardTitle>
            <BarChart3 className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {data?.usage.totalAiRequests ?? 0}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tracked provider calls; cache hits are free and excluded.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Estimated AI cost</CardTitle>
            <DollarSign className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              ${(data?.usage.estimatedCostUsd ?? 0).toFixed(2)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Planning estimate based on configured models and search tools.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Last 30 days</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {data ? (
              Object.entries(data.usage.byFeature).map(([feature, usage]) => (
                <div key={feature} className="flex justify-between">
                  <span className="capitalize">
                    {feature.replaceAll("-", " ")}
                  </span>
                  <span className="font-semibold">{usage.month}</span>
                </div>
              ))
            ) : (
              <Skeleton className="h-20 w-full" />
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>AI usage by user</CardTitle>
          <p className="text-sm text-muted-foreground">
            Lifetime tracked provider calls and estimated cost. Users with no AI
            calls are omitted.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2">User</th>
                <th className="pb-2 text-right">Search</th>
                <th className="pb-2 text-right">Quick</th>
                <th className="pb-2 text-right">Deep</th>
                <th className="pb-2 text-right">Metadata</th>
                <th className="pb-2 text-right">Total</th>
                <th className="pb-2 text-right">Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {data?.usage.byUser.map((user) => (
                <tr key={user.userId} className="border-b last:border-0">
                  <td className="py-3">
                    <p className="font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {user.email}
                    </p>
                  </td>
                  <td className="py-3 text-right">{user.searches}</td>
                  <td className="py-3 text-right">{user.quickReviews}</td>
                  <td className="py-3 text-right">{user.deepResearch}</td>
                  <td className="py-3 text-right">{user.metadata}</td>
                  <td className="py-3 text-right font-semibold">
                    {user.total}
                  </td>
                  <td className="py-3 text-right">
                    ${user.estimatedCostUsd.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isLoading && (data?.usage.byUser.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No tracked AI provider usage yet.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
