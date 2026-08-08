import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@workspace/edu-ds/components/ui/toaster";
import { TooltipProvider } from "@workspace/edu-ds/components/ui/tooltip";
import { Button } from "@workspace/edu-ds/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/edu-ds/components/ui/card";
import { Ban, Loader2, Mail, Trash2 } from "lucide-react";
import { Route, Switch, Router as WouterRouter, Redirect } from "wouter";
import { setAuthTokenGetter, useGetMe, UserRole } from "@workspace/api-client-react";

import { applyLastSavedColors } from "./components/ThemeCustomizer";
import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import DashboardPage from "./pages/AdaptiveDashboardPage";
import ResourcesPage from "./pages/ResourcesPage";
import ResourceDetailPage from "./pages/ResourceDetailPage";
import ClassesPage from "./pages/ClassesPage";
import ClassDetailPage from "./pages/ClassDetailPage";
import ListsPage from "./pages/ListsPage";
import ListDetailPage from "./pages/ListDetailPage";
import SchedulePage from "./pages/SchedulePage";
import ProfilePage from "./pages/ProfilePage";
import UserProfilePage from "./pages/UserProfilePage";
import PeoplePage from "./pages/PeoplePage";
import GoalsPage from "./pages/GoalsPage";
import AdminPage from "./pages/AdminPage";
import ForumPage from "./pages/ForumPage";
import ActivitiesPage from "./pages/ActivitiesPage";
import AppShell from "./components/AppShell";
import PublicShell from "./components/PublicShell";
import UiTranslationBridge from "./components/UiTranslationBridge";

const CanvasesPage = lazy(() => import("./pages/CanvasesPage"));
const CanvasPage = lazy(() => import("./pages/CanvasPage"));

const TOKEN_KEY = "schoolar_token";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

// Apply the most-recently-saved interface colors immediately so there is no
// flash of default colors while the /me response is in flight.
applyLastSavedColors();

// Migrate any existing token from the old key name
const _oldToken = localStorage.getItem("eduhub_token");
if (_oldToken && !localStorage.getItem(TOKEN_KEY)) {
  localStorage.setItem(TOKEN_KEY, _oldToken);
  localStorage.removeItem("eduhub_token");
}

// Set up auth token getter once at module level
setAuthTokenGetter(() => localStorage.getItem(TOKEN_KEY));

type AccountAccess = {
  banned: boolean;
  bannedAt: string | null;
  bannedReason: string | null;
  adminContact: string;
};

function apiUrl(path: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return base + "/api" + path;
}

function BannedAccountPage({ access }: { access: AccountAccess }) {
  const [deleting, setDeleting] = useState(false);

  async function deleteAccount() {
    if (!window.confirm("Permanently delete your account? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const response = await fetch(apiUrl("/users/me"), {
        method: "DELETE",
        headers: { Authorization: "Bearer " + localStorage.getItem(TOKEN_KEY) },
      });
      if (!response.ok) throw new Error("Account deletion failed");
      localStorage.removeItem(TOKEN_KEY);
      queryClient.clear();
      window.location.assign(import.meta.env.BASE_URL + "resources");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background p-4 text-foreground">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-2 flex size-11 items-center justify-center rounded-md bg-destructive/10 text-destructive">
            <Ban className="size-5" />
          </div>
          <CardTitle>Account banned</CardTitle>
          <p className="text-sm text-muted-foreground">
            {access.bannedReason || "This account has been restricted by an administrator."}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Button asChild className="flex-1">
            <a href={"mailto:" + access.adminContact}>
              <Mail className="mr-2 size-4" /> Contact an admin
            </a>
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="flex-1"
            onClick={deleteAccount}
            disabled={deleting}
          >
            {deleting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Trash2 className="mr-2 size-4" />}
            Delete account
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

function AccountAccessGate({ children }: { children: ReactNode }) {
  const token = localStorage.getItem(TOKEN_KEY);
  const [access, setAccess] = useState<AccountAccess | null>(null);
  const [checked, setChecked] = useState(!token);

  useEffect(() => {
    if (!token) {
      setChecked(true);
      setAccess(null);
      return;
    }
    const controller = new AbortController();
    void fetch(apiUrl("/users/me/access"), {
      headers: { Authorization: "Bearer " + token },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401) {
          localStorage.removeItem(TOKEN_KEY);
          return null;
        }
        if (!response.ok) throw new Error("Could not verify account access");
        return (await response.json()) as AccountAccess;
      })
      .then((value) => {
        setAccess(value);
        setChecked(true);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setChecked(true);
      });
    return () => controller.abort();
  }, [token]);

  if (!checked) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-background text-foreground">
        <Loader2 className="size-6 animate-spin text-primary" aria-label="Checking account access" />
      </main>
    );
  }
  if (access?.banned) return <BannedAccountPage access={access} />;
  return <>{children}</>;
}

