/**
 * @fileOverview Web UI role: provides the reusable Public Shell component or bridge.
 * System connection: consumed by pages or shells and kept separate to share presentation, accessibility, and interaction behavior.
 */
import { ReactNode } from "react";
import { Link } from "wouter";
import BrandIcon from "./BrandIcon";
import { Button } from "@workspace/edu-ds/components/ui/button";
import { useSystemDark } from "../hooks/use-system-dark";

interface PublicShellProps {
  children: ReactNode;
}

export default function PublicShell({ children }: PublicShellProps) {
  const dark = useSystemDark();
  return (
    <div
      className={`${dark ? "dark " : ""}flex flex-col min-h-[100dvh] bg-background text-foreground`}
      style={{ colorScheme: dark ? "dark" : "light" }}
    >
      {/* Top nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-3 sm:gap-4 sm:px-4">
          {/* Logo */}
          <Link
            href="/"
            className="flex min-w-0 items-center text-primary-text transition-opacity hover:opacity-80"
          >
            <BrandIcon className="mr-2 h-8 w-8 shrink-0 sm:h-9 sm:w-9" label="Casparel" />
            <span className="hidden font-bold text-lg tracking-tight text-foreground sm:inline">Casparel</span>
          </Link>

          {/* Auth actions */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/plans">Plans</Link>
            </Button>
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
