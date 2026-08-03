import { ReactNode, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import {
  LayoutDashboard,
  BookOpen,
  Users,
  List,
  Calendar,
  LogOut,
  GraduationCap,
  Link2,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@workspace/edu-ds/lib/utils';
import { Button } from '@workspace/edu-ds/components/ui/button';
import { Skeleton } from '@workspace/edu-ds/components/ui/skeleton';
import {
  useGetMe,
  useGetGCStatus,
  useGetGCAuthUrl,
  useDisconnectGoogle,
  getGetGCStatusQueryKey,
  getGetGCAuthUrlQueryKey,
  UserRole,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@workspace/edu-ds/hooks/use-toast';

const TOKEN_KEY = 'schooler_token';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Resources', href: '/resources', icon: BookOpen },
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

  // Build the sidebar GC widget (teachers only, when GC is configured)
  const gcWidget =
    isTeacher && gcStatus?.configured ? (
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
    ) : isTeacher && gcStatusLoading ? (
      <Skeleton className="h-6 w-40 bg-primary-foreground/20" />
    ) : null;

  return (
    <>
      <div className="flex min-h-[100dvh] w-full">
        {/* Sidebar */}
        <aside className="hidden md:flex flex-col w-56 shrink-0 bg-primary text-primary-foreground">
          {/* Logo */}
          <div className="flex items-center gap-2 px-5 py-5 border-b border-primary-foreground/20">
            <GraduationCap size={24} className="text-primary-foreground" />
            <span className="font-bold text-lg tracking-tight">Schooler</span>
          </div>

          {/* Nav */}
          <nav className="flex-1 py-4 px-3 space-y-1" aria-label="Main navigation">
            {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
              const isActive = location === href || location.startsWith(href + '/');
              return (
                <Link
                  key={href}
                  href={href}
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
              <div className="space-y-1.5 mb-2">
                <Skeleton className="h-4 w-28 bg-primary-foreground/20" />
                <Skeleton className="h-3 w-16 bg-primary-foreground/20" />
              </div>
            ) : me ? (
              <div className="mb-2">
                <p className="text-sm font-semibold text-primary-foreground truncate">{me.name}</p>
                <p className="text-xs text-primary-foreground/60 capitalize">{me.role}</p>
              </div>
            ) : null}

            {/* Google Classroom connect — real OAuth, teachers only */}
            {gcWidget}

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
            <GraduationCap size={20} />
            <span className="font-bold">Schooler</span>
          </div>
          <div className="flex items-center gap-1">
            {NAV_ITEMS.map(({ href, icon: Icon }) => {
              const isActive = location === href || location.startsWith(href + '/');
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'p-2 rounded-md transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-primary-foreground/70 hover:bg-primary-foreground/10',
                  )}
                >
                  <Icon size={18} />
                </Link>
              );
            })}
            <button
              onClick={handleLogout}
              className="p-2 rounded-md text-primary-foreground/70 hover:bg-primary-foreground/10"
              data-testid="mobile-logout-button"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>

        {/* Main content */}
        <main className="flex-1 min-w-0 bg-background overflow-auto md:pt-0 pt-14">
          {children}
        </main>
      </div>
    </>
  );
}
