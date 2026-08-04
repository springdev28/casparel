import { ReactNode } from 'react';
import { Link } from 'wouter';
import { GraduationCap } from 'lucide-react';
import { Button } from '@workspace/edu-ds/components/ui/button';

interface PublicShellProps {
  children: ReactNode;
}

export default function PublicShell({ children }: PublicShellProps) {
  return (
    <div className="flex flex-col min-h-[100dvh] bg-background">
      {/* Top nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/resources" className="flex items-center gap-2 text-primary hover:opacity-80 transition-opacity">
            <GraduationCap size={22} />
            <span className="font-bold text-lg tracking-tight">Schoolar</span>
          </Link>

          {/* Auth actions */}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/auth/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/auth/register">Create account</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 min-w-0">
        {children}
      </main>
    </div>
  );
}
