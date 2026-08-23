/**
 * @fileOverview Web screen role: renders the Public List Page route and coordinates its page-level data and interactions.
 * System connection: mounted from App.tsx; composes generated API hooks, local helpers, and reusable UI components.
 */
import { ArrowRight, BookOpen, List, LogIn } from "lucide-react";
import { Link, useParams } from "wouter";
import {
  getGetPublicResourceListQueryKey,
  useGetPublicResourceList,
} from "@workspace/api-client-react";
import { Badge } from "@workspace/edu-ds/components/ui/badge";
import { Button } from "@workspace/edu-ds/components/ui/button";
import { Card, CardContent } from "@workspace/edu-ds/components/ui/card";
import { Skeleton } from "@workspace/edu-ds/components/ui/skeleton";
import { authRouteWithNext } from "../lib/auth-redirect";
import { publicListPath } from "../lib/public-list-link";

export default function PublicListPage() {
  const { token = "" } = useParams<{ token: string }>();
  const hasSession = Boolean(localStorage.getItem("schoolar_token"));
  const sharePath = publicListPath(token);
  const { data: list, isLoading, isError } = useGetPublicResourceList(token, {
    query: {
      enabled: Boolean(sharePath),
      queryKey: getGetPublicResourceListQueryKey(token),
      retry: false,
    },
  });

  if (isLoading) {
    return (
      <main className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-5 w-1/3" />
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-32 w-full" />
        ))}
      </main>
    );
  }

  if (!sharePath || isError || !list) {
    return (
      <main className="mx-auto flex min-h-80 max-w-lg flex-col items-center justify-center p-6 text-center">
        <List className="mb-3 size-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">This shared list is unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The owner may have stopped sharing it. Ask for a new link, or browse
          Casparel's public resources.
        </p>
        <Button asChild className="mt-5">
          <Link href="/resources">Browse resources</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6" data-testid="public-list-page">
      <header className="space-y-2">
        <Badge variant="secondary">Shared learning list</Badge>
        <h1 className="text-2xl font-bold sm:text-3xl">{list.name}</h1>
        {list.description ? (
          <p className="text-muted-foreground">{list.description}</p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {list.itemCount} verified resource{list.itemCount === 1 ? "" : "s"},
          shown in the curator's learning order.
        </p>
      </header>

      {list.items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <BookOpen className="mx-auto mb-3 size-9 text-muted-foreground" />
            <p className="font-medium">No public resources yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Private or still-unverified items are never exposed by a public
              list.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ol className="space-y-3">
          {list.items.map((item, index) => (
            <li key={`${item.resourceId}-${item.position}`}>
              <Card data-testid="public-list-item">
                <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary-text">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold">{item.resource.title}</h2>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {item.resource.description ||
                        `${item.resource.subject}, ${item.resource.gradeLevel}`}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="capitalize">
                        {item.resource.format}
                      </Badge>
                      <span>{item.resource.subject}</span>
                      <span>{item.resource.gradeLevel}</span>
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/resources/${item.resourceId}`}>
                      Review resource <ArrowRight className="ml-1.5 size-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      )}

      <Card className="border-primary/25 bg-primary/5">
        <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">
              {hasSession ? "Use these resources in Casparel" : "Keep what is useful"}
            </p>
            <p className="text-sm text-muted-foreground">
              {hasSession
                ? "Open a resource to review its source, save it, or connect it to a learning path."
                : "Create an account to save resources and turn them into your own learning path."}
            </p>
          </div>
          <Button asChild className="shrink-0">
            <Link
              href={
                hasSession
                  ? "/resources"
                  : authRouteWithNext("/auth/register", sharePath)
              }
            >
              {hasSession ? <BookOpen className="mr-2 size-4" /> : <LogIn className="mr-2 size-4" />}
              {hasSession ? "Browse resources" : "Create account"}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
