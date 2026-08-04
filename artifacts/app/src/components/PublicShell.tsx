import { ReactNode } from 'react';
import { Link } from 'wouter';
import BrandIcon from './BrandIcon';
import { Button } from '@workspace/edu-ds/components/ui/button';
import ThemeCustomizer from './ThemeCustomizer';

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
            <BrandIcon className="h-14 w-28" label="Schoolar" />
            <span className="font-bold text-lg tracking-tight">Schoolar</span>
          </Link>

          {/* Auth actions */}
          <div className="flex items-center gap-2">
            <ThemeCustomizer className="text-foreground hover:bg-accent" />
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
