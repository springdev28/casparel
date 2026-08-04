import { ReactNode, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
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
} from 'lucide-react';
import { cn } from '@workspace/edu-ds/lib/utils';
import { Button } from '@workspace/edu-ds/components/ui/button';
import { Skeleton } from '@workspace/edu-ds/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/edu-ds/components/ui/select';
import {
  useGetMe,
  useGetGCStatus,
  useGetGCAuthUrl,
  useDisconnectGoogle,
  useSwitchRole,
  getGetMeQueryKey,
  getGetGCStatusQueryKey,
  getGetGCAuthUrlQueryKey,
  UserRole,
  RoleSwitchInputRole,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@workspace/edu-ds/hooks/use-toast';
import ThemeCustomizer from './ThemeCustomizer';
import BrandIcon from './BrandIcon';

const TOKEN_KEY = 'schooler_token';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Goals', href: '/goals', icon: Target },
  { label: 'Resources', href: '/resources', icon: BookOpen },
  { label: 'People', href: '/people', icon: Users },
  { label: 'Classes', href: '/classes', icon: Users },
  { label: 'Lists', href: '/lists', icon: List },
  { label: 'Schedule', href: '/schedule', icon: Calendar },
];

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useGetMe();
  const isTeacher = me?.role === UserRole.teacher;

  // Real Google Classroom status — only fetched for teachers
  const { data: gcStatus, isLoading: gcStatusLoading } = useGetGCStatus({
    query: { enabled: isTeacher, queryKey: getGetGCStatusQueryKey() },
  });

  // Lazy auth URL fetch — only triggered on demand
  const { data: gcAuthUrlData, refetch: fetchAuthUrl, isFetching: authUrlFetching } =
    useGetGCAuthUrl({ query: { enabled: false, queryKey: getGetGCAuthUrlQueryKey() } });

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
    setLocation('/resources');
  }

  async function handleGcConnect() {
    try {
      await fetchAuthUrl();
    } catch {
      toast({
        title: 'Could not start Google authorization',
        description: 'Please try again or connect from the Classes page.',
        variant: 'destructive',
      });
    }
  }

  async function handleGcDisconnect() {
    try {
      await disconnectGoogle.mutateAsync();
      queryClient.invalidateQueries({ queryKey: getGetGCStatusQueryKey() });
      toast({ title: 'Google Classroom disconnected' });
    } catch {
      toast({ title: 'Error', description: 'Could not disconnect Google Classroom', variant: 'destructive' });
    }
  }

  async function handleRoleSwitch(newRole: string) {
    try {
      const result = await switchRoleMutation.mutateAsync({
        data: { role: newRole as RoleSwitchInputRole },
      });
      // Store the fresh token so subsequent requests carry the new role
      localStorage.setItem(TOKEN_KEY, result.token);
      // Invalidate the me query so all role-conditional UI re-renders
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({
        title: `Switched to ${newRole} mode`,
        description: newRole === 'teacher' ? 'Teacher tools are now active.' : 'Student view is now active.',
      });
    } catch {
      toast({ title: 'Error', description: 'Could not switch role. Please try again.', variant: 'destructive' });
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
        value={me.role}
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
            <BrandIcon className="h-14 w-28 text-primary-foreground" label="Schoolar" />
            <span className="font-bold text-lg tracking-tight">Schoolar</span>
          </div>

          {/* Nav */}
          <nav className="flex-1 py-4 px-3 space-y-1" aria-label="Main navigation">
            {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
              const isActive = location === href || location.startsWith(href + '/');
              return (
                <Link
                  key={href}
                  href={href}
                  aria-label={label}
                  title={label}
                  data-testid={`nav-${label.toLowerCase()}`}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground',
                  )}
                >
                  <Icon size={17} />
                  {label}
                </Link>
              );
            })}
          </nav>

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
              <Link href="/profile" className="flex items-center gap-2.5 mb-2 group">
                <div className="w-8 h-8 rounded-full bg-primary-foreground/20 flex items-center justify-center overflow-hidden shrink-0 group-hover:ring-2 group-hover:ring-primary-foreground/40 transition-all">
                  {me.avatarUrl ? (
                    <img src={me.avatarUrl} alt={me.name} className="w-full h-full object-cover" />
                  ) : (
                    <User size={16} className="text-primary-foreground/60" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-primary-foreground truncate group-hover:underline">{me.name}</p>
                </div>
              </Link>
            ) : null}

            {/* Role switcher */}
            {roleSwitcher}

            {/* Google Classroom connect — real OAuth, teachers only */}
            {gcWidget}

            <ThemeCustomizer
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
            <span className="hidden min-[400px]:inline font-bold">Schoolar</span>
          </div>
          <nav className="ml-2 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" aria-label="Mobile navigation">
            {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
              const isActive = location === href || location.startsWith(href + '/');
              return (
                <Link
                  key={href}
                  href={href}
                  aria-label={label}
                  title={label}
                  className={cn(
                    'shrink-0 p-2 rounded-md transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-primary-foreground/70 hover:bg-primary-foreground/10',
                  )}
                >
                  <Icon size={18} />
                </Link>
              );
            })}
            {/* Mobile role switcher — compact icon+select */}
            {me && (
              <Select
                value={me.role}
                onValueChange={handleRoleSwitch}
                disabled={switchRoleMutation.isPending}
              >
                <SelectTrigger
                  className="h-8 w-8 p-0 bg-transparent border-none text-primary-foreground/70 hover:bg-primary-foreground/10 focus:ring-0 focus:ring-offset-0 [&>svg]:hidden"
                  data-testid="mobile-role-select"
                  title={`Current role: ${me.role}`}
                >
                  <UserCog size={18} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={RoleSwitchInputRole.student}>Student</SelectItem>
                  <SelectItem value={RoleSwitchInputRole.teacher}>Teacher</SelectItem>
                </SelectContent>
              </Select>
            )}
            <ThemeCustomizer className="text-primary-foreground/70 hover:bg-primary-foreground/10" />
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
        <main className="flex-1 min-w-0 bg-background overflow-auto md:pt-0 pt-14">
          {children}
        </main>
      </div>
    </>
  );
}
