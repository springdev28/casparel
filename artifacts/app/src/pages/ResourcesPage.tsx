import { useState, useRef, useEffect } from 'react';
import { useLocation, Link } from 'wouter';
import { Search, Plus, LogIn, Globe, ExternalLink, Loader2, BookOpen, Sparkles } from 'lucide-react';
import { Button } from '@workspace/edu-ds/components/ui/button';
import { Input } from '@workspace/edu-ds/components/ui/input';
import { Label } from '@workspace/edu-ds/components/ui/label';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@workspace/edu-ds/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@workspace/edu-ds/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/edu-ds/components/ui/select';
import { Skeleton } from '@workspace/edu-ds/components/ui/skeleton';
import { Textarea } from '@workspace/edu-ds/components/ui/textarea';
import { toast } from '@workspace/edu-ds/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListResources,
  useCreateResource,
  useGetMe,
  useDiscoverResources,
  getDiscoverResourcesQueryKey,
  getListResourcesQueryKey,
  getGetMeQueryKey,
  ListResourcesFormat,
  ResourceInputFormat,
  DiscoverResourcesFormat,
  type DiscoveredResource,
} from '@workspace/api-client-react';
import { StarRating } from '../components/StarRating';

const FORMAT_OPTIONS = Object.values(ListResourcesFormat);

const FORMAT_COLORS: Record<string, string> = {
  article:     'bg-blue-100 text-blue-700',
  video:       'bg-red-100 text-red-700',
  pdf:         'bg-orange-100 text-orange-700',
  podcast:     'bg-purple-100 text-purple-700',
  interactive: 'bg-emerald-100 text-emerald-700',
  other:       'bg-gray-100 text-gray-700',
};

function getYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0];
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return v;
      const m = u.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/);
      if (m) return m[1];
    }
    return null;
  } catch { return null; }
}

