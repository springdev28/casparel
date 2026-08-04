import { useEffect, useState } from 'react';
import { Link, useSearch as useRouteSearch } from 'wouter';
import { BriefcaseBusiness, ExternalLink, Globe2, GraduationCap, Search, Users } from 'lucide-react';
import {
  DiscoverResourcesResultType,
  SearchUsersRole,
  SearchUsersScope,
  getDiscoverResourcesQueryKey,
  getSearchUsersQueryKey,
  useDiscoverResources,
  useSearchUsers,
  type DiscoveredResource,
} from '@workspace/api-client-react';
import { Avatar, AvatarFallback, AvatarImage } from '@workspace/edu-ds/components/ui/avatar';
import { Button } from '@workspace/edu-ds/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/edu-ds/components/ui/card';
import { Input } from '@workspace/edu-ds/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/edu-ds/components/ui/select';
import { Skeleton } from '@workspace/edu-ds/components/ui/skeleton';

export default function PeoplePage() {
  const routeSearch = useRouteSearch();
  const [inputValue, setInputValue] = useState('');
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState('');
  const [role, setRole] = useState<'all' | SearchUsersRole>('all');
  const [profileSource, setProfileSource] = useState<'schoolar' | 'social'>('schoolar');
  const [accountLimit, setAccountLimit] = useState(24);
  const [socialPage, setSocialPage] = useState(1);
  const [allSocialPeople, setAllSocialPeople] = useState<DiscoveredResource[]>([]);

  const params = {
    scope: SearchUsersScope.all,
    limit: accountLimit,
    offset: 0,
    ...(query ? { q: query } : {}),
    ...(subject.trim() ? { subject: subject.trim() } : {}),
    ...(role !== 'all' ? { role } : {}),
  };
  const { data: people, isLoading, isError } = useSearchUsers(params, {
    query: { enabled: profileSource === "schoolar", queryKey: getSearchUsersQueryKey(params), staleTime: 60_000 },
  });

  const socialQuery = [query ? '"' + query + '"' : "", subject.trim(), role === SearchUsersRole.student ? "student" : role === SearchUsersRole.teacher ? "educator professional" : "student educator professional"].filter(Boolean).join(" ");
  const { data: socialPeople, isFetching: socialLoading, isError: socialError } = useDiscoverResources(
    { q: socialQuery || "students educators professionals", resultType: DiscoverResourcesResultType.people, page: socialPage },
    { query: { enabled: profileSource === "social" && !!(query || subject.trim()), queryKey: getDiscoverResourcesQueryKey({ q: socialQuery || "students educators professionals", resultType: DiscoverResourcesResultType.people, page: socialPage }), staleTime: 300_000, retry: false } },
  );

  useEffect(() => {
    const params = new URLSearchParams(routeSearch);
    const goal = params.get("goal");
    const subjectParam = params.get("subject");
    if (goal) { setInputValue(goal); setQuery(goal); }
    if (subjectParam) setSubject(subjectParam);
  }, [routeSearch]);
  useEffect(() => { setAccountLimit(24); setSocialPage(1); setAllSocialPeople([]); }, [query, subject, role, profileSource]);
  useEffect(() => {
    if (!socialPeople) return;
    setAllSocialPeople((current) => socialPage === 1 ? socialPeople : [...current, ...socialPeople.filter((item) => !current.some((existing) => existing.url === item.url))]);
  }, [socialPeople, socialPage]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setQuery(inputValue.trim().replace(/\s+/g, " "));
  }

  return (
    <div className="mx-auto max-w-6xl space-y-7 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Users className="size-6 text-primary" /> Find people
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Discover students with shared interests and educators or professionals in their subject.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
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
          <Button type="submit" size="lg"><Search className="mr-2 size-4" /> Search people</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={profileSource} onValueChange={(value) => setProfileSource(value as 'schoolar' | 'social')}>
            <SelectTrigger className="h-9 w-48" data-testid="people-source-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="schoolar">Schoolar accounts</SelectItem>
              <SelectItem value="social">Social media profiles</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className="h-9 w-52 text-sm"
            placeholder="Subject or interest…"
            data-testid="people-subject-filter"
          />
          <Select value={role} onValueChange={(value) => setRole(value as 'all' | SearchUsersRole)}>
            <SelectTrigger className="h-9 w-56" data-testid="people-role-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              <SelectItem value={SearchUsersRole.student}>Students</SelectItem>
              <SelectItem value={SearchUsersRole.teacher}>Educators & professionals</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </form>

      {profileSource === 'social' ? (
        !query && !subject.trim() ? (
          <div className="rounded-xl border border-dashed py-14 text-center text-muted-foreground"><Globe2 className="mx-auto mb-3 size-9 opacity-40" /><p className="font-medium text-foreground">Search for a subject or person</p><p className="mt-1 text-sm">Social search returns direct public profile pages only.</p></div>
        ) : socialLoading && allSocialPeople.length === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-52 rounded-xl" />)}</div>
        ) : socialError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">Social profile search could not be loaded. Try a more specific name or subject.</div>
        ) : !allSocialPeople.length ? (
          <div className="rounded-xl border border-dashed py-14 text-center text-muted-foreground"><Globe2 className="mx-auto mb-3 size-9 opacity-40" /><p className="font-medium text-foreground">No verified public profiles found</p><p className="mt-1 text-sm">Try a name together with a subject or profession.</p></div>
        ) : (
          <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {allSocialPeople.map((person, index) => (
              <Card key={index} className="flex h-full flex-col border-primary/15 bg-gradient-to-br from-card to-primary/5">
                <CardHeader><div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Globe2 className="size-5" /></div><CardTitle className="text-base">{person.title}</CardTitle><p className="text-xs text-muted-foreground">{person.source}</p></CardHeader>
                <CardContent className="flex flex-1 flex-col gap-3"><p className="line-clamp-3 text-sm text-muted-foreground">{person.description}</p><Button asChild className="mt-auto w-full"><a href={person.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 size-4" /> Open public profile</a></Button></CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-5 text-center"><Button variant="outline" onClick={() => setSocialPage((page) => page + 1)} disabled={socialLoading}>{socialLoading ? "Searching…" : "Search more profiles"}</Button></div>
        </>
        )
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-56 rounded-xl" />)}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          People search could not be loaded. Please try again.
        </div>
      ) : !people?.length ? (
        <div className="rounded-xl border border-dashed py-14 text-center text-muted-foreground">
          <Users className="mx-auto mb-3 size-9 opacity-40" />
          <p className="font-medium text-foreground">No matching people yet</p>
          <p className="mt-1 text-sm">Try a broader subject, interest, or role.</p>
        </div>
      ) : (
        <>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((person) => (
            <Link key={person.id} href={`/profile/${person.id}`} className="block">
              <Card className="h-full transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                <CardHeader className="flex-row items-center gap-3 pb-3">
                  <Avatar className="size-12">
                    <AvatarImage src={person.avatarUrl ?? undefined} alt={person.name} />
                    <AvatarFallback>{person.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">{person.name}</CardTitle>
                    <div className="mt-1 flex items-center gap-1 text-xs capitalize text-muted-foreground">
                      {person.role === 'teacher' ? <BriefcaseBusiness className="size-3.5" /> : <GraduationCap className="size-3.5" />}
                      {person.role === 'teacher' ? 'Educator / professional' : 'Student'}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {person.gradeOrDept && <p className="text-sm font-medium">{person.gradeOrDept}</p>}
                  {person.bio && <p className="line-clamp-3 text-sm text-muted-foreground">{person.bio}</p>}
                  {!!person.subjects?.length && (
                    <div className="flex flex-wrap gap-1.5">
                      {person.subjects.slice(0, 5).map((item) => (
                        <span key={item} className="rounded-full bg-accent px-2 py-1 text-xs text-accent-foreground">{item}</span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
        {people.length >= accountLimit && accountLimit < 100 && <div className="mt-5 text-center"><Button variant="outline" onClick={() => setAccountLimit((limit) => Math.min(100, limit + 24))}>Search more accounts</Button></div>}
        </>
      )}
    </div>
  );
}
