import { useState, useRef } from 'react';
import { useLocation, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Search, Plus, LogIn, Globe, ExternalLink, Loader2, BookOpen, Sparkles, X, Wand2 } from 'lucide-react';
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
  useGetResourceRecommendations,
  usePrefetchResourceMetadata,
  getDiscoverResourcesQueryKey,
  getListResourcesQueryKey,
  getGetMeQueryKey,
  getGetResourceRecommendationsQueryKey,
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

function isVimeoUrl(url: string): boolean {
  try {
    return new URL(url).hostname.includes('vimeo.com');
  } catch { return false; }
}

function useVimeoThumbnail(url: string, enabled: boolean) {
  return useQuery<string | null>({
    queryKey: ['vimeo-thumbnail', url],
    queryFn: async () => {
      const res = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return (data.thumbnail_url as string) ?? null;
    },
    enabled,
    staleTime: 1000 * 60 * 60, // 1 hour — thumbnail URLs don't change
    retry: false,
  });
}

function FormatBadge({ format }: { format: string }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 capitalize ${FORMAT_COLORS[format] ?? FORMAT_COLORS.other}`}>
      {format}
    </span>
  );
}

// ── Shared resource card (library) ────────────────────────────────────────────
function LibraryCard({ resource, onClick }: {
  resource: { id: number; title: string; url: string; format: string; subject: string; gradeLevel: string; description?: string | null; avgRating: number; reviewCount: number };
  onClick: () => void;
}) {
  const ytId = getYouTubeId(resource.url);
  const vimeo = isVimeoUrl(resource.url);
  const { data: vimeoThumb } = useVimeoThumbnail(resource.url, vimeo && !ytId);
  const thumb = ytId
    ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`
    : vimeoThumb ?? null;
  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow overflow-hidden" onClick={onClick} data-testid="resource-card">
      {thumb && (
        <div className="w-full h-36 overflow-hidden bg-black">
          <img src={thumb} alt={resource.title} className="w-full h-full object-cover" loading="lazy" />
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
  );
}

// ── Web result card ───────────────────────────────────────────────────────────
function WebCard({ resource, onAdd, adding }: {
  resource: DiscoveredResource;
  onAdd: (r: DiscoveredResource) => void;
  adding: boolean;
}) {
  const ytId = getYouTubeId(resource.url);
  const thumb = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : resource.thumbnailUrl ?? null;
  return (
    <Card className="flex flex-col overflow-hidden">
      {thumb && (
        <div className="w-full h-36 overflow-hidden bg-black shrink-0">
          <img src={thumb} alt={resource.title} className="w-full h-full object-cover" loading="lazy" />
        </div>
      )}
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base line-clamp-2 leading-snug">{resource.title}</CardTitle>
          <FormatBadge format={resource.format} />
        </div>
        <CardDescription className="text-xs">
          {resource.source}{resource.subject ? ` · ${resource.subject}` : ''}{resource.gradeLevel ? ` · ${resource.gradeLevel}` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-2 flex-1">
        <p className="text-sm text-muted-foreground line-clamp-3">{resource.description}</p>
      </CardContent>
      <CardFooter className="gap-2 pt-2 flex-wrap">
        <Button size="sm" variant="outline" asChild className="flex-1">
          <a href={resource.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={12} className="mr-1.5" /> Open
          </a>
        </Button>
        <Button size="sm" className="flex-1" disabled={adding} onClick={() => onAdd(resource)}>
          {adding ? <><Loader2 size={12} className="mr-1.5 animate-spin" /> Adding…</> : <><Plus size={12} className="mr-1.5" /> Save</>}
        </Button>
      </CardFooter>
    </Card>
  );
}

// ── Skeleton grid ─────────────────────────────────────────────────────────────
function CardSkeletons({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardHeader><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/2 mt-1" /></CardHeader>
          <CardContent><Skeleton className="h-14 w-full" /></CardContent>
          <CardFooter><Skeleton className="h-4 w-24" /></CardFooter>
        </Card>
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ResourcesPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [inputValue, setInputValue] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [formatFilter, setFormatFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [libraryLimit, setLibraryLimit] = useState(12);

  const isSearching = activeQuery.trim().length > 0;

  // Auth
  const { data: me } = useGetMe({ query: { retry: false, queryKey: getGetMeQueryKey() } });
  const isLoggedIn = !!me;

  // Recommendations (shown when NOT searching)
  const { data: recommendations, isLoading: recsLoading } = useGetResourceRecommendations({
    query: { queryKey: getGetResourceRecommendationsQueryKey(), staleTime: 1000 * 60 * 5 },
  });

  // Library search results (shown when searching)
  const libraryParams = {
    ...(activeQuery ? { q: activeQuery } : {}),
    ...(formatFilter && formatFilter !== 'all' ? { format: formatFilter as ListResourcesFormat } : {}),
    ...(subjectFilter.trim() ? { subject: subjectFilter.trim() } : {}),
    limit: libraryLimit,
    offset: 0,
  };
  const { data: libraryResults, isLoading: libraryLoading } = useListResources(libraryParams, {
    query: { enabled: isSearching, queryKey: getListResourcesQueryKey(libraryParams) },
  });

  // Web discover (shown when searching)
  const discoverParams = {
    q: activeQuery,
    ...(formatFilter && formatFilter !== 'all' ? { format: formatFilter as DiscoverResourcesFormat } : {}),
    ...(subjectFilter.trim() ? { subject: subjectFilter.trim() } : {}),
  };
  const { data: webResults, isFetching: webLoading, isError: webError } = useDiscoverResources(
    discoverParams,
    { query: { enabled: isSearching, staleTime: 1000 * 60 * 5, queryKey: getDiscoverResourcesQueryKey(discoverParams) } }
  );

  const createResource = useCreateResource();
  const prefetchMetadata = usePrefetchResourceMetadata();
  const [addingUrl, setAddingUrl] = useState<string | null>(null);

  // Submit form
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newFormat, setNewFormat] = useState<ResourceInputFormat>(ResourceInputFormat.article);
  const [newSubject, setNewSubject] = useState('');
  const [newGrade, setNewGrade] = useState('');
  const [prefetching, setPrefetching] = useState(false);
  // Track which URL is currently being fetched so stale responses don't clobber newer edits
  const prefetchingUrlRef = useRef<string>('');

  async function handleUrlBlur() {
    const url = newUrl.trim();
    if (!url) return;
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
    } catch { return; } // not a valid URL yet — skip
    // Don't prefetch if title is already filled (user typed it themselves)
    if (newTitle.trim()) return;

    prefetchingUrlRef.current = url;
    setPrefetching(true);
    try {
      const meta = await prefetchMetadata.mutateAsync({ data: { url } });
      // Only apply if the URL hasn't changed since we fired this request
      if (prefetchingUrlRef.current !== url) return;
      // Use functional updaters so we read the *current* state, not the closure-captured one.
      // This prevents a stale response from overwriting text the user typed while waiting.
      if (meta.title) setNewTitle((cur) => cur.trim() ? cur : meta.title);
      if (meta.description) setNewDesc((cur) => cur.trim() ? cur : meta.description);
      if (meta.format) setNewFormat((cur) => cur !== ResourceInputFormat.article ? cur : meta.format as ResourceInputFormat);
    } catch {
      // silently ignore — user can fill in manually
    } finally {
      if (prefetchingUrlRef.current === url) setPrefetching(false);
    }
  }

  function clearSearch() {
    setInputValue('');
    setActiveQuery('');
    inputRef.current?.focus();
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = inputValue.trim();
    if (q) {
      setActiveQuery(q);
      setLibraryLimit(12); // reset pagination on new search
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
      await createResource.mutateAsync({ data: { title: newTitle, url: newUrl, description: newDesc || undefined, format: newFormat, subject: newSubject, gradeLevel: newGrade } });
      queryClient.invalidateQueries({ queryKey: getListResourcesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetResourceRecommendationsQueryKey() });
      toast({ title: 'Resource submitted!', description: `"${newTitle}" has been added.` });
      resetForm();
      setDialogOpen(false);
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' });
    }
  }

  async function handleAddWeb(resource: DiscoveredResource) {
    if (!isLoggedIn) { setLocation('/auth/login'); return; }
    setAddingUrl(resource.url);
    try {
      await createResource.mutateAsync({
        data: { title: resource.title, url: resource.url, description: resource.description, format: resource.format as ResourceInputFormat, subject: resource.subject ?? 'General', gradeLevel: resource.gradeLevel ?? 'All grades' },
      });
      queryClient.invalidateQueries({ queryKey: getListResourcesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetResourceRecommendationsQueryKey() });
      toast({ title: 'Saved to library!', description: `"${resource.title}" added.` });
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' });
    } finally {
      setAddingUrl(null);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Resources</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isSearching
              ? `Showing library results and web results for "${activeQuery}"`
              : isLoggedIn
                ? 'Your personalised library — based on what you\'ve been learning'
                : 'Top-rated resources to get you started'}
          </p>
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
                  <Label htmlFor="res-url" className="flex items-center gap-1.5">
                    URL
                    {prefetching && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> auto-filling…</span>}
                    {!prefetching && newTitle && newUrl && <span className="text-xs text-muted-foreground flex items-center gap-1"><Wand2 size={10} /> auto-filled</span>}
                  </Label>
                  <Input
                    id="res-url"
                    type="url"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    onBlur={handleUrlBlur}
                    required
                    data-testid="resource-url-input"
                  />
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
                      <SelectContent>{Object.values(ResourceInputFormat).map((f) => <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>)}</SelectContent>
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
            <Link href="/auth/login"><LogIn size={15} className="mr-1.5" /> Sign in</Link>
          </Button>
        )}
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearchSubmit} className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              className="pl-9 pr-9 h-11 text-base"
              placeholder={'Search anything — "photosynthesis", "MIT calculus", "Python for beginners"…'}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              data-testid="search-input"
            />
            {inputValue && (
              <button type="button" onClick={() => { setInputValue(''); setActiveQuery(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X size={15} />
              </button>
            )}
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
          <Input className="w-36 h-8 text-xs" placeholder="Subject…" value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} data-testid="subject-filter" />
        </div>
      </form>

      {/* ── RECOMMENDATIONS (default view, no active search) ─────────── */}
      {!isSearching && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-1.5">
            <BookOpen size={14} />
            {isLoggedIn ? 'Library — Recommended for you' : 'Library — Top rated'}
          </h2>
          {recsLoading
            ? <CardSkeletons />
            : !recommendations || recommendations.length === 0
              ? (
                <div className="py-12 text-center text-muted-foreground">
                  <BookOpen size={36} className="mx-auto mb-3 opacity-30" />
                  <p className="font-medium text-foreground">No resources yet</p>
                  <p className="text-sm mt-1">Be the first to submit one, or search to find resources across the web.</p>
                </div>
              )
              : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recommendations.map((r) => (
                    <LibraryCard key={r.id} resource={r} onClick={() => setLocation(`/resources/${r.id}`)} />
                  ))}
                </div>
              )
          }
          {!isLoggedIn && recommendations && recommendations.length > 0 && (
            <div className="mt-6 rounded-lg border bg-muted/40 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <p className="font-medium text-sm">Get personalised recommendations</p>
                <p className="text-xs text-muted-foreground mt-0.5">Sign in and Schooler learns what you like.</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" size="sm" asChild><Link href="/auth/login">Sign in</Link></Button>
                <Button size="sm" asChild><Link href="/auth/register">Get started</Link></Button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── SEARCH RESULTS ────────────────────────────────────────────── */}
      {isSearching && (
        <>
          {/* Library search results */}
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-1.5">
              <BookOpen size={14} /> Library — "{activeQuery}"
            </h2>
            {libraryLoading
              ? <CardSkeletons count={3} />
              : !libraryResults || libraryResults.length === 0
                ? <p className="text-sm text-muted-foreground py-2">No library results for "{activeQuery}".</p>
                : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {libraryResults.map((r) => (
                        <LibraryCard key={r.id} resource={r} onClick={() => setLocation(`/resources/${r.id}`)} />
                      ))}
                    </div>
                    {libraryResults.length === libraryLimit && (
                      <div className="mt-4 text-center">
                        <Button variant="outline" size="sm" onClick={() => setLibraryLimit((n) => n + 12)}>
                          Show more results
                        </Button>
                      </div>
                    )}
                  </>
                )
            }
          </section>

          {/* Web results */}
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-1.5">
              <Sparkles size={14} /> From the Web — "{activeQuery}"
            </h2>

            {webLoading && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" /> Searching the entire web…
                </p>
                <CardSkeletons />
              </div>
            )}

            {webError && !webLoading && (
              <div className="py-6 text-center">
                <p className="text-sm text-destructive font-medium">Web search failed — please try again.</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setActiveQuery(activeQuery)}>Retry</Button>
              </div>
            )}

            {!webLoading && !webError && webResults && (
              <>
                {!isLoggedIn && (
                  <p className="text-xs text-muted-foreground mb-3">
                    <Link href="/auth/login" className="text-primary underline">Sign in</Link> to save web results to your library.
                  </p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {webResults.map((r, i) => (
                    <WebCard key={i} resource={r} onAdd={handleAddWeb} adding={addingUrl === r.url} />
                  ))}
                </div>
              </>
            )}
          </section>

          <div className="pt-2">
            <Button variant="ghost" size="sm" onClick={clearSearch} className="text-muted-foreground">
              <X size={13} className="mr-1.5" /> Clear search — back to library
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
