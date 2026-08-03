import { ReactNode, useState } from 'react';
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
} from 'lucide-react';
import { cn } from '@workspace/edu-ds/lib/utils';
import { Button } from '@workspace/edu-ds/components/ui/button';
import { Skeleton } from '@workspace/edu-ds/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@workspace/edu-ds/components/ui/dialog';
import { useGetMe } from '@workspace/api-client-react';

const TOKEN_KEY = 'schooler_token';
const GC_KEY = 'schooler_gc_connected';

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
  const { data: me, isLoading: meLoading } = useGetMe();
  const [gcDialogOpen, setGcDialogOpen] = useState(false);
  const [gcConnected, setGcConnected] = useState(() => !!localStorage.getItem(GC_KEY));

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    setLocation('/resources');
  }

  function handleGcConnect() {
    // Stores connection flag locally — full OAuth wired in upcoming Google Classroom integration.
    localStorage.setItem(GC_KEY, '1');
    setGcConnected(true);
    setGcDialogOpen(false);
  }

  function handleGcDisconnect() {
    localStorage.removeItem(GC_KEY);
    setGcConnected(false);
  }

  const gcButton = gcConnected ? (
    <button
      onClick={handleGcDisconnect}
      className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs text-primary-foreground/70 hover:bg-primary-foreground/10 transition-colors"
      title="Disconnect Google Classroom"
    >
      <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
      <span className="truncate">Google Classroom linked</span>
    </button>
  ) : (
    <button
      onClick={() => setGcDialogOpen(true)}
      className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs text-primary-foreground/70 hover:bg-primary-foreground/10 transition-colors"
    >
      <Link2 size={13} className="shrink-0" />
      <span className="truncate">Connect Google Classroom</span>
    </button>
  );

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

            {/* Google Classroom connect */}
            {gcButton}

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

      {/* Google Classroom dialog */}
      <Dialog open={gcDialogOpen} onOpenChange={setGcDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              {/* Google Classroom "G" mark colours */}
              <div className="w-10 h-10 rounded-lg bg-[#1a73e8] flex items-center justify-center shrink-0">
                <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white" aria-hidden="true">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
                </svg>
              </div>
              <DialogTitle>Connect Google Classroom</DialogTitle>
            </div>
            <DialogDescription>
              Link your Google account to automatically sync your classes and share resources directly to your Google Classroom streams.
            </DialogDescription>
          </DialogHeader>
          <ul className="text-sm text-muted-foreground space-y-1.5 py-1">
            <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-500 shrink-0" /> Import your Google Classroom roster</li>
            <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-500 shrink-0" /> Share resource lists to your class stream</li>
            <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-500 shrink-0" /> Keep assignments in sync</li>
          </ul>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setGcDialogOpen(false)} className="sm:order-first">
              Cancel
            </Button>
            <Button onClick={handleGcConnect} className="bg-[#1a73e8] hover:bg-[#1557b0] text-white">
              Connect with Google
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
