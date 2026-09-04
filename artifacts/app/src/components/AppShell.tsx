/**
 * @fileOverview Web UI role: provides the reusable App Shell component or bridge.
 * System connection: consumed by pages or shells and kept separate to share presentation, accessibility, and interaction behavior.
 */
import {
  lazy,
  ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  LibraryBig,
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
  Sparkles,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Check,
  Waves,
  MessagesSquare,
  MessageCircle,
  GalleryVerticalEnd,
  Workflow,
  X,
  Menu,
  Settings,
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
  getGetRecentActivityQueryKey,
  getListLearningGoalsQueryKey,
  useListLearningGoals,
  useUpdateLearningGoal,
  getListClassesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@workspace/edu-ds/hooks/use-toast";
import ThemeCustomizer, { applyDefaultColors } from "./ThemeCustomizer";
import { AuthLanguageSelect } from "./AuthLanguageSelect";
import {
  readSessionClaims,
  clearSession,
  notifySessionChanged,
} from "../lib/session";
import { usePlan } from "@/lib/use-plan";
import { useAuthLanguage } from "../lib/auth-locale";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/edu-ds/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/edu-ds/components/ui/sheet";
import BrandIcon from "./BrandIcon";
import type { VantaStyle } from "./VantaBackground";
import { classRequest, type ClassInvitation } from "../lib/class-api";
import {
  useUpdateUserPreferences,
  useUserPreferences,
  type UserPreferencesPatch,
} from "../lib/user-preferences";
import { useDocumentVisibility } from "../lib/use-document-visibility";
import { intlLocale } from "@/lib/date-locale";
import { InlineAd } from "./InlineAd";

const TOKEN_KEY = "schoolar_token";
const VantaBackground = lazy(() => import("./VantaBackground"));

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Classes", href: "/classes", icon: Users },
  { label: "Goals", href: "/goals", icon: Target },
  { label: "Activities", href: "/activities", icon: LibraryBig },
  { label: "Canvas", href: "/canvases", icon: Workflow },
  { label: "Resources", href: "/resources", icon: BookOpen },
  { label: "Catalog", href: "/catalog", icon: GalleryVerticalEnd },
  { label: "People", href: "/people", icon: Users },
  { label: "Forum", href: "/forum", icon: MessagesSquare },
  { label: "Messages", href: "/messages", icon: MessageCircle },
  { label: "Lists", href: "/lists", icon: List },
  { label: "Schedule", href: "/schedule", icon: Calendar },
  { label: "Settings", href: "/settings", icon: Settings },
];

