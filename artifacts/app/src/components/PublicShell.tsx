import { ReactNode } from "react";
import { Link } from "wouter";
import BrandIcon from "./BrandIcon";
import { Button } from "@workspace/edu-ds/components/ui/button";

interface PublicShellProps {
  children: ReactNode;
}

export default function PublicShell({ children }: PublicShellProps) {
  return (
    <div className="flex flex-col min-h-[100dvh] bg-background">
      {/* Top nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-3 sm:gap-4 sm:px-4">
          {/* Logo */}
          <Link
            href="/resources"
            className="flex min-w-0 items-center text-primary transition-opacity hover:opacity-80"
          >
            <BrandIcon className="h-11 w-20 shrink-0 sm:h-14 sm:w-28" label="Casparel" />
            <span className="hidden font-bold text-lg tracking-tight sm:inline">Casparel</span>
          </Link>

          {/* Auth actions */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/auth/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/auth/register">
                <span className="sm:hidden">Join</span>
                <span className="hidden sm:inline">Create account</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
