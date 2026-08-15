import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { Toaster } from "@workspace/edu-ds/components/ui/toaster";
import { TooltipProvider } from "@workspace/edu-ds/components/ui/tooltip";
import { Button } from "@workspace/edu-ds/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/edu-ds/components/ui/card";
import { Ban, Loader2, Mail, Trash2 } from "lucide-react";
import {
  Route,
  Switch,
  Router as WouterRouter,
  Redirect,
} from "wouter";
import {
  getGetMeQueryKey,
  getMe,
  setAuthTokenGetter,
  useGetMe,
  UserRole,
} from "@workspace/api-client-react";

import { applyLastSavedColors } from "./components/ThemeCustomizer";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { getInitialLanguage, type AuthLanguage } from "./lib/auth-locale";
import { clearSession, readSessionToken } from "./lib/session";
import { useSessionClaims } from "./lib/use-session";

const AppShell = lazy(() => import("./components/AppShell"));
const UiTranslationBridge = lazy(
  () => import("./components/UiTranslationBridge"),
);
const PublicShell = lazy(() => import("./components/PublicShell"));
const LandingPage = lazy(() => import("./pages/LandingPage"));
const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const RegisterPage = lazy(() => import("./pages/auth/RegisterPage"));
const DashboardPage = lazy(() => import("./pages/AdaptiveDashboardPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const TutorialPage = lazy(() => import("./pages/TutorialPage"));
const GuidePage = lazy(() => import("./pages/GuidePage"));
const ResourcesPage = lazy(() => import("./pages/ResourcesPage"));
const ResourceDetailPage = lazy(() => import("./pages/ResourceDetailPage"));
const ClassesPage = lazy(() => import("./pages/ClassesPage"));
const ClassDetailPage = lazy(() => import("./pages/ClassDetailPage"));
const ListsPage = lazy(() => import("./pages/ListsPage"));
const ListDetailPage = lazy(() => import("./pages/ListDetailPage"));
const SchedulePage = lazy(() => import("./pages/SchedulePage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const UserProfilePage = lazy(() => import("./pages/UserProfilePage"));
const PeoplePage = lazy(() => import("./pages/PeoplePage"));
const GoalsPage = lazy(() => import("./pages/GoalsPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const ForumPage = lazy(() => import("./pages/ForumPage"));
const ActivitiesPage = lazy(() => import("./pages/ActivitiesPage"));
const MessagesPage = lazy(() => import("./pages/MessagesPage"));
const CanvasesPage = lazy(() => import("./pages/CanvasesPage"));
const CanvasPage = lazy(() => import("./pages/CanvasPage"));
const TermsPage = lazy(() =>
  import("./pages/LegalPage").then((m) => ({ default: m.TermsPage })),
);
const PrivacyPage = lazy(() =>
  import("./pages/LegalPage").then((m) => ({ default: m.PrivacyPage })),
);
const SupportPage = lazy(() => import("./pages/SupportPage"));

const TOKEN_KEY = "schoolar_token";
const LANGUAGE_EVENT = "schoolar-language-change";

/**
 * Sign the user out when the server says the session is gone.
 *
 * Nothing acted on a 401 before, so an expired or revoked token left the user
 * inside the signed-in app with every panel failing and no route back to
 * login. The token sat in localStorage looking valid to the route guards.
 *
 * Two conditions keep this from firing on a normal failed sign-in. A 401 only
 * means "your session ended" if a session was actually sent, so requests made
 * while signed out are ignored; and the credential endpoints answer 401 for a
 * wrong password, which must keep showing "Email or password is incorrect"
 * rather than bouncing to a spurious "session expired".
 */
function isSessionExpiry(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (status !== 401) return false;
  if (!readSessionToken()) return false;
  const url = String((error as { url?: unknown } | null)?.url ?? "");
  return !/\/auth\/(login|register)$/.test(url);
}

function handleQueryError(error: unknown): void {
  if (!isSessionExpiry(error)) return;
  clearSession();
  // Drop every cached response so the next signed-in visit cannot read data
  // belonging to the session that just ended.
  queryClient.clear();
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleQueryError }),
  mutationCache: new MutationCache({ onError: handleQueryError }),
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

function UiTranslationRuntime() {
  const [enabled, setEnabled] = useState(() => getInitialLanguage() === "tr");

  useEffect(() => {
    const handleLanguage = (event: Event) => {
      setEnabled((event as CustomEvent<AuthLanguage>).detail === "tr");
    };
    document.addEventListener(LANGUAGE_EVENT, handleLanguage);
    return () => document.removeEventListener(LANGUAGE_EVENT, handleLanguage);
  }, []);

  if (!enabled) return null;
  return (
    <Suspense fallback={null}>
      <UiTranslationBridge />
    </Suspense>
  );
}

function BannedAccountPage({ access }: { access: AccountAccess }) {
  const [deleting, setDeleting] = useState(false);

  async function deleteAccount() {
    if (
      !window.confirm("Permanently delete your account? This cannot be undone.")
    )
      return;
    setDeleting(true);
    try {
      const response = await fetch(apiUrl("/users/me"), {
        method: "DELETE",
        headers: { Authorization: "Bearer " + localStorage.getItem(TOKEN_KEY) },
      });
      if (!response.ok) throw new Error("Account deletion failed");
      clearSession();
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
          <div className="mb-2 flex size-11 items-center justify-center rounded-md bg-destructive/10 text-destructive-text">
            <Ban className="size-5" />
          </div>
          <CardTitle>Account banned</CardTitle>
          <p className="text-sm text-muted-foreground">
            {access.bannedReason ||
              "This account has been restricted by an administrator."}
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
            {deleting ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 size-4" />
            )}
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

  useEffect(() => {
    if (!token) {
      setAccess(null);
      return;
    }
    const controller = new AbortController();
    void queryClient
      .prefetchQuery({
        queryKey: getGetMeQueryKey(),
        queryFn: () => getMe(),
        staleTime: 30_000,
      })
      .catch(() => undefined);
    void fetch(apiUrl("/users/me/access"), {
      headers: { Authorization: "Bearer " + token },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401) {
          clearSession();
          return null;
        }
        if (!response.ok) throw new Error("Could not verify account access");
        return (await response.json()) as AccountAccess;
      })
      .then((value) => setAccess(value))
      .catch(() => {
        // A failed check must not lock anyone out: the server is still the one
        // enforcing the ban, so carry on rendering.
      });
    return () => controller.abort();
  }, [token]);

  // Render straight away rather than holding the whole app behind this check.
  // It is one request to a database on the other side of the world, so gating
  // on it meant every reload showed a spinner for about a second before any
  // part of the app appeared, on every page, for every signed-in visitor.
  //
  // Showing the app first is safe because this gate is a courtesy, not the
  // enforcement: the server rejects a banned account's requests on its own, so
  // the worst case is that such an account sees a shell it cannot use for the
  // moment the check is in flight, and is then swapped to the explanation.
  if (access?.banned) return <BannedAccountPage access={access} />;
  return <>{children}</>;
}

/** Fully private page, redirects to login if unauthenticated. */
function PrivateRoute({
  component: Component,
}: {
  component: React.ComponentType;
}) {
  // Claims, not the raw token: a token that is present but past its expiry is
  // not a session. Reading localStorage directly also never re-rendered when
  // the token was cleared, which is what kept expired users inside the app.
  const claims = useSessionClaims();
  if (!claims) return <Redirect to="/auth/login" />;
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
  if (isLoading)
    return (
      <AppShell>
        <div className="p-8">Loading administrator panel...</div>
      </AppShell>
    );
  if (me?.role !== UserRole.admin) return <Redirect to="/dashboard" />;
  return (
    <AppShell>
      <AdminPage />
    </AppShell>
  );
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
      {/* Reachable without an account on purpose: the mobile paywall links
          here, and both app stores require the Terms and Privacy pages to
          resolve for a signed-out reviewer. */}
      <Route path="/terms">
        {() => <PublicRoute component={TermsPage} />}
      </Route>
      <Route path="/privacy">
        {() => <PublicRoute component={PrivacyPage} />}
      </Route>
      <Route path="/support">
        {() => <PublicRoute component={SupportPage} />}
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

      <Route path="/admin">{() => <AdminRoute />}</Route>

      {/* Requires account */}
      <Route path="/forum">
        {() => <PrivateRoute component={ForumPage} />}
      </Route>
      <Route path="/catalog">
        {() => <PrivateRoute component={() => <ForumPage catalogOnly />} />}
      </Route>
      <Route path="/activities/shared/:token">
        {() => <PublicRoute component={() => <ActivitiesPage shared />} />}
      </Route>
      <Route path="/activities">
        {() => <PrivateRoute component={ActivitiesPage} />}
      </Route>
      <Route path="/messages">
        {() => <PrivateRoute component={MessagesPage} />}
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
      <Route path="/settings">
        {() => <PrivateRoute component={SettingsPage} />}
      </Route>
      <Route path="/tutorial">
        {() => <PrivateRoute component={TutorialPage} />}
      </Route>
      <Route path="/guide">
        {() => <PrivateRoute component={GuidePage} />}
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

      {/* Root is the public landing page */}
      <Route path="/">
        <Suspense fallback={null}>
          <LandingPage />
        </Suspense>
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
    // Wired in after a single malformed API field blanked the entire app: an
    // uncaught render error unmounts the whole React tree, so the user gets a
    // white page with nothing to act on and no clue what happened. The
    // boundary turns that into a message and a reload, and logs the error.
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <UiTranslationRuntime />
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Suspense
              fallback={
                <main className="flex min-h-[100dvh] items-center justify-center bg-background">
                  <Loader2 className="size-6 animate-spin text-primary-text" />
                </main>
              }
            >
              <AccountAccessGate>
                <Router />
              </AccountAccessGate>
            </Suspense>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}

export default App;