function FormatBadge({ format }: { format: string }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 capitalize ${FORMAT_COLORS[format] ?? FORMAT_COLORS.other}`}>
      {format}
    </span>
  );
}

export default function ResourcesPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);

  // Unified search state
  const [inputValue, setInputValue] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [formatFilter, setFormatFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');

  // Discover fires only when activeQuery is non-empty
  const discoverEnabled = activeQuery.trim().length > 0;
  const discoverParams = {
    q: activeQuery,
    ...(formatFilter && formatFilter !== 'all' ? { format: formatFilter as DiscoverResourcesFormat } : {}),
    ...(subjectFilter.trim() ? { subject: subjectFilter.trim() } : {}),
  };

  // Library always shows (filtered by search if typed)
  const libraryParams = {
    ...(activeQuery ? { q: activeQuery } : {}),
    ...(formatFilter && formatFilter !== 'all' ? { format: formatFilter as ListResourcesFormat } : {}),
    ...(subjectFilter.trim() ? { subject: subjectFilter.trim() } : {}),
  };

  const { data: resources, isLoading: libraryLoading } = useListResources(libraryParams);
  const { data: me } = useGetMe({ query: { retry: false, queryKey: getGetMeQueryKey() } });
  const isLoggedIn = !!me;

  const { data: discovered, isFetching: discoverLoading, isError: discoverError } = useDiscoverResources(
    discoverParams,
    {
      query: {
        enabled: discoverEnabled,
        staleTime: 1000 * 60 * 5,
        queryKey: getDiscoverResourcesQueryKey(discoverParams),
      },
    }
  );

  const createResource = useCreateResource();

  // Submit form state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newFormat, setNewFormat] = useState<ResourceInputFormat>(ResourceInputFormat.article);
  const [newSubject, setNewSubject] = useState('');
  const [newGrade, setNewGrade] = useState('');
  const [addingUrl, setAddingUrl] = useState<string | null>(null);

  // Debounce library search, fire discover on explicit submit
  useEffect(() => {
    const t = setTimeout(() => {
      // library filters update live as you type (already handled by libraryParams)
    }, 300);
    return () => clearTimeout(t);
  }, [inputValue]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setActiveQuery(inputValue.trim());
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      setActiveQuery(inputValue.trim());
    }
  }

  function resetForm() {
    setNewTitle(''); setNewUrl(''); setNewDesc('');
    setNewFormat(ResourceInputFormat.article);
    setNewSubject(''); setNewGrade('');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createResource.mutateAsync({
        data: { title: newTitle, url: newUrl, description: newDesc || undefined, format: newFormat, subject: newSubject, gradeLevel: newGrade },
      });
      queryClient.invalidateQueries({ queryKey: getListResourcesQueryKey() });
      toast({ title: 'Resource submitted!', description: `"${newTitle}" has been added.` });
      resetForm();
      setDialogOpen(false);
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to submit', variant: 'destructive' });
    }
  }

  async function handleAddDiscovered(resource: DiscoveredResource) {
    if (!isLoggedIn) { setLocation('/auth/login'); return; }
    setAddingUrl(resource.url);
    try {
      await createResource.mutateAsync({
        data: {
          title: resource.title,
          url: resource.url,
          description: resource.description,
          format: resource.format as ResourceInputFormat,
          subject: resource.subject ?? 'General',
          gradeLevel: resource.gradeLevel ?? 'All grades',
        },
      });
      queryClient.invalidateQueries({ queryKey: getListResourcesQueryKey() });
      toast({ title: 'Added to library!', description: `"${resource.title}" is now in your library.` });
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to add', variant: 'destructive' });
    } finally {
      setAddingUrl(null);
    }
  }

  const hasLibraryResults = !libraryLoading && resources && resources.length > 0;
  const noLibraryResults = !libraryLoading && (!resources || resources.length === 0);
  const showWebSection = discoverEnabled;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Resources</h1>
          <p className="text-muted-foreground text-sm mt-1">Search your library and the entire web at once</p>
        </div>
        {isLoggedIn ? (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="submit-resource-button"><Plus size={16} className="mr-1.5" /> Submit Resource</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Submit a Resource</DialogTitle>
                <DialogDescription>Share a learning resource with the community</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="res-title">Title</Label>
                  <Input id="res-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required data-testid="resource-title-input" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="res-url">URL</Label>
                  <Input id="res-url" type="url" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} required data-testid="resource-url-input" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="res-desc">Description (optional)</Label>
                  <Textarea id="res-desc" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={2} data-testid="resource-desc-input" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Format</Label>
                    <Select value={newFormat} onValueChange={(v) => setNewFormat(v as ResourceInputFormat)}>
                      <SelectTrigger data-testid="resource-format-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.values(ResourceInputFormat).map((f) => (
                          <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="res-subject">Subject</Label>
                    <Input id="res-subject" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} required data-testid="resource-subject-input" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="res-grade">Grade Level</Label>
                  <Input id="res-grade" value={newGrade} onChange={(e) => setNewGrade(e.target.value)} required data-testid="resource-grade-input" />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
                  <Button type="submit" disabled={createResource.isPending} data-testid="submit-resource-confirm">
                    {createResource.isPending ? 'Submitting…' : 'Submit'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        ) : (
          <Button variant="outline" asChild data-testid="sign-in-to-submit">
            <Link href="/auth/login"><LogIn size={15} className="mr-1.5" /> Sign in to submit</Link>
          </Button>
        )}
      </div>

      {/* ── Search bar ─────────────────────────────────────────────────── */}
      <form onSubmit={handleSearchSubmit} className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              className="pl-9 h-11 text-base"
              placeholder="Search anything — photosynthesis, calculus lectures, Python tutorials…"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              data-testid="search-input"
            />
          </div>
          <Button type="submit" size="lg" className="shrink-0" disabled={!inputValue.trim()}>
            <Search size={15} className="mr-1.5" /> Search
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={formatFilter || 'all'} onValueChange={(v) => setFormatFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-36 h-8 text-xs" data-testid="format-filter"><SelectValue placeholder="All formats" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All formats</SelectItem>
              {FORMAT_OPTIONS.map((f) => <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            className="w-36 h-8 text-xs"
            placeholder="Subject…"
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            data-testid="subject-filter"
          />
        </div>
      </form>

      {/* ── Library section ────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <BookOpen size={14} /> Library{activeQuery ? ` — matching "${activeQuery}"` : ''}
        </h2>

        {libraryLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardHeader><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/2 mt-1" /></CardHeader>
                <CardContent><Skeleton className="h-16 w-full" /></CardContent>
                <CardFooter><Skeleton className="h-4 w-24" /></CardFooter>
              </Card>
            ))}
          </div>
        ) : noLibraryResults ? (
          <p className="text-sm text-muted-foreground py-4">
            {activeQuery ? `No library resources match "${activeQuery}".` : 'No resources yet — be the first to submit one.'}
            {showWebSection && ' Check the web results below.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {resources!.map((resource) => (
              <Card
                key={resource.id}
                className="cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
                onClick={() => setLocation(`/resources/${resource.id}`)}
                data-testid="resource-card"
              >
                {getYouTubeId(resource.url) && (
                  <div className="w-full h-36 overflow-hidden bg-black">
                    <img
                      src={`https://img.youtube.com/vi/${getYouTubeId(resource.url)}/hqdefault.jpg`}
                      alt={resource.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                )}
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base line-clamp-2">{resource.title}</CardTitle>
                    <FormatBadge format={resource.format} />
                  </div>
                  <CardDescription className="text-xs">{resource.subject} · {resource.gradeLevel}</CardDescription>
                </CardHeader>
                {resource.description && (
                  <CardContent className="pb-2">
                    <p className="text-sm text-muted-foreground line-clamp-2">{resource.description}</p>
                  </CardContent>
                )}
                <CardFooter className="flex items-center justify-between pt-2">
                  <StarRating value={resource.avgRating} size="sm" />
                  <span className="text-xs text-muted-foreground">{resource.reviewCount} review{resource.reviewCount !== 1 ? 's' : ''}</span>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ── Sign-up nudge (unauthenticated, non-empty library) ─────────── */}
      {!isLoggedIn && hasLibraryResults && !activeQuery && (
        <div className="rounded-lg border border-border bg-muted/40 px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-medium text-foreground text-sm">Want to save resources and track your classes?</p>
            <p className="text-xs text-muted-foreground mt-0.5">Create a free Schooler account.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" asChild><Link href="/auth/login">Sign in</Link></Button>
            <Button size="sm" asChild><Link href="/auth/register">Get started</Link></Button>
          </div>
        </div>
      )}

      {/* ── Web results section ────────────────────────────────────────── */}
      {showWebSection && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Sparkles size={14} /> From the Web — "{activeQuery}"
          </h2>

          {discoverLoading && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" /> Searching the web…
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="overflow-hidden">
                    <Skeleton className="h-36 w-full" />
                    <CardHeader><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/2 mt-1" /></CardHeader>
                    <CardContent><Skeleton className="h-12 w-full" /></CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {discoverError && !discoverLoading && (
            <div className="py-6 text-center">
              <p className="text-sm text-destructive">Web search failed — please try again.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setActiveQuery('')}>Clear</Button>
            </div>
          )}

          {!discoverLoading && !discoverError && discovered && (
            <>
              {!isLoggedIn && (
                <p className="text-xs text-muted-foreground mb-3">
                  <Link href="/auth/login" className="text-primary underline">Sign in</Link> to add results to your library.
                </p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {discovered.map((r, i) => {
                  const ytId = getYouTubeId(r.url);
                  const thumb = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : r.thumbnailUrl ?? null;
                  return (
                    <Card key={i} className="flex flex-col overflow-hidden">
                      {thumb && (
                        <div className="w-full h-36 overflow-hidden bg-black shrink-0">
                          <img src={thumb} alt={r.title} className="w-full h-full object-cover" loading="lazy" />
                        </div>
                      )}
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-base line-clamp-2 leading-snug">{r.title}</CardTitle>
                          <FormatBadge format={r.format} />
                        </div>
                        <CardDescription className="text-xs">
                          {r.source}{r.subject ? ` · ${r.subject}` : ''}{r.gradeLevel ? ` · ${r.gradeLevel}` : ''}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pb-2 flex-1">
                        <p className="text-sm text-muted-foreground line-clamp-3">{r.description}</p>
                      </CardContent>
                      <CardFooter className="gap-2 pt-2 flex-wrap">
                        <Button size="sm" variant="outline" asChild className="flex-1">
                          <a href={r.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink size={12} className="mr-1.5" /> Open
                          </a>
                        </Button>
                        <Button size="sm" className="flex-1" disabled={addingUrl === r.url} onClick={() => handleAddDiscovered(r)}>
                          {addingUrl === r.url
                            ? <><Loader2 size={12} className="mr-1.5 animate-spin" /> Adding…</>
                            : <><Plus size={12} className="mr-1.5" /> Add to Library</>}
                        </Button>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}

      {/* ── Empty state (no search yet) ────────────────────────────────── */}
      {!activeQuery && noLibraryResults && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Globe size={40} className="text-muted-foreground mb-4 opacity-50" />
          <p className="font-semibold text-foreground">Search to find anything</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Type a topic above and hit Search — Schooler looks through the library and across the entire web simultaneously.
          </p>
        </div>
      )}
    </div>
  );
}