function hslChannelsToRgb(value: string): [number, number, number] {
  const match = value.match(/([\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%/);
  if (!match) return [248, 247, 243];
  const hue = Number(match[1]) / 360;
  const saturation = Number(match[2]) / 100;
  const lightness = Number(match[3]) / 100;
  const channel = (offset: number) => {
    const k = (offset + hue * 12) % 12;
    return (
      lightness -
      saturation *
        Math.min(lightness, 1 - lightness) *
        Math.max(-1, Math.min(k - 3, 9 - k, 1))
    );
  };
  return [channel(0) * 255, channel(8) * 255, channel(4) * 255];
}

function usesLightText(rgb: number[]) {
  const linear = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2] <= 0.179;
}

function pageBackgroundRgb() {
  return hslChannelsToRgb(
    getComputedStyle(document.documentElement).getPropertyValue("--background"),
  );
}

function shouldUseLightToolbarText() {
  return usesLightText(pageBackgroundRgb());
}

const AMBIENT_BACKGROUND_RGB: Record<
  Exclude<VantaStyle, "off">,
  [number, number, number]
> = {
  net: [7, 17, 11],
  globe: [7, 11, 18],
  halo: [7, 11, 18],
  cells: [244, 251, 247],
  rings: [7, 11, 18],
  topology: [246, 250, 247],
};

function shouldUseLightPageText(style: VantaStyle, intensity: number) {
  if (style === "off") return shouldUseLightToolbarText();
  const page = pageBackgroundRgb();
  const effect = AMBIENT_BACKGROUND_RGB[style];
  const opacity = Math.min(1, 0.35 + intensity * 0.25);
  return usesLightText(
    page.map(
      (channel, index) => channel * (1 - opacity) + effect[index] * opacity,
    ),
  );
}

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const [location] = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia("(min-width: 768px)").matches,
  );
  const [secondaryDataReady, setSecondaryDataReady] = useState(false);
  // Gates the decorative three.js background until the browser is idle.
  const [ambientReady, setAmbientReady] = useState(false);
  const documentVisible = useDocumentVisibility();
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useGetMe();
  // Fallback identity from the stored token, so a slow or failing GET
  // /users/me cannot blank out the profile, plan and role switcher.
  const sessionClaims = useMemo(() => readSessionClaims(), []);
  const signedIn = Boolean(me) || Boolean(sessionClaims);
  const currentRole =
    me?.activeRole ?? me?.role ?? sessionClaims?.role ?? "student";
  const { language, setLanguage, copy } = useAuthLanguage();
  const { data: accountPreferences } = useUserPreferences(Boolean(me));
  const updateAccountPreferences = useUpdateUserPreferences();
  const { data: notifications } = useGetRecentActivity({
    query: {
      enabled: signedIn && secondaryDataReady,
      queryKey: getGetRecentActivityQueryKey(),
    },
  });
  const [classInvitations, setClassInvitations] = useState<ClassInvitation[]>(
    [],
  );
  // Shared with the profile page's plan card, so the two can never disagree
  // about whether this account is Free, Plus, Pro or an administrator.
  const plan = usePlan(signedIn && isDesktop && secondaryDataReady);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!isDesktop) return;
    if ("requestIdleCallback" in window) {
      const requestId = window.requestIdleCallback(
        () => setAmbientReady(true),
        { timeout: 3_000 },
      );
      return () => window.cancelIdleCallback(requestId);
    }
    const timer = globalThis.setTimeout(() => setAmbientReady(true), 1_500);
    return () => globalThis.clearTimeout(timer);
  }, [isDesktop]);
  useEffect(() => {
    setSecondaryDataReady(false);
    if (!signedIn) return;
    if ("requestIdleCallback" in window) {
      const requestId = window.requestIdleCallback(
        () => setSecondaryDataReady(true),
        { timeout: 1_200 },
      );
      return () => window.cancelIdleCallback(requestId);
    }
    const timer = globalThis.setTimeout(() => setSecondaryDataReady(true), 500);
    return () => globalThis.clearTimeout(timer);
  }, [me?.id, signedIn]);

  const activeNotificationRole = me?.activeRole ?? me?.role ?? "student";
  const notificationReadKey = `schoolar_read_notifications:${me?.id ?? "guest"}:${activeNotificationRole}`;
  const [readNotificationIds, setReadNotificationIds] = useState<number[]>([]);
  useEffect(() => {
    if (accountPreferences && accountPreferences.userId === me?.id) {
      let locallyRead: number[] = [];
      try {
        locallyRead = JSON.parse(
          localStorage.getItem(notificationReadKey) ?? "[]",
        );
      } catch {
        locallyRead = [];
      }
      const next = accountPreferences.readNotificationIds.length
        ? accountPreferences.readNotificationIds
        : locallyRead;
      setReadNotificationIds(next);
      if (!accountPreferences.readNotificationIds.length && locallyRead.length)
        updateAccountPreferences.mutate({ readNotificationIds: locallyRead });
      return;
    }
    try {
      setReadNotificationIds(
        JSON.parse(localStorage.getItem(notificationReadKey) ?? "[]"),
      );
    } catch {
      setReadNotificationIds([]);
    }
  }, [accountPreferences, me?.id, notificationReadKey]);
  const safeNotifications = Array.isArray(notifications) ? notifications : [];
  const unreadNotifications = safeNotifications.filter(
    (item) => !readNotificationIds.includes(item.id),
  );
  useEffect(() => {
    if (!me || !secondaryDataReady || !documentVisible) {
      setClassInvitations([]);
      return;
    }
    let active = true;
    const loadInvitations = () =>
      classRequest<ClassInvitation[]>("/class-invitations")
        .then((rows) => {
          // Rows are rendered as invitation.class.name and
          // invitation.inviter.name, so a row missing either would throw
          // during render and, with no boundary below this, blank the app.
          // Drop anything that cannot be displayed rather than trusting it.
          if (active) {
            setClassInvitations(
              (Array.isArray(rows) ? rows : []).filter(
                (row) =>
                  row?.id != null && row.class?.name && row.inviter?.name,
              ),
            );
          }
        })
        .catch(() => undefined);
    void loadInvitations();
    const interval = window.setInterval(loadInvitations, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [documentVisible, me?.id, secondaryDataReady]);
  async function respondToClassInvitation(
    invitation: ClassInvitation,
    action: "accept" | "decline",
  ) {
    try {
      await classRequest(`/class-invitations/${invitation.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      setClassInvitations((current) =>
        current.filter((item) => item.id !== invitation.id),
      );
      await queryClient.invalidateQueries({
        queryKey: getListClassesQueryKey(),
      });
      toast({
        title: action === "accept" ? "Class joined" : "Invitation declined",
        description: invitation.class.name,
      });
    } catch (error) {
      toast({
        title: "Could not update invitation",
        description:
          error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    }
  }
  function markNotificationRead(id: number) {
    setReadNotificationIds((current) => {
      const next = current.includes(id) ? current : [...current, id];
      localStorage.setItem(notificationReadKey, JSON.stringify(next));
      updateAccountPreferences.mutate({ readNotificationIds: next });
      return next;
    });
  }
  const { data: sidebarGoals } = useListLearningGoals({
    query: {
      enabled: signedIn && isDesktop && secondaryDataReady,
      queryKey: getListLearningGoalsQueryKey(),
    },
  });
  const updateSidebarGoal = useUpdateLearningGoal();
  const [expandedPaths, setExpandedPaths] = useState<number[]>([]);
  const [ambientStyle, setAmbientStyle] = useState<VantaStyle>(() => {
    const saved =
      sessionStorage.getItem("schoolar_ambient_style") ??
      localStorage.getItem("schoolar_ambient_style");
    if (
      saved === "off" ||
      saved === "net" ||
      saved === "globe" ||
      saved === "halo" ||
      saved === "cells" ||
      saved === "rings" ||
      saved === "topology"
    )
      return saved;
    return localStorage.getItem("schoolar_ambient_motion") === "off"
      ? "off"
      : "net";
  });
  const [ambientIntensity, setAmbientIntensity] = useState(() => {
    const saved = Number(
      sessionStorage.getItem("schoolar_ambient_intensity") ??
        localStorage.getItem("schoolar_ambient_intensity") ??
        "1",
    );
    return Number.isFinite(saved) ? Math.min(2, Math.max(0.5, saved)) : 1;
  });
  const [lightToolbarText, setLightToolbarText] = useState(() =>
    shouldUseLightToolbarText(),
  );
  const [lightPageText, setLightPageText] = useState(() =>
    shouldUseLightPageText(isDesktop ? ambientStyle : "off", ambientIntensity),
  );
  useEffect(() => {
    if (!accountPreferences) return;
    const migrationPatch: UserPreferencesPatch = {};
    if (accountPreferences.language && accountPreferences.language !== language)
      setLanguage(accountPreferences.language);
    else if (!accountPreferences.language) migrationPatch.language = language;
    if (accountPreferences.ambientStyle) {
      setAmbientStyle(accountPreferences.ambientStyle);
      localStorage.setItem(
        "schoolar_ambient_style",
        accountPreferences.ambientStyle,
      );
    }
    if (accountPreferences.ambientIntensity != null) {
      setAmbientIntensity(accountPreferences.ambientIntensity);
      localStorage.setItem(
        "schoolar_ambient_intensity",
        String(accountPreferences.ambientIntensity),
      );
    }
    const localStyle = localStorage.getItem(
      "schoolar_ambient_style",
    ) as VantaStyle | null;
    if (!accountPreferences.ambientStyle && localStyle)
      migrationPatch.ambientStyle = localStyle;
    const localIntensity = Number(
      localStorage.getItem("schoolar_ambient_intensity"),
    );
    if (
      accountPreferences.ambientIntensity == null &&
      Number.isFinite(localIntensity) &&
      localIntensity >= 0.5 &&
      localIntensity <= 2
    )
      migrationPatch.ambientIntensity = localIntensity;
    if (Object.keys(migrationPatch).length)
      updateAccountPreferences.mutate(migrationPatch);
  }, [accountPreferences]);
  useEffect(() => {
    const updateContrast = () => {
      setLightToolbarText(shouldUseLightToolbarText());
      setLightPageText(
        shouldUseLightPageText(
          isDesktop ? ambientStyle : "off",
          ambientIntensity,
        ),
      );
    };
    updateContrast();
    const observer = new MutationObserver(updateContrast);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => observer.disconnect();
  }, [ambientIntensity, ambientStyle, isDesktop]);

  function chooseAmbientIntensity(value: number) {
    setAmbientIntensity(value);
    const saved = String(value);
    localStorage.setItem("schoolar_ambient_intensity", saved);
    sessionStorage.setItem("schoolar_ambient_intensity", saved);
    updateAccountPreferences.mutate({ ambientIntensity: value });
  }
  function chooseAmbientStyle(value: string) {
    const next = value as VantaStyle;
    setAmbientStyle(next);
    localStorage.setItem("schoolar_ambient_style", next);
    sessionStorage.setItem("schoolar_ambient_style", next);
    updateAccountPreferences.mutate({ ambientStyle: next });
  }
  async function updatePath(
    goal: NonNullable<typeof sidebarGoals>[number],
    pathSteps: typeof goal.pathSteps,
  ) {
    await updateSidebarGoal.mutateAsync({ id: goal.id, data: { pathSteps } });
    await queryClient.invalidateQueries({
      queryKey: getListLearningGoalsQueryKey(),
    });
  }
  const isTeacher = (me?.activeRole ?? me?.role) === UserRole.teacher;
  const isAdmin = me?.role === UserRole.admin;
  const hasUnlimitedUsage = plan.unlimited;
  const aiSearchUsed = plan.aiSearch.used;
  const aiSearchLimit = plan.aiSearch.limit ?? 0;
  const deepResearchUsed = plan.deepResearch.used;
  const deepResearchLimit = plan.deepResearch.limit ?? 0;
  const navItems = isAdmin
    ? [...NAV_ITEMS, { label: "Admin", href: "/admin", icon: ShieldCheck }]
    : NAV_ITEMS;
  const currentNavItem = navItems.find(
    (item) => location === item.href || location.startsWith(item.href + "/"),
  );
  const currentNavLabel = currentNavItem
    ? language === "tr"
      ? (NAV_LABELS_TR[currentNavItem.label] ?? currentNavItem.label)
      : currentNavItem.label
    : "Casparel";

  // Real Google Classroom status, only fetched for teachers
  const { data: gcStatus, isLoading: gcStatusLoading } = useGetGCStatus({
    query: {
      enabled: isTeacher && isDesktop && secondaryDataReady,
      queryKey: getGetGCStatusQueryKey(),
    },
  });

  // Lazy auth URL fetch, only triggered on demand
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
    clearSession();
    applyDefaultColors();
    queryClient.clear();
    const configuredBase = import.meta.env.BASE_URL;
    const basePath = configuredBase.endsWith("/")
      ? configuredBase.slice(0, -1)
      : configuredBase;
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
      // The Android shell owns a second, secure copy of the token. Tell it
      // about the replacement before reloading, otherwise its preload script
      // restores the previous role token and silently undoes the switch.
      notifySessionChanged();
      queryClient.clear();
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
          <CheckCircle2
            size={13}
            className="text-primary-foreground shrink-0"
          />
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

  // Role switcher, shown when user data is loaded
  const roleSwitcher = signedIn ? (
    <div className="flex items-center gap-2 w-full" data-testid="role-switcher">
      <UserCog size={13} className="text-primary-foreground/60 shrink-0" />
      <Select
        value={
          currentRole === UserRole.teacher
            ? RoleSwitchInputRole.teacher
            : RoleSwitchInputRole.student
        }
        onValueChange={handleRoleSwitch}
        disabled={switchRoleMutation.isPending}
      >
        <SelectTrigger
          /*
            supports-[backdrop-filter]:bg-transparent as well as
            bg-transparent, because one of them was not enough.

            SelectTrigger's own classes are `bg-card/90` and
            `supports-[backdrop-filter]:bg-card/80`. tailwind-merge drops the
            first when this passes bg-transparent -- they conflict -- and keeps
            the second, because a class with a variant and a class without one
            are not the same utility as far as it is concerned. So the variant
            survived and won, and this trigger painted itself near-white while
            its text stayed primary-foreground/80. Near-white on near-white, on
            the control that switches between being a teacher and being a
            student.
          */
          className="h-7 text-xs bg-transparent supports-[backdrop-filter]:bg-transparent border-primary-foreground/30 text-primary-foreground/80 hover:bg-primary-foreground/10 focus:ring-0 focus:ring-offset-0 px-2"
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
      <div className="app-shell-frame fixed inset-0 flex w-full overflow-hidden">
        {/* Sidebar */}
        <aside className="sidebar-scrollbar-hidden hidden min-h-0 w-64 shrink-0 self-stretch flex-col overflow-x-hidden overflow-y-auto overscroll-contain bg-primary text-primary-foreground md:flex app-nav-surface">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 border-b border-primary-foreground/20 px-5 py-5 transition-opacity hover:opacity-80"
            aria-label="Casparel home"
          >
            <BrandIcon className="h-10 w-10" />
            <span className="font-bold text-lg tracking-tight">Casparel</span>
          </Link>

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
          <section
            className="border-t border-primary-foreground/20 px-3 py-3"
            data-testid="sidebar-paths"
          >
            <div className="mb-2 flex items-center justify-between px-2">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
                <Target size={14} /> Paths
              </span>
              <Link
                href="/goals"
                className="text-[10px] text-primary-foreground/70 hover:underline"
              >
                Edit all
              </Link>
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {(Array.isArray(sidebarGoals) ? sidebarGoals : [])
                .filter((goal) => goal.status === "active")
                .map((goal) => {
                  const expanded = expandedPaths.includes(goal.id);
                  return (
                    <div
                      key={goal.id}
                      className="rounded-md bg-primary-foreground/10"
                    >
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-2 py-2 text-left text-xs font-medium"
                        onClick={() =>
                          setExpandedPaths((current) =>
                            expanded
                              ? current.filter((id) => id !== goal.id)
                              : [...current, goal.id],
                          )
                        }
                      >
                        {expanded ? (
                          <ChevronDown size={13} />
                        ) : (
                          <ChevronRight size={13} />
                        )}
                        {/*
                          A goal's title is what its owner typed. The bridge
                          rewrites whole strings it recognises, so a path
                          called "Practice" or "Canvas" would be silently
                          translated into somebody's own sidebar.
                        */}
                        <span
                          translate="no"
                          className="min-w-0 flex-1 truncate"
                        >
                          {goal.title}
                        </span>
                        <span className="text-[10px] text-primary-foreground/60">
                          {
                            goal.pathSteps.filter((step) => step.completed)
                              .length
                          }
                          /{goal.pathSteps.length}
                        </span>
                      </button>
                      {expanded && (
                        <div className="space-y-1 px-2 pb-2">
                          {goal.pathSteps.map((step) => (
                            <div
                              key={step.id}
                              className="flex items-center gap-1.5"
                            >
                              <button
                                type="button"
                                aria-label={`${step.completed ? "Undo" : "Complete"} ${step.title}`}
                                className={cn(
                                  "flex size-5 shrink-0 items-center justify-center rounded border border-primary-foreground/40",
                                  step.completed && "bg-emerald-500 text-white",
                                )}
                                onClick={() =>
                                  updatePath(
                                    goal,
                                    goal.pathSteps.map((item) =>
                                      item.id === step.id
                                        ? {
                                            ...item,
                                            completed: !item.completed,
                                          }
                                        : item,
                                    ),
                                  )
                                }
                              >
                                {step.completed && <Check size={12} />}
                              </button>
                              <Input
                                defaultValue={step.title}
                                aria-label={`Edit ${step.title}`}
                                className={cn(
                                  "h-7 border-primary-foreground/25 bg-transparent px-2 text-[11px] text-primary-foreground",
                                  step.completed && "line-through opacity-65",
                                )}
                                onBlur={(event) => {
                                  const title =
                                    event.currentTarget.value.trim();
                                  if (title && title !== step.title)
                                    updatePath(
                                      goal,
                                      goal.pathSteps.map((item) =>
                                        item.id === step.id
                                          ? { ...item, title }
                                          : item,
                                      ),
                                    );
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              {Array.isArray(sidebarGoals) &&
                !sidebarGoals.some((goal) => goal.status === "active") && (
                  <Link
                    href="/goals"
                    className="block rounded-md px-2 py-2 text-xs text-primary-foreground/65 hover:bg-primary-foreground/10"
                  >
                    Resume a goal to show its path.
                  </Link>
                )}
            </div>
          </section>

          {/* Footer */}
          <div className="shrink-0 space-y-2 border-t border-primary-foreground/20 px-4 py-4">
            {meLoading ? (
              <div className="flex items-center gap-2.5 mb-2">
                <Skeleton className="w-8 h-8 rounded-full bg-primary-foreground/20" />
                <div className="space-y-1 flex-1">
                  <Skeleton className="h-3.5 w-24 bg-primary-foreground/20" />
                  <Skeleton className="h-3 w-16 bg-primary-foreground/20" />
                </div>
              </div>
            ) : !me && signedIn ? (
              // Profile details could not be loaded, still give a way in
              // rather than silently dropping the whole block.
              <Link
                href="/profile"
                className="flex items-center gap-2.5 mb-2 group"
                data-testid="sidebar-profile-fallback"
              >
                <div className="w-8 h-8 rounded-full bg-primary-foreground/20 flex items-center justify-center shrink-0">
                  <User size={15} />
                </div>
                <p className="text-sm font-semibold text-primary-foreground truncate group-hover:underline">
                  My profile
                </p>
              </Link>
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
                  {/* A person's name, not copy: never translated. */}
                  <p
                    translate="no"
                    className="text-sm font-semibold text-primary-foreground truncate group-hover:underline"
                  >
                    {me.name}
                  </p>
                </div>
              </Link>
            ) : null}

            {signedIn ? (
              <div
                className="rounded-lg border border-primary-foreground/20 bg-primary-foreground/10 p-3"
                data-testid="sidebar-plan-usage"
              >
                <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
                  <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-semibold">
                    <Gauge size={13} /> Current plan
                  </span>
                  <span className="min-w-0 truncate rounded-full bg-primary-foreground/15 px-2 py-0.5 text-[10px] font-semibold">
                    {plan.label}
                  </span>
                </div>
                <div className="space-y-2 text-[11px] text-primary-foreground/75">
                  <div>
                    <div className="flex justify-between">
                      <span>AI fallback</span>
                      <span>
                        {hasUnlimitedUsage
                          ? "Unlimited"
                          : aiSearchLimit > 0
                            ? `${aiSearchUsed} / ${aiSearchLimit}`
                            : "Not included"}
                      </span>
                    </div>
                    {!hasUnlimitedUsage && aiSearchLimit > 0 ? (
                      <div className="mt-1 h-1 overflow-hidden rounded bg-primary-foreground/15">
                        <div
                          className="h-full rounded bg-primary-foreground/70"
                          style={{
                            width:
                              Math.min(
                                100,
                                (aiSearchUsed / aiSearchLimit) * 100,
                              ) + "%",
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <div className="flex justify-between">
                      <span>Deep research</span>
                      <span>
                        {hasUnlimitedUsage
                          ? "Unlimited"
                          : deepResearchLimit > 0
                            ? `${deepResearchUsed} / ${deepResearchLimit}`
                            : "Not included"}
                      </span>
                    </div>
                    {!hasUnlimitedUsage && deepResearchLimit > 0 ? (
                      <div className="mt-1 h-1 overflow-hidden rounded bg-primary-foreground/15">
                        <div
                          className="h-full rounded bg-primary-foreground/70"
                          style={{
                            width:
                              Math.min(
                                100,
                                (deepResearchUsed / deepResearchLimit) * 100,
                              ) + "%",
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
                <p className="mt-2 text-[10px] text-primary-foreground/55">
                  {hasUnlimitedUsage
                    ? "No account-level AI limits"
                    : plan.level === "free"
                      ? "Free includes a small AI taste"
                      : "AI allowances reset daily"}
                </p>
                {/* Plans lives here, inside the current-plan card, not in
                    the nav tabs: it is an account concern, and this way every
                    tier (admins and Pro included) keeps a visible way to the
                    plans page. */}
                <Link
                  href="/plans"
                  className="mt-2 flex items-center justify-center gap-1.5 rounded-md bg-primary-foreground/15 px-2 py-1.5 text-[11px] font-semibold hover:bg-primary-foreground/25"
                  data-testid="sidebar-upgrade"
                >
                  <Sparkles size={12} />{" "}
                  {plan.tier === "administrator" || plan.level === "pro"
                    ? "View plans"
                    : plan.level === "plus"
                      ? "Upgrade to Pro"
                      : "See plans"}
                </Link>
              </div>
            ) : null}

            {/* Role switcher */}
            {roleSwitcher}

            {/* Google Classroom connect, real OAuth, teachers only */}
            {gcWidget}

            <div
              className="px-2 py-1 [&_select]:border-primary-foreground/30 [&_select]:bg-transparent [&_select]:text-primary-foreground"
              data-testid="sidebar-language"
            >
              <AuthLanguageSelect
                language={language}
                label={copy.language}
                className="w-full text-primary-foreground/80 [&_select]:min-w-0 [&_select]:flex-1"
                onChange={(next) => {
                  setLanguage(next);
                  void updateAccountPreferences
                    .mutateAsync({ language: next })
                    .finally(() => window.location.reload());
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
          <footer className="mt-auto shrink-0 border-t border-primary-foreground/15 px-5 py-3 text-center text-[10px] text-primary-foreground/55">
            © 2026 Casparel
          </footer>
        </aside>

        {/* Mobile top bar */}
        <div className="fixed inset-x-0 top-0 z-50 flex h-14 items-center gap-2 bg-primary px-2 text-primary-foreground md:hidden app-nav-surface">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="shrink-0 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                aria-label="Open navigation"
              >
                <Menu size={20} />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-[min(22rem,88vw)] border-primary-foreground/20 bg-primary p-0 text-primary-foreground [&>button]:text-primary-foreground app-nav-surface"
            >
              <div className="flex h-full min-h-0 flex-col">
                <SheetHeader className="shrink-0 border-b border-primary-foreground/20 px-5 py-4 text-left">
                  <SheetTitle className="text-primary-foreground">
                    <Link
                      href="/"
                      onClick={() => setMobileNavOpen(false)}
                      className="flex items-center gap-3 transition-opacity hover:opacity-80"
                      aria-label="Casparel home"
                    >
                      <BrandIcon className="h-9 w-9" />
                      <span>Casparel</span>
                    </Link>
                  </SheetTitle>
                </SheetHeader>
                <nav
                  className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3"
                  aria-label="Mobile navigation"
                >
                  {navItems.map(({ label, href, icon: Icon }) => {
                    const isActive =
                      location === href || location.startsWith(href + "/");
                    const displayLabel =
                      language === "tr"
                        ? (NAV_LABELS_TR[label] ?? label)
                        : label;
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMobileNavOpen(false)}
                        className={cn(
                          "flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-accent text-accent-foreground"
                            : "text-primary-foreground/85 hover:bg-primary-foreground/10 hover:text-primary-foreground",
                        )}
                      >
                        <Icon size={18} className="shrink-0" />
                        <span className="truncate">{displayLabel}</span>
                      </Link>
                    );
                  })}
                </nav>
                <div className="sidebar-scrollbar-hidden max-h-[42dvh] shrink-0 space-y-2 overflow-y-auto border-t border-primary-foreground/20 p-4">
                  {me ? (
                    <Link
                      href="/profile"
                      onClick={() => setMobileNavOpen(false)}
                      className="mb-3 flex items-center gap-3 rounded-md px-2 py-2 hover:bg-primary-foreground/10"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-foreground/20">
                        {me.avatarUrl ? (
                          <img
                            src={me.avatarUrl}
                            alt=""
                            className="size-full object-cover"
                          />
                        ) : (
                          <User size={17} />
                        )}
                      </span>
                      <span
                        translate="no"
                        className="min-w-0 truncate text-sm font-semibold"
                      >
                        {me.name}
                      </span>
                    </Link>
                  ) : null}
                  {me ? (
                    <Select
                      value={
                        me.activeRole ??
                        (me.role === UserRole.teacher
                          ? RoleSwitchInputRole.teacher
                          : RoleSwitchInputRole.student)
                      }
                      onValueChange={handleRoleSwitch}
                      disabled={switchRoleMutation.isPending}
                    >
                      <SelectTrigger
                        className="h-10 border-primary-foreground/30 bg-transparent text-primary-foreground"
                        data-testid="mobile-role-select"
                      >
                        <UserCog size={16} className="mr-2" />
                        <SelectValue />
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
                  ) : null}
                  <div className="px-1 [&_select]:border-primary-foreground/30 [&_select]:bg-transparent [&_select]:text-primary-foreground">
                    <AuthLanguageSelect
                      language={language}
                      label={copy.language}
                      className="w-full text-primary-foreground/85 [&_select]:min-w-0 [&_select]:flex-1"
                      onChange={(next) => {
                        setLanguage(next);
                        void updateAccountPreferences
                          .mutateAsync({ language: next })
                          .finally(() => window.location.reload());
                      }}
                    />
                  </div>
                  <ThemeCustomizer
                    accountId={me?.id}
                    showLabel
                    className="w-full justify-start px-2 text-primary-foreground/85 hover:bg-primary-foreground/10 hover:text-primary-foreground"
                  />
                  <Button
                    variant="ghost"
                    className="w-full justify-start px-2 text-primary-foreground/85 hover:bg-primary-foreground/10 hover:text-primary-foreground"
                    onClick={handleLogout}
                    data-testid="mobile-logout-button"
                  >
                    <LogOut size={17} className="mr-2" /> Logout
                  </Button>
                  <p className="border-t border-primary-foreground/15 pt-3 text-center text-[10px] text-primary-foreground/55">
                    © 2026 Casparel
                  </p>
                </div>
              </div>
            </SheetContent>
          </Sheet>
          <Link href="/" aria-label="Casparel home" className="shrink-0">
            <BrandIcon className="h-8 w-8" label="Casparel" />
          </Link>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {currentNavLabel}
          </span>
        </div>

        {/* The ambient background is a sibling of the scrolling main region.
            Keeping it outside the scroller prevents an anchor jump from
            exposing the end of Vanta's canvas at the bottom of a page. */}
        {isDesktop && ambientReady && ambientStyle !== "off" ? (
          <Suspense fallback={null}>
            <VantaBackground
              style={ambientStyle}
              intensity={ambientIntensity}
            />
          </Suspense>
        ) : null}

        {/* Main content */}
        <main className="relative min-w-0 flex-1 overflow-auto bg-background pt-14 text-foreground md:pt-0">
          <div
            className="sticky top-0 z-40 flex h-11 items-center justify-end gap-1 border-b bg-background/90 px-2 backdrop-blur md:h-12 md:px-4"
            style={
              {
                "--foreground": lightToolbarText ? "0 0% 100%" : "0 0% 0%",
                "--muted-foreground": lightToolbarText
                  ? "0 0% 82%"
                  : "0 0% 28%",
              } as CSSProperties
            }
            data-testid="notification-bar"
          >
            <Select value={ambientStyle} onValueChange={chooseAmbientStyle}>
              <SelectTrigger
                // w-44, not w-36: sized for "Off" it clipped "Desactivado"
                // to "Desactivadc" on every Spanish page, and German and
                // Portuguese are longer still.
                className="hidden h-9 w-44 border-0 bg-transparent md:flex"
                data-testid="ambient-style-select"
              >
                <Waves size={16} className="mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off</SelectItem>
                <SelectItem value="net">Net</SelectItem>
                <SelectItem value="globe">Globe</SelectItem>
                <SelectItem value="halo">Halo</SelectItem>
                <SelectItem value="cells">Cells</SelectItem>
                <SelectItem value="rings">Rings</SelectItem>
                <SelectItem value="topology">Topology</SelectItem>
              </SelectContent>
            </Select>
            <label
              className="hidden items-center gap-2 px-2 text-xs text-muted-foreground md:flex"
              title="Background animation intensity"
            >
              <span className="sr-only sm:not-sr-only">Intensity</span>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.25"
                value={ambientIntensity}
                onChange={(event) =>
                  chooseAmbientIntensity(Number(event.target.value))
                }
                className="h-1.5 w-16 cursor-pointer accent-primary sm:w-24"
                aria-label="Background animation intensity"
                data-testid="ambient-intensity-slider"
              />
            </label>
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
                  {unreadNotifications.length + classInvitations.length > 0 && (
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
                  {!safeNotifications.length && !classInvitations.length ? (
                    <p className="p-4 text-center text-sm text-muted-foreground">
                      {language === "tr"
                        ? "Yeni bildirim yok"
                        : "No updates yet"}
                    </p>
                  ) : (
                    <>
                      {classInvitations.map((invitation) => (
                        <div
                          key={`invite-${invitation.id}`}
                          className="mb-2 border bg-muted/30 p-3"
                          style={{ borderRadius: 8 }}
                        >
                          <p className="text-sm font-semibold">
                            {invitation.class.name}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {invitation.inviter.name} invited you as a{" "}
                            {invitation.role}.
                          </p>
                          <div className="mt-3 flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1"
                              onClick={() =>
                                void respondToClassInvitation(
                                  invitation,
                                  "accept",
                                )
                              }
                            >
                              <Check className="mr-1.5 size-3.5" />
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() =>
                                void respondToClassInvitation(
                                  invitation,
                                  "decline",
                                )
                              }
                            >
                              <X className="mr-1.5 size-3.5" />
                              Decline
                            </Button>
                          </div>
                        </div>
                      ))}
                      {safeNotifications.map((item) => (
                        <Link
                          key={item.id}
                          href={
                            item.type === "schedule"
                              ? "/schedule"
                              : item.type === "class"
                                ? "/classes"
                                : "/dashboard"
                          }
                          onClick={() => markNotificationRead(item.id)}
                          className="block rounded-lg p-3 hover:bg-muted"
                        >
                          <p className="text-sm">{item.message}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {new Date(item.createdAt).toLocaleString(
                              intlLocale(language),
                            )}
                          </p>
                        </Link>
                      ))}
                    </>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div
            className="ambient-copy-contrast relative z-10"
            style={
              {
                "--foreground": lightPageText ? "0 0% 100%" : "225 21.1% 7.5%",
                // 93%, not 82%, when the page is painted over the ambient.
                //
                // Measured rather than guessed: with the default effect the
                // backdrop behind body copy sits around rgb(103,109,104), and
                // 82% lightness against it is 3.47:1 -- under the 4.5:1 that
                // WCAG AA asks for normal-size text. 93% measures 4.53:1. The
                // secondary text on every page is this colour, including the
                // sentence under each page title, so it was the most-read text
                // in the app and the least legible.
                //
                // Muted stays visibly quieter than --foreground at 100%, which
                // is the distinction this token exists to make; there is simply
                // less room for it over a mid-tone backdrop than over a white
                // one. Below AA is not a place that distinction can be bought
                // from.
                //
                // This does not rescue a glyph that a bright mesh line happens
                // to pass behind: those pixels sweep the whole range, so no
                // text colour clears them. That needs the effect kept off the
                // area behind copy, which is a change to how the page looks.
                "--muted-foreground": lightPageText ? "0 0% 93%" : "0 0% 28%",
              } as CSSProperties
            }
          >
            {children}
            {/* One compact sponsored block at the end of the page's own
                content: inline, scrolls with the page, and never over the
                navigation. Sensitive and editing-heavy routes are excluded by
                pathAllowsWebAd, so this single mount covers every screen. */}
            <InlineAd />
          </div>
        </main>
      </div>
    </>
  );
}
const NAV_LABELS_TR: Record<string, string> = {
  Dashboard: "Ana Sayfa",
  Goals: "Hedefler",
  Activities: "Etkinlikler",
  Resources: "Kaynaklar",
  Catalog: "Katalog",
  People: "Kişiler",
  Classes: "Sınıflar",
  Lists: "Listeler",
  Schedule: "Takvim",
  Settings: "Ayarlar",
};
