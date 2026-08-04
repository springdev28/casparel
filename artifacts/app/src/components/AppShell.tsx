import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Target,
  BookOpen,
  Users,
  List,
  Calendar,
  LogOut,
  Link2,
  CheckCircle2,
  RefreshCw,
  UserCog,
  User,
  Bell,
  Gauge,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Check,
  Waves,
} from "lucide-react";
import { cn } from "@workspace/edu-ds/lib/utils";
import { Button } from "@workspace/edu-ds/components/ui/button";
import { Skeleton } from "@workspace/edu-ds/components/ui/skeleton";
import { Input } from "@workspace/edu-ds/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/edu-ds/components/ui/select";
import {
  useGetMe,
  useGetGCStatus,
  useGetGCAuthUrl,
  useDisconnectGoogle,
  useSwitchRole,
  getGetGCStatusQueryKey,
  getGetGCAuthUrlQueryKey,
  UserRole,
  RoleSwitchInputRole,
  useGetRecentActivity,
  useGetMyUsage,
  getGetMyUsageQueryKey,
  getListLearningGoalsQueryKey,
  useListLearningGoals,
  useUpdateLearningGoal,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@workspace/edu-ds/hooks/use-toast";
import ThemeCustomizer from "./ThemeCustomizer";
import { AuthLanguageSelect } from "./AuthLanguageSelect";
import { useAuthLanguage } from "../lib/auth-locale";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/edu-ds/components/ui/popover";
import BrandIcon from "./BrandIcon";

const TOKEN_KEY = "schoolar_token";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Goals", href: "/goals", icon: Target },
  { label: "Resources", href: "/resources", icon: BookOpen },
  { label: "People", href: "/people", icon: Users },
  { label: "Classes", href: "/classes", icon: Users },
  { label: "Lists", href: "/lists", icon: List },
  { label: "Schedule", href: "/schedule", icon: Calendar },
];

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useGetMe();
  const { language, setLanguage, copy } = useAuthLanguage();
  const { data: notifications } = useGetRecentActivity();
  const { data: accountUsage } = useGetMyUsage({
    query: { enabled: Boolean(me), refetchInterval: 30_000, queryKey: getGetMyUsageQueryKey() },
  });
  const { data: sidebarGoals } = useListLearningGoals({ query: { enabled: Boolean(me), queryKey: getListLearningGoalsQueryKey() } });
  const updateSidebarGoal = useUpdateLearningGoal();
  const [expandedPaths, setExpandedPaths] = useState<number[]>([]);
  const [ambientMotion, setAmbientMotion] = useState(() => localStorage.getItem("schoolar_ambient_motion") !== "off");
  function toggleAmbientMotion() {
    setAmbientMotion((current) => {
      const next = !current;
      localStorage.setItem("schoolar_ambient_motion", next ? "on" : "off");
      return next;
    });
  }
  async function updatePath(goal: NonNullable<typeof sidebarGoals>[number], pathSteps: typeof goal.pathSteps) {
    await updateSidebarGoal.mutateAsync({ id: goal.id, data: { pathSteps } });
    await queryClient.invalidateQueries({ queryKey: getListLearningGoalsQueryKey() });
  }
  const isTeacher = (me?.activeRole ?? me?.role) === UserRole.teacher;
  const isAdmin = me?.role === UserRole.admin;
  const navItems = isAdmin
    ? [...NAV_ITEMS, { label: "Admin", href: "/admin", icon: ShieldCheck }]
    : NAV_ITEMS;

  // Real Google Classroom status — only fetched for teachers
  const { data: gcStatus, isLoading: gcStatusLoading } = useGetGCStatus({
    query: { enabled: isTeacher, queryKey: getGetGCStatusQueryKey() },
  });

  // Lazy auth URL fetch — only triggered on demand
  const {
    data: gcAuthUrlData,
    refetch: fetchAuthUrl,
    isFetching: authUrlFetching,
  } = useGetGCAuthUrl({
    query: { enabled: false, queryKey: getGetGCAuthUrlQueryKey() },
  });

  const disconnectGoogle = useDisconnectGoogle();
  const switchRoleMutation = useSwitchRole();

  // When the auth URL arrives, redirect the browser to Google
  useEffect(() => {
    if (gcAuthUrlData?.url) {
      window.location.href = gcAuthUrlData.url;
    }
  }, [gcAuthUrlData]);

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    queryClient.clear();
    const configuredBase = import.meta.env.BASE_URL;
    const basePath = configuredBase.endsWith("/") ? configuredBase.slice(0, -1) : configuredBase;
    window.location.assign(basePath + "/resources");
  }

  async function handleGcConnect() {
    try {
      await fetchAuthUrl();
    } catch {
      toast({
        title: "Could not start Google authorization",
        description: "Please try again or connect from the Classes page.",
        variant: "destructive",
      });
    }
  }

  async function handleGcDisconnect() {
    try {
      await disconnectGoogle.mutateAsync();
      queryClient.invalidateQueries({ queryKey: getGetGCStatusQueryKey() });
      toast({ title: "Google Classroom disconnected" });
    } catch {
      toast({
        title: "Error",
        description: "Could not disconnect Google Classroom",
        variant: "destructive",
      });
    }
  }

  async function handleRoleSwitch(newRole: string) {
    try {
      const result = await switchRoleMutation.mutateAsync({
        data: { role: newRole as RoleSwitchInputRole },
      });
      // Store the fresh token so subsequent requests carry the new role
      localStorage.setItem(TOKEN_KEY, result.token);
      // Reload the current URL so every role-dependent query and component starts fresh.
      window.location.reload();
    } catch {
      toast({
        title: "Error",
        description: "Could not switch role. Please try again.",
        variant: "destructive",
      });
    }
  }

  // Build the sidebar GC widget (teachers only)
  const gcWidget = isTeacher ? (
    gcStatusLoading ? (
      <Skeleton className="h-6 w-40 bg-primary-foreground/20" />
    ) : gcStatus?.configured ? (
      gcStatus.connected ? (
        <button
          onClick={handleGcDisconnect}
          disabled={disconnectGoogle.isPending}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs text-primary-foreground/70 hover:bg-primary-foreground/10 transition-colors"
          title="Disconnect Google Classroom"
          data-testid="sidebar-gc-disconnect"
        >
          <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
          <span className="truncate">Google Classroom linked</span>
        </button>
      ) : (
        <button
          onClick={handleGcConnect}
          disabled={authUrlFetching}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs text-primary-foreground/70 hover:bg-primary-foreground/10 transition-colors"
          data-testid="sidebar-gc-connect"
        >
          {authUrlFetching ? (
            <RefreshCw size={13} className="shrink-0 animate-spin" />
          ) : (
            <Link2 size={13} className="shrink-0" />
          )}
          <span className="truncate">Connect Google Classroom</span>
        </button>
      )
    ) : gcStatus && !gcStatus.configured ? (
      <span
        className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-primary-foreground/40 cursor-default"
        title="Google Classroom credentials are not configured on this server. Contact your admin."
        data-testid="sidebar-gc-not-configured"
      >
        <Link2 size={13} className="shrink-0" />
        <span className="truncate">Google Classroom</span>
        <span className="text-[10px] ml-auto shrink-0">(not set up)</span>
      </span>
    ) : null
  ) : null;

  // Role switcher — shown when user data is loaded
  const roleSwitcher = me ? (
    <div className="flex items-center gap-2 w-full" data-testid="role-switcher">
      <UserCog size={13} className="text-primary-foreground/60 shrink-0" />
      <Select
        value={me.activeRole ?? (me.role === UserRole.teacher ? RoleSwitchInputRole.teacher : RoleSwitchInputRole.student)}
        onValueChange={handleRoleSwitch}
        disabled={switchRoleMutation.isPending}
      >
        <SelectTrigger
          className="h-7 text-xs bg-transparent border-primary-foreground/30 text-primary-foreground/80 hover:bg-primary-foreground/10 focus:ring-0 focus:ring-offset-0 px-2"
          data-testid="role-select"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={RoleSwitchInputRole.student}>Student</SelectItem>
          <SelectItem value={RoleSwitchInputRole.teacher}>Teacher</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ) : null;

  return (
    <>
      <div className="flex min-h-[100dvh] w-full">
        {/* Sidebar */}
        <aside className="hidden md:flex flex-col w-56 shrink-0 bg-primary text-primary-foreground">
          {/* Logo */}
          <div className="flex items-center gap-2 px-5 py-5 border-b border-primary-foreground/20">
            <BrandIcon
              className="h-14 w-28 text-primary-foreground"
              label="Schoolar"
            />
            <span className="font-bold text-lg tracking-tight">Schoolar</span>
          </div>

          {/* Nav */}
          <nav
            className="flex-1 py-4 px-3 space-y-1"
            aria-label="Main navigation"
          >
            {navItems.map(({ label, href, icon: Icon }) => {
              const isActive =
                location === href || location.startsWith(href + "/");
              const displayLabel =
                language === "tr" ? (NAV_LABELS_TR[label] ?? label) : label;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-label={displayLabel}
                  title={displayLabel}
                  data-testid={`nav-${label.toLowerCase()}`}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground",
                  )}
                >
                  <Icon size={17} />
                  {displayLabel}
                </Link>
              );
            })}
          </nav>
          <section className="border-t border-primary-foreground/20 px-3 py-3" data-testid="sidebar-paths">
            <div className="mb-2 flex items-center justify-between px-2">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide"><Target size={14} /> Paths</span>
              <Link href="/goals" className="text-[10px] text-primary-foreground/70 hover:underline">Edit all</Link>
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {sidebarGoals?.filter((goal) => goal.status === "active").map((goal) => {
                const expanded = expandedPaths.includes(goal.id);
                return <div key={goal.id} className="rounded-md bg-primary-foreground/10">
                  <button type="button" className="flex w-full items-center gap-2 px-2 py-2 text-left text-xs font-medium" onClick={() => setExpandedPaths((current) => expanded ? current.filter((id) => id !== goal.id) : [...current, goal.id])}>
                    {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<span className="min-w-0 flex-1 truncate">{goal.title}</span><span className="text-[10px] text-primary-foreground/60">{goal.pathSteps.filter((step) => step.completed).length}/{goal.pathSteps.length}</span>
                  </button>
                  {expanded && <div className="space-y-1 px-2 pb-2">
                    {goal.pathSteps.map((step) => <div key={step.id} className="flex items-center gap-1.5">
                      <button type="button" aria-label={`${step.completed ? "Undo" : "Complete"} ${step.title}`} className={cn("flex size-5 shrink-0 items-center justify-center rounded border border-primary-foreground/40", step.completed && "bg-emerald-500 text-white")} onClick={() => updatePath(goal, goal.pathSteps.map((item) => item.id === step.id ? { ...item, completed: !item.completed } : item))}>{step.completed && <Check size={12} />}</button>
                      <Input defaultValue={step.title} aria-label={`Edit ${step.title}`} className={cn("h-7 border-primary-foreground/25 bg-transparent px-2 text-[11px] text-primary-foreground", step.completed && "line-through opacity-65")} onBlur={(event) => { const title = event.currentTarget.value.trim(); if (title && title !== step.title) updatePath(goal, goal.pathSteps.map((item) => item.id === step.id ? { ...item, title } : item)); }} />
                    </div>)}
                  </div>}
                </div>;
              })}
              {sidebarGoals && !sidebarGoals.some((goal) => goal.status === "active") && <Link href="/goals" className="block rounded-md px-2 py-2 text-xs text-primary-foreground/65 hover:bg-primary-foreground/10">Resume a goal to show its path.</Link>}
            </div>
          </section>

          {/* Footer */}
          <div className="px-4 py-4 border-t border-primary-foreground/20 space-y-2">
            {meLoading ? (
              <div className="flex items-center gap-2.5 mb-2">
                <Skeleton className="w-8 h-8 rounded-full bg-primary-foreground/20" />
                <div className="space-y-1 flex-1">
                  <Skeleton className="h-3.5 w-24 bg-primary-foreground/20" />
                  <Skeleton className="h-3 w-16 bg-primary-foreground/20" />
                </div>
              </div>
            ) : me ? (
              <Link
                href="/profile"
                className="flex items-center gap-2.5 mb-2 group"
              >
                <div className="w-8 h-8 rounded-full bg-primary-foreground/20 flex items-center justify-center overflow-hidden shrink-0 group-hover:ring-2 group-hover:ring-primary-foreground/40 transition-all">
                  {me.avatarUrl ? (
                    <img
                      src={me.avatarUrl}
                      alt={me.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User size={16} className="text-primary-foreground/60" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-primary-foreground truncate group-hover:underline">
                    {me.name}
                  </p>
                </div>
              </Link>
            ) : null}

            {me ? (
              <div className="rounded-lg border border-primary-foreground/20 bg-primary-foreground/10 p-3" data-testid="sidebar-plan-usage">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold"><Gauge size={13} /> Current plan</span>
                  <span className="rounded-full bg-primary-foreground/15 px-2 py-0.5 text-[10px] font-semibold">{accountUsage?.plan ?? (isAdmin ? "Administrator" : "Free")}</span>
                </div>
                <div className="space-y-2 text-[11px] text-primary-foreground/75">
                  <div><div className="flex justify-between"><span>AI search</span><span>{accountUsage?.unlimited ? "Unlimited" : String(accountUsage?.aiSearch.used ?? 0) + " / " + String(accountUsage?.aiSearch.limit ?? 20)}</span></div>{!accountUsage?.unlimited ? <div className="mt-1 h-1 overflow-hidden rounded bg-primary-foreground/15"><div className="h-full rounded bg-primary-foreground/70" style={{ width: Math.min(100, ((accountUsage?.aiSearch.used ?? 0) / (accountUsage?.aiSearch.limit ?? 20)) * 100) + "%" }} /></div> : null}</div>
                  <div><div className="flex justify-between"><span>Deep research</span><span>{accountUsage?.unlimited ? "Unlimited" : String(accountUsage?.deepResearch.used ?? 0) + " / " + String(accountUsage?.deepResearch.limit ?? 2)}</span></div>{!accountUsage?.unlimited ? <div className="mt-1 h-1 overflow-hidden rounded bg-primary-foreground/15"><div className="h-full rounded bg-primary-foreground/70" style={{ width: Math.min(100, ((accountUsage?.deepResearch.used ?? 0) / (accountUsage?.deepResearch.limit ?? 2)) * 100) + "%" }} /></div> : null}</div>
                </div>
                {!accountUsage?.unlimited ? <p className="mt-2 text-[10px] text-primary-foreground/55">Search resets hourly · Research resets daily</p> : null}
              </div>
            ) : null}

            {/* Role switcher */}
            {roleSwitcher}

            {/* Google Classroom connect — real OAuth, teachers only */}
            {gcWidget}

            <div
              className="px-2 py-1 [&_select]:border-primary-foreground/30 [&_select]:bg-transparent [&_select]:text-primary-foreground"
              data-testid="sidebar-language"
            >
              <AuthLanguageSelect
                language={language}
                label={copy.language}
                onChange={(next) => {
                  setLanguage(next);
                  window.location.reload();
                }}
              />
            </div>
            <ThemeCustomizer
              accountId={me?.id}
              showLabel
              className="w-full justify-start text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 px-2"
            />

            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 px-2"
              onClick={handleLogout}
              data-testid="logout-button"
            >
              <LogOut size={15} className="mr-2" />
              Logout
            </Button>
          </div>
        </aside>

        {/* Mobile top bar */}
        <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-primary text-primary-foreground flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <BrandIcon className="h-10 w-20" label="Schoolar" />
            <span className="hidden min-[400px]:inline font-bold">
              Schoolar
            </span>
          </div>
          <nav
            className="ml-2 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
            aria-label="Mobile navigation"
          >
            {navItems.map(({ label, href, icon: Icon }) => {
              const isActive =
                location === href || location.startsWith(href + "/");
              const displayLabel =
                language === "tr" ? (NAV_LABELS_TR[label] ?? label) : label;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-label={displayLabel}
                  title={displayLabel}
                  className={cn(
                    "shrink-0 p-2 rounded-md transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-primary-foreground/70 hover:bg-primary-foreground/10",
                  )}
                >
                  <Icon size={18} />
                </Link>
              );
            })}
            {/* Mobile role switcher — compact icon+select */}
            {me && (
              <Select
                value={me.activeRole ?? (me.role === UserRole.teacher ? RoleSwitchInputRole.teacher : RoleSwitchInputRole.student)}
                onValueChange={handleRoleSwitch}
                disabled={switchRoleMutation.isPending}
              >
                <SelectTrigger
                  className="h-8 w-8 p-0 bg-transparent border-none text-primary-foreground/70 hover:bg-primary-foreground/10 focus:ring-0 focus:ring-offset-0 [&>svg]:hidden"
                  data-testid="mobile-role-select"
                  title={`Current role: ${me.activeRole ?? me.role}`}
                >
                  <UserCog size={18} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={RoleSwitchInputRole.student}>
                    Student
                  </SelectItem>
                  <SelectItem value={RoleSwitchInputRole.teacher}>
                    Teacher
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
            <ThemeCustomizer
              accountId={me?.id}
              className="text-primary-foreground/70 hover:bg-primary-foreground/10"
            />
            <button
              onClick={handleLogout}
              className="p-2 rounded-md text-primary-foreground/70 hover:bg-primary-foreground/10"
              data-testid="mobile-logout-button"
            >
              <LogOut size={18} />
            </button>
          </nav>
        </div>

        {/* Main content */}
        <main className="relative flex-1 min-w-0 bg-background overflow-auto md:pt-0 pt-14">
          {ambientMotion && <div className="codex-ambient" aria-hidden="true"><span /><span /><span /></div>}
          <div
            className="sticky top-0 z-40 flex h-12 items-center justify-end gap-1 border-b bg-background/85 px-4 backdrop-blur"
            data-testid="notification-bar"
          >
            <Button variant="ghost" size="sm" onClick={toggleAmbientMotion} aria-pressed={ambientMotion} title={ambientMotion ? "Turn animated background off" : "Turn animated background on"} data-testid="ambient-motion-toggle">
              <Waves size={17} className="mr-2" />
              <span className="hidden sm:inline">Motion {ambientMotion ? "on" : "off"}</span>
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="relative"
                  aria-label="Notifications"
                  data-testid="notifications-button"
                >
                  <Bell size={18} />
                  {notifications?.some((item) => item.type === "schedule") && (
                    <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive" />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="border-b p-3">
                  <b className="text-sm">
                    {language === "tr" ? "Bildirimler" : "Notifications"}
                  </b>
                  <p className="text-xs text-muted-foreground">
                    {language === "tr"
                      ? "Davetler ve program güncellemeleri"
                      : "Invitations and schedule updates"}
                  </p>
                </div>
                <div className="max-h-80 overflow-y-auto p-2">
                  {!notifications?.length ? (
                    <p className="p-4 text-center text-sm text-muted-foreground">
                      {language === "tr"
                        ? "Yeni bildirim yok"
                        : "No updates yet"}
                    </p>
                  ) : (
                    notifications.map((item) => (
                      <Link
                        key={item.id}
                        href={
                          item.type === "schedule" ? "/schedule" : "/dashboard"
                        }
                        className="block rounded-lg p-3 hover:bg-muted"
                      >
                        <p className="text-sm">{item.message}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(item.createdAt).toLocaleString(
                            language === "tr" ? "tr-TR" : undefined,
                          )}
                        </p>
                      </Link>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="relative z-10">{children}</div>
        </main>
      </div>
    </>
  );
}
const NAV_LABELS_TR: Record<string, string> = {
  Dashboard: "Ana Sayfa",
  Goals: "Hedefler",
  Resources: "Kaynaklar",
  People: "Kişiler",
  Classes: "Sınıflar",
  Lists: "Listeler",
  Schedule: "Takvim",
};
