import { useState, useRef } from 'react';
import { useLocation, Link } from 'wouter';
import { Search, Plus, BookOpen, LogIn, Globe, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@workspace/edu-ds/components/ui/button';
import { Input } from '@workspace/edu-ds/components/ui/input';
import { Label } from '@workspace/edu-ds/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@workspace/edu-ds/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@workspace/edu-ds/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/edu-ds/components/ui/select';
import { Badge } from '@workspace/edu-ds/components/ui/badge';
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
  } catch {
    return null;
  }
}

// ── Discover result card ──────────────────────────────────────────────────────

function DiscoverCard({ resource, onAddToLibrary, isAdding }: {
  resource: DiscoveredResource;
  onAddToLibrary: (r: DiscoveredResource) => void;
  isAdding: boolean;
}) {
  const ytId = getYouTubeId(resource.url);
  const thumb = ytId
    ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`
    : resource.thumbnailUrl ?? null;

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
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 capitalize ${FORMAT_COLORS[resource.format] ?? FORMAT_COLORS.other}`}>
            {resource.format}
          </span>
        </div>
        <CardDescription className="text-xs">{resource.source}{resource.subject ? ` · ${resource.subject}` : ''}{resource.gradeLevel ? ` · ${resource.gradeLevel}` : ''}</CardDescription>
      </CardHeader>
      <CardContent className="pb-2 flex-1">
        <p className="text-sm text-muted-foreground line-clamp-3">{resource.description}</p>
      </CardContent>
      <CardFooter className="gap-2 pt-2 flex-wrap">
        <Button size="sm" variant="outline" asChild className="flex-1">
          <a href={resource.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={13} className="mr-1.5" /> Open
          </a>
        </Button>
        <Button size="sm" className="flex-1" disabled={isAdding} onClick={() => onAddToLibrary(resource)}>
          {isAdding ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Plus size={13} className="mr-1.5" />}
          {isAdding ? 'Adding…' : 'Add to Library'}
        </Button>
      </CardFooter>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'library' | 'discover';

export default function ResourcesPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>('library');

  // Library state
  const [search, setSearch] = useState('');
  const [formatFilter, setFormatFilter] = useState<string>('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newFormat, setNewFormat] = useState<ResourceInputFormat>(ResourceInputFormat.article);
  const [newSubject, setNewSubject] = useState('');
  const [newGrade, setNewGrade] = useState('');

  // Discover state
  const [discoverQuery, setDiscoverQuery] = useState('');
  const [discoverFormat, setDiscoverFormat] = useState('');
  const [discoverSubject, setDiscoverSubject] = useState('');
  const [discoverGrade, setDiscoverGrade] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState<{ q: string; format?: DiscoverResourcesFormat; subject?: string; gradeLevel?: string } | null>(null);
  const [addingUrl, setAddingUrl] = useState<string | null>(null);
  const discoverInputRef = useRef<HTMLInputElement>(null);

  const libraryParams = {
    ...(search ? { q: search } : {}),
    ...(formatFilter && formatFilter !== 'all' ? { format: formatFilter as ListResourcesFormat } : {}),
    ...(subjectFilter ? { subject: subjectFilter } : {}),
  };

  const { data: resources, isLoading: libraryLoading } = useListResources(libraryParams);
  const { data: me } = useGetMe({ query: { retry: false, queryKey: getGetMeQueryKey() } });
  const createResource = useCreateResource();
  const isLoggedIn = !!me;

  // Discover query — only fires when submittedSearch is set
  const discoverParams = submittedSearch ?? { q: '__placeholder__' };
  const { data: discovered, isFetching: discoverLoading, isError: discoverError } = useDiscoverResources(discoverParams, {
    query: {
      enabled: !!submittedSearch,
      staleTime: 1000 * 60 * 5,
      queryKey: getDiscoverResourcesQueryKey(discoverParams),
    },
  });

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

  function handleDiscoverSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = discoverQuery.trim();
    if (!q) return;
    setSubmittedSearch({
      q,
      ...(discoverFormat && discoverFormat !== 'all' ? { format: discoverFormat as DiscoverResourcesFormat } : {}),
      ...(discoverSubject.trim() ? { subject: discoverSubject.trim() } : {}),
      ...(discoverGrade.trim() ? { gradeLevel: discoverGrade.trim() } : {}),
    });
  }

  async function handleAddDiscovered(resource: DiscoveredResource) {
    if (!isLoggedIn) {
      setLocation('/auth/login');
      return;
    }
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

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header + tab toggle */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Resources</h1>
          <p className="text-muted-foreground text-sm mt-1">Browse your library or discover anything on the web</p>
        </div>

        {tab === 'library' && (
          isLoggedIn ? (
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
                      <Label htmlFor="res-format">Format</Label>
                      <Select value={newFormat} onValueChange={(v) => setNewFormat(v as ResourceInputFormat)}>
                        <SelectTrigger id="res-format" data-testid="resource-format-select"><SelectValue /></SelectTrigger>
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
          )
        )}
      </div>

      {/* Tab toggle */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        <button
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === 'library' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setTab('library')}
        >
          <BookOpen size={14} className="inline mr-1.5 -mt-0.5" />
          Library
        </button>
        <button
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === 'discover' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => { setTab('discover'); setTimeout(() => discoverInputRef.current?.focus(), 50); }}
        >
          <Globe size={14} className="inline mr-1.5 -mt-0.5" />
          Discover
        </button>
      </div>

      {/* ── LIBRARY TAB ────────────────────────────────────────────────── */}
      {tab === 'library' && (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search resources…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="search-input" />
            </div>
            <Select value={formatFilter || 'all'} onValueChange={(v) => setFormatFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-36" data-testid="format-filter"><SelectValue placeholder="All formats" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All formats</SelectItem>
                {FORMAT_OPTIONS.map((f) => <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input className="w-40" placeholder="Subject…" value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} data-testid="subject-filter" />
          </div>

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
          ) : !resources || resources.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <BookOpen size={40} className="text-muted-foreground mb-4" />
              <h3 className="font-semibold text-foreground">No resources found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Try adjusting your filters, submit a new resource, or{' '}
                <button className="text-primary underline" onClick={() => setTab('discover')}>search the web</button>.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {resources.map((resource) => (
                <Card key={resource.id} className="cursor-pointer hover:shadow-md transition-shadow overflow-hidden" onClick={() => setLocation(`/resources/${resource.id}`)} data-testid="resource-card">
                  {getYouTubeId(resource.url) && (
                    <div className="w-full h-36 overflow-hidden bg-black">
                      <img src={`https://img.youtube.com/vi/${getYouTubeId(resource.url)}/hqdefault.jpg`} alt={resource.title} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                  )}
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base line-clamp-2">{resource.title}</CardTitle>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 capitalize ${FORMAT_COLORS[resource.format] ?? FORMAT_COLORS.other}`}>{resource.format}</span>
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

          {!isLoggedIn && resources && resources.length > 0 && (
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
        </>
      )}

      {/* ── DISCOVER TAB ───────────────────────────────────────────────── */}
      {tab === 'discover' && (
        <>
          {/* Search form */}
          <form onSubmit={handleDiscoverSearch} className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={discoverInputRef}
                  className="pl-9 text-base h-11"
                  placeholder={'Search anything — e.g. "photosynthesis for beginners" or "calculus MIT lectures"…'}
                  value={discoverQuery}
                  onChange={(e) => setDiscoverQuery(e.target.value)}
                  data-testid="discover-search-input"
                />
              </div>
              <Button type="submit" size="lg" disabled={!discoverQuery.trim() || discoverLoading} data-testid="discover-search-button">
                {discoverLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                <span className="ml-2 hidden sm:inline">Search</span>
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={discoverFormat || 'all'} onValueChange={(v) => setDiscoverFormat(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Any format" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any format</SelectItem>
                  {FORMAT_OPTIONS.map((f) => <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input className="w-36 h-8 text-xs" placeholder="Subject…" value={discoverSubject} onChange={(e) => setDiscoverSubject(e.target.value)} />
              <Input className="w-36 h-8 text-xs" placeholder="Grade level…" value={discoverGrade} onChange={(e) => setDiscoverGrade(e.target.value)} />
            </div>
          </form>

          {/* Results */}
          {!submittedSearch && (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
              <Globe size={44} className="mb-4 opacity-40" />
              <p className="font-medium text-foreground">Search anything educational</p>
              <p className="text-sm mt-1 max-w-sm">Schooler searches the entire web and surfaces the best matching resources — YouTube videos, articles, PDFs, courses, and more.</p>
            </div>
          )}

          {submittedSearch && discoverLoading && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Searching the web for "{submittedSearch.q}"…</p>
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

          {submittedSearch && discoverError && !discoverLoading && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-destructive font-medium">Search failed — please try again.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setSubmittedSearch({ ...submittedSearch })}>Retry</Button>
            </div>
          )}

          {submittedSearch && !discoverLoading && !discoverError && discovered && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm text-muted-foreground">{discovered.length} result{discovered.length !== 1 ? 's' : ''} for <span className="font-medium text-foreground">"{submittedSearch.q}"</span></p>
                {!isLoggedIn && <p className="text-xs text-muted-foreground"><Link href="/auth/login" className="text-primary underline">Sign in</Link> to add results to your library.</p>}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {discovered.map((r, i) => (
                  <DiscoverCard
                    key={i}
                    resource={r}
                    onAddToLibrary={handleAddDiscovered}
                    isAdding={addingUrl === r.url}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
