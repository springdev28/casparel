import { useEffect, useMemo, useState } from "react";
import { Link, useSearch as useRouteSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  ChevronDown,
  ExternalLink,
  Github,
  Globe2,
  GraduationCap,
  Instagram,
  Linkedin,
  Loader2,
  Search,
  Target,
  X,
  Twitter,
  Users,
  Youtube,
} from "lucide-react";
import {
  DiscoverResourcesResultType,
  SearchUsersRole,
  SearchUsersScope,
  getDiscoverResourcesQueryKey,
  getGetMyUsageQueryKey,
  getSearchUsersQueryKey,
  useDiscoverResources,
  useSearchUsers,
  type DiscoveredResource,
} from "@workspace/api-client-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/edu-ds/components/ui/avatar";
import { Button } from "@workspace/edu-ds/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/edu-ds/components/ui/card";
import { Input } from "@workspace/edu-ds/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/edu-ds/components/ui/select";
import { Skeleton } from "@workspace/edu-ds/components/ui/skeleton";

type PublicPersonGroup = {
  name: string;
  description: string;
  source: string;
  subject?: string | null;
  gradeLevel?: string | null;
  links: DiscoveredResource[];
};

const PUBLIC_PEOPLE_PAGE_SIZE = 9;
const PUBLIC_PEOPLE_AUTO_SEARCH_PAGES = 5;

function personName(title: string): string {
  return (
    title
      .split(/\s+[–—|]\s+|\s+-\s+/)[0]
      ?.replace(/\s*[([].*?[)\]]\s*$/, "")
      .replace(
        /\s+(?:profile|linkedin|researchgate|orcid|google scholar|github)$/i,
        "",
      )
      .trim() || title
  );
}