/** Fully private page — redirects to login if unauthenticated. */
function PrivateRoute({
  component: Component,
}: {
  component: React.ComponentType;
}) {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return <Redirect to="/auth/login" />;
  return (
    <AppShell>
      <Component />
    </AppShell>
  );
}

/**
 * Publicly browsable page.
 * Authenticated users get the full AppShell sidebar.
 * Unauthenticated users get a slim header with Sign In / Create Account.
 */
function AdminRoute() {
  const { data: me, isLoading } = useGetMe();
  if (isLoading) return <AppShell><div className="p-8">Loading administrator panel...</div></AppShell>;
  if (me?.role !== UserRole.admin) return <Redirect to="/dashboard" />;
  return <AppShell><AdminPage /></AppShell>;
}

function PublicRoute({
  component: Component,
}: {
  component: React.ComponentType;
}) {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    return (
      <AppShell>
        <Component />
      </AppShell>
    );
  }
  return (
    <PublicShell>
      <Component />
    </PublicShell>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/auth/login" component={LoginPage} />
      <Route path="/auth/register" component={RegisterPage} />

      {/* Publicly browsable */}
      <Route path="/resources/:id">
        {() => <PublicRoute component={ResourceDetailPage} />}
      </Route>
      <Route path="/resources">
        {() => <PublicRoute component={ResourcesPage} />}
      </Route>
      <Route path="/canvas/shared/:token">
        {() => <PublicRoute component={() => <CanvasPage shared />} />}
      </Route>

      {/* Profile pages */}
      <Route path="/people">
        {() => <PrivateRoute component={PeoplePage} />}
      </Route>
      <Route path="/profile/:userId">
        {() => <PrivateRoute component={UserProfilePage} />}
      </Route>
      <Route path="/profile">
        {() => <PrivateRoute component={ProfilePage} />}
      </Route>

      <Route path="/admin">
        {() => <AdminRoute />}
      </Route>

      {/* Requires account */}
      <Route path="/forum">
        {() => <PrivateRoute component={ForumPage} />}
      </Route>
      <Route path="/activities">
        {() => <PrivateRoute component={ActivitiesPage} />}
      </Route>
      <Route path="/canvases/:id">
        {() => <PrivateRoute component={CanvasPage} />}
      </Route>
      <Route path="/canvases">
        {() => <PrivateRoute component={CanvasesPage} />}
      </Route>
      <Route path="/goals">
        {() => <PrivateRoute component={GoalsPage} />}
      </Route>
      <Route path="/dashboard">
        {() => <PrivateRoute component={DashboardPage} />}
      </Route>
      <Route path="/classes/:id">
        {() => <PrivateRoute component={ClassDetailPage} />}
      </Route>
      <Route path="/classes">
        {() => <PrivateRoute component={ClassesPage} />}
      </Route>
      <Route path="/lists/:id">
        {() => <PrivateRoute component={ListDetailPage} />}
      </Route>
      <Route path="/lists">
        {() => <PrivateRoute component={ListsPage} />}
      </Route>
      <Route path="/schedule">
        {() => <PrivateRoute component={SchedulePage} />}
      </Route>

      {/* Root lands on public resource browse */}
      <Route path="/">
        <Redirect to="/resources" />
      </Route>
      <Route>
        <Redirect to="/resources" />
      </Route>
    </Switch>
  );
}

function App() {
  useEffect(() => {
    setAuthTokenGetter(() => localStorage.getItem(TOKEN_KEY));
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <UiTranslationBridge />
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Suspense fallback={<main className="flex min-h-[100dvh] items-center justify-center bg-background"><Loader2 className="size-6 animate-spin text-primary" /></main>}>
            <AccountAccessGate><Router /></AccountAccessGate>
          </Suspense>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
