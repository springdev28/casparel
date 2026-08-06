import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@workspace/edu-ds/components/ui/toaster";
import { TooltipProvider } from "@workspace/edu-ds/components/ui/tooltip";
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
import AppShell from "./components/AppShell";
import PublicShell from "./components/PublicShell";
import UiTranslationBridge from "./components/UiTranslationBridge";

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
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