function normalizedPersonName(name: string): string {
  return name
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(?:dr|prof|professor|phd|md)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function samePerson(left: string, right: string): boolean {
  if (left === right) return true;
  const leftParts = left.split(" ").filter(Boolean);
  const rightParts = right.split(" ").filter(Boolean);
  if (leftParts.length < 2 || rightParts.length < 2) return false;
  return (
    leftParts[0] === rightParts[0] &&
    leftParts[leftParts.length - 1] === rightParts[rightParts.length - 1]
  );
}

function groupPublicPeople(items: DiscoveredResource[]): PublicPersonGroup[] {
  const groups = new Map<string, PublicPersonGroup>();
  for (const item of items) {
    const name = personName(item.title);
    const key = normalizedPersonName(name);
    const existingKey = [...groups.keys()].find((candidate) =>
      samePerson(candidate, key),
    );
    const existing = existingKey ? groups.get(existingKey) : undefined;
    if (existing) {
      if (!existing.links.some((link) => link.url === item.url))
        existing.links.push(item);
    } else {
      groups.set(key, {
        name,
        description: item.description,
        source: item.source,
        subject: item.subject,
        gradeLevel: item.gradeLevel,
        links: [item],
      });
    }
  }
  return [...groups.values()];
}

function profilePlatform(url: string) {
  const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  if (host.includes("linkedin.com"))
    return { label: "LinkedIn", Icon: Linkedin };
  if (host.includes("instagram.com"))
    return { label: "Instagram", Icon: Instagram };
  if (host.includes("youtube.com")) return { label: "YouTube", Icon: Youtube };
  if (host.includes("github.com")) return { label: "GitHub", Icon: Github };
  if (host === "x.com" || host.includes("twitter.com"))
    return { label: "X / Twitter", Icon: Twitter };
  if (host.startsWith("scholar.google."))
    return { label: "Google Scholar", Icon: GraduationCap };
  if (host.includes("orcid.org"))
    return { label: "ORCID", Icon: GraduationCap };
  if (host.includes("researchgate.net"))
    return { label: "ResearchGate", Icon: GraduationCap };
  if (host.includes("semanticscholar.org"))
    return { label: "Semantic Scholar", Icon: GraduationCap };
  if (host.includes(".edu.") || host.endsWith(".edu") || host.includes(".ac."))
    return { label: "University profile", Icon: GraduationCap };
  return { label: host, Icon: Globe2 };
}

function PublicProfileCard({ person }: { person: PublicPersonGroup }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const deepQuery = `exact-person: ${person.name}; affiliation: ${person.source}`;
  const deepParams = {
    q: deepQuery,
    resultType: DiscoverResourcesResultType.people,
    page: 1,
  };
  const { data, isFetching, isError } = useDiscoverResources(deepParams, {
    query: {
      enabled: expanded,
      queryKey: getDiscoverResourcesQueryKey(deepParams),
      staleTime: 600_000,
      retry: false,
    },
  });
  useEffect(() => {
    if (!expanded || isFetching) return;
    void queryClient.invalidateQueries({ queryKey: getGetMyUsageQueryKey() });
  }, [data, expanded, isError, isFetching, queryClient]);

  const links = [...person.links];
  for (const link of data ?? [])
    if (!links.some((current) => current.url === link.url)) links.push(link);

  const hasLinkedIn = links.some((link) => {
    try {
      return new URL(link.url).hostname.includes("linkedin.com");
    } catch {
      return false;
    }
  });
  const linkedInSearchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${person.name} ${person.source}`)}`;
  return (
    <Card className="flex h-full flex-col border-primary/15 bg-gradient-to-br from-card to-primary/5">
      <CardHeader>
        <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <GraduationCap className="size-5" />
        </div>
        <CardTitle className="text-base">{person.name}</CardTitle>
        <p className="text-xs text-muted-foreground">{person.source}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {person.subject && (
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              {person.subject}
            </span>
          )}
          {person.gradeLevel && (
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              {person.gradeLevel}
            </span>
          )}
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            {links.length} public {links.length === 1 ? "link" : "links"}
          </span>
        </div>
        {expanded && !isFetching && !hasLinkedIn && (
          <a
            href={linkedInSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-dashed border-[#0A66C2]/40 bg-[#0A66C2]/5 px-3 py-2 text-sm font-medium text-[#0A66C2] hover:bg-[#0A66C2]/10"
          >
            <Linkedin className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              Search LinkedIn for this person
            </span>
            <ExternalLink className="size-3.5 shrink-0" />
          </a>
        )}
        <p className="line-clamp-3 text-sm text-muted-foreground">
          {person.description}
        </p>
        <div className="space-y-2">
          {links.map((link) => {
            const { label, Icon } = profilePlatform(link.url);
            return (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border bg-background/70 px-3 py-2 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-accent"
              >
                <Icon className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
              </a>
            );
          })}
        </div>
        {expanded && isFetching && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Searching public profiles…
          </div>
        )}
        {expanded && isError && (
          <p className="text-xs text-destructive">
            Additional profiles could not be loaded.
          </p>
        )}
        <Button
          variant="outline"
          className="mt-auto w-full"
          onClick={() => setExpanded(true)}
          disabled={expanded && isFetching}
        >
          {expanded && isFetching ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <ChevronDown className="mr-2 size-4" />
          )}
          {expanded ? "Profiles searched" : "Find more profiles"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function PeoplePage() {
  const routeSearch = useRouteSearch();
  const queryClient = useQueryClient();
  const [inputValue, setInputValue] = useState("");
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("");
  const [role, setRole] = useState<"all" | SearchUsersRole>("all");
  const [profileSource, setProfileSource] = useState<"schoolar" | "social">(
    "social",
  );
  const [accountLimit, setAccountLimit] = useState(24);
  const [socialPage, setSocialPage] = useState(1);
  const [allSocialPeople, setAllSocialPeople] = useState<DiscoveredResource[]>(
    [],
  );
  const [goalContext, setGoalContext] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const params = {
    scope: SearchUsersScope.all,
    limit: accountLimit,
    offset: 0,
    ...(query ? { q: query } : {}),
    ...(subject.trim() ? { subject: subject.trim() } : {}),
    ...(role !== "all" ? { role } : {}),
  };
  const {
    data: people,
    isLoading,
    isFetching: peopleFetching,
    isError,
    error: peopleError,
  } = useSearchUsers(params, {
    query: {
      enabled: profileSource === "schoolar" && hasSearched,
      queryKey: getSearchUsersQueryKey(params),
      staleTime: 60_000,
    },
  });

  const associatedTopic = query ? "" : goalContext;
  const socialQuery = [
    query ? '"' + query + '"' : "",
    subject.trim(),
    associatedTopic,
    role === SearchUsersRole.student
      ? "student"
      : role === SearchUsersRole.teacher
        ? "educator professional"
        : "student educator professional",
  ]
    .filter(Boolean)
    .join(" ");
  const {
    data: socialPeople,
    isFetching: socialLoading,
    isError: socialError,
    error: socialErrorObj,
  } = useDiscoverResources(
    {
      q: socialQuery || "students educators professionals",
      resultType: DiscoverResourcesResultType.people,
      page: socialPage,
    },
    {
      query: {
        enabled: profileSource === "social" && hasSearched,
        queryKey: getDiscoverResourcesQueryKey({
          q: socialQuery || "students educators professionals",
          resultType: DiscoverResourcesResultType.people,
          page: socialPage,
        }),
        staleTime: 300_000,
        retry: false,
      },
    },
  );

  useEffect(() => {
    const params = new URLSearchParams(routeSearch);
    const goal = params.get("goal");
    const subjectParam = params.get("subject");
    setGoalContext(goal ?? "");
    setSubject(subjectParam ?? "");
    setHasSearched(false);
    setAccountLimit(24);
    setSocialPage(1);
    setAllSocialPeople([]);
  }, [routeSearch]);
  useEffect(() => {
    if (!socialPeople) return;
    setAllSocialPeople((current) =>
      socialPage === 1
        ? socialPeople
        : [
            ...current,
            ...socialPeople.filter(
              (item) => !current.some((existing) => existing.url === item.url),
            ),
          ],
    );
  }, [socialPeople, socialPage]);

  useEffect(() => {
    if (!hasSearched || socialLoading) return;
    void queryClient.invalidateQueries({ queryKey: getGetMyUsageQueryKey() });
  }, [hasSearched, queryClient, socialError, socialLoading, socialPeople]);

  useEffect(() => {
    if (!hasSearched || profileSource !== "schoolar" || peopleFetching) return;
    void queryClient.invalidateQueries({ queryKey: getGetMyUsageQueryKey() });
  }, [hasSearched, isError, people, peopleFetching, profileSource, queryClient]);

  const groupedSocialPeople = useMemo(
    () => groupPublicPeople(allSocialPeople),
    [allSocialPeople],
  );

  const socialRateLimited =
    socialError &&
    (socialErrorObj as { status?: number } | null)?.status === 429;
  const peopleRateLimited =
    isError && (peopleError as { status?: number } | null)?.status === 429;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setGoalContext("");
    window.history.replaceState(null, "", window.location.pathname);
    setQuery(inputValue.trim().replace(/\s+/g, " "));
    setAccountLimit(24);
    setSocialPage(1);
    setAllSocialPeople([]);
    setHasSearched(true);
  }

  function clearSearch() {
    setInputValue("");
    setQuery("");
    setSubject("");
    setRole("all");
    setGoalContext("");
    setAccountLimit(24);
    setSocialPage(1);
    setAllSocialPeople([]);
    setHasSearched(false);
    window.history.replaceState(null, "", window.location.pathname);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-7 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Users className="size-6 text-primary" /> Find people
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Discover students with shared interests and educators or professionals
          in their subject.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="space-y-3 rounded-xl border bg-card p-4 shadow-sm"
      >
        {associatedTopic && !query && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Target className="size-4 text-primary" /> Showing people associated
            with <b className="text-foreground">{associatedTopic}</b>. A name is
            optional.
          </div>
        )}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              className="h-11 pl-9"
              placeholder="Search by name, interest, department, or experience…"
              data-testid="people-search-input"
            />
          </div>
          <Button type="submit" size="lg">
            <Search className="mr-2 size-4" /> Search people
          </Button>
          <Button type="button" size="lg" variant="outline" onClick={clearSearch} data-testid="people-clear-search">
            <X className="mr-2 size-4" /> Clear
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            value={profileSource}
            onValueChange={(value) => {
              setProfileSource(value as "schoolar" | "social");
              setAccountLimit(24);
              setSocialPage(1);
              setAllSocialPeople([]);
              setHasSearched(false);
            }}
          >
            <SelectTrigger
              className="h-9 w-48"
              data-testid="people-source-filter"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="schoolar">Schoolar accounts</SelectItem>
              <SelectItem value="social">
                Public web & scholar profiles
              </SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={subject}
            onChange={(event) => {
              setSubject(event.target.value);
              setAccountLimit(24);
              setSocialPage(1);
              setAllSocialPeople([]);
              setHasSearched(false);
            }}
            className="h-9 w-52 text-sm"
            placeholder="Subject or interest…"
            data-testid="people-subject-filter"
          />
          <Select
            value={role}
            onValueChange={(value) => {
              setRole(value as "all" | SearchUsersRole);
              setAccountLimit(24);
              setSocialPage(1);
              setAllSocialPeople([]);
              setHasSearched(false);
            }}
          >
            <SelectTrigger
              className="h-9 w-56"
              data-testid="people-role-filter"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              <SelectItem value={SearchUsersRole.student}>Students</SelectItem>
              <SelectItem value={SearchUsersRole.teacher}>
                Educators & professionals
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </form>

      {profileSource === "social" ? (
        !hasSearched ? (
          <div className="rounded-xl border border-dashed py-14 text-center text-muted-foreground">
            <Search className="mx-auto mb-3 size-9 opacity-40" />
            <p className="font-medium text-foreground">Search public profiles</p>
            <p className="mt-1 text-sm">
              Enter a name, subject, department, or profession, then press Search people.
            </p>
          </div>
        ) : socialLoading && allSocialPeople.length === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-52 rounded-xl" />
            ))}
          </div>
        ) : socialError && allSocialPeople.length === 0 ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
            {socialRateLimited
              ? "Your daily search limit has been reached. It resets daily."
              : "Public profile search could not be loaded. Try a more specific name or subject."}
          </div>
        ) : !allSocialPeople.length ? (
          <div className="rounded-xl border border-dashed py-14 text-center text-muted-foreground">
            <Globe2 className="mx-auto mb-3 size-9 opacity-40" />
            <p className="font-medium text-foreground">
              No verified public profiles found
            </p>
            <p className="mt-1 text-sm">
              Try a name together with a subject or profession.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {groupedSocialPeople.map((person) => (
                <PublicProfileCard key={person.name} person={person} />
              ))}
            </div>
            <div className="mt-5 space-y-2 text-center">
              {socialLoading &&
                groupedSocialPeople.length < PUBLIC_PEOPLE_PAGE_SIZE && (
                  <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Finding more distinct people… {groupedSocialPeople.length}/
                    {PUBLIC_PEOPLE_PAGE_SIZE}
                  </p>
                )}
              {socialError && (
                <p className="text-sm text-destructive">
                  More profiles could not be loaded. Your current results are
                  still shown.
                </p>
              )}
              <Button
                variant="outline"
                onClick={() => setSocialPage((page) => page + 1)}
                disabled={socialLoading}
              >
                {socialLoading ? "Searching…" : "Search more profiles"}
              </Button>
            </div>
          </>
        )
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : !hasSearched ? (
        <div className="rounded-xl border border-dashed py-14 text-center text-muted-foreground">
          <Search className="mx-auto mb-3 size-9 opacity-40" />
          <p className="font-medium text-foreground">Search Schoolar accounts</p>
          <p className="mt-1 text-sm">Choose filters and press Search people.</p>
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          {peopleRateLimited
            ? "Your daily search limit has been reached. It resets daily."
            : "People search could not be loaded. Please try again."}
        </div>
      ) : !people?.length ? (
        <div className="rounded-xl border border-dashed py-14 text-center text-muted-foreground">
          <Users className="mx-auto mb-3 size-9 opacity-40" />
          <p className="font-medium text-foreground">No matching people yet</p>
          <p className="mt-1 text-sm">
            Try a broader subject, interest, or role.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {people.map((person) => (
              <Link
                key={person.id}
                href={`/profile/${person.id}`}
                className="block"
              >
                <Card className="h-full transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                  <CardHeader className="flex-row items-center gap-3 pb-3">
                    <Avatar className="size-12">
                      <AvatarImage
                        src={person.avatarUrl ?? undefined}
                        alt={person.name}
                      />
                      <AvatarFallback>
                        {person.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">
                        {person.name}
                      </CardTitle>
                      <div className="mt-1 flex items-center gap-1 text-xs capitalize text-muted-foreground">
                        {person.role === "teacher" ? (
                          <BriefcaseBusiness className="size-3.5" />
                        ) : (
                          <GraduationCap className="size-3.5" />
                        )}
                        {person.role === "teacher"
                          ? "Educator / professional"
                          : "Student"}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {person.gradeOrDept && (
                      <p className="text-sm font-medium">
                        {person.gradeOrDept}
                      </p>
                    )}
                    {person.bio && (
                      <p className="line-clamp-3 text-sm text-muted-foreground">
                        {person.bio}
                      </p>
                    )}
                    {!!person.subjects?.length && (
                      <div className="flex flex-wrap gap-1.5">
                        {person.subjects.slice(0, 5).map((item) => (
                          <span
                            key={item}
                            className="rounded-full bg-accent px-2 py-1 text-xs text-accent-foreground"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
          {people.length >= accountLimit && accountLimit < 100 && (
            <div className="mt-5 text-center">
              <Button
                variant="outline"
                onClick={() =>
                  setAccountLimit((limit) => Math.min(100, limit + 24))
                }
              >
                Search more accounts
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
