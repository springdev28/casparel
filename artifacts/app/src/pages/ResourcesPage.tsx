import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { Search, Plus, BookOpen, LogIn } from 'lucide-react';
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
  getListResourcesQueryKey,
  getGetMeQueryKey,
  ListResourcesFormat,
  ResourceInputFormat,
} from '@workspace/api-client-react';
import { StarRating } from '../components/StarRating';

const FORMAT_OPTIONS = Object.values(ListResourcesFormat);

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

const FORMAT_COLORS: Record<string, string> = {
  article: 'bg-blue-100 text-blue-700',
  video: 'bg-red-100 text-red-700',
  pdf: 'bg-orange-100 text-orange-700',
  podcast: 'bg-purple-100 text-purple-700',
  interactive: 'bg-emerald-100 text-emerald-700',
  other: 'bg-gray-100 text-gray-700',
};

export default function ResourcesPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [formatFilter, setFormatFilter] = useState<string>('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newFormat, setNewFormat] = useState<ResourceInputFormat>(ResourceInputFormat.article);
  const [newSubject, setNewSubject] = useState('');
  const [newGrade, setNewGrade] = useState('');

  const params = {
    ...(search ? { q: search } : {}),
    ...(formatFilter && formatFilter !== 'all' ? { format: formatFilter as ListResourcesFormat } : {}),
    ...(subjectFilter ? { subject: subjectFilter } : {}),
  };

  const { data: resources, isLoading } = useListResources(params);
  const { data: me } = useGetMe({ query: { retry: false, queryKey: getGetMeQueryKey() } });
  const createResource = useCreateResource();

  const isLoggedIn = !!me;

  function resetForm() {
    setNewTitle('');
    setNewUrl('');
    setNewDesc('');
    setNewFormat(ResourceInputFormat.article);
    setNewSubject('');
    setNewGrade('');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createResource.mutateAsync({
        data: {
          title: newTitle,
          url: newUrl,
          description: newDesc || undefined,
          format: newFormat,
          subject: newSubject,
          gradeLevel: newGrade,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListResourcesQueryKey() });
      toast({ title: 'Resource submitted!', description: `"${newTitle}" has been added.` });
      resetForm();
      setDialogOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit resource';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Resources</h1>
          <p className="text-muted-foreground text-sm mt-1">Browse and share learning resources</p>
        </div>

        {isLoggedIn ? (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="submit-resource-button">
                <Plus size={16} className="mr-1.5" /> Submit Resource
              </Button>
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
                      <SelectTrigger id="res-format" data-testid="resource-format-select">
                        <SelectValue />
                      </SelectTrigger>
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
            <Link href="/auth/login">
              <LogIn size={15} className="mr-1.5" /> Sign in to submit
            </Link>
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search resources…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="search-input"
          />
        </div>
        <Select value={formatFilter || 'all'} onValueChange={(v) => setFormatFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-36" data-testid="format-filter">
            <SelectValue placeholder="All formats" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All formats</SelectItem>
            {FORMAT_OPTIONS.map((f) => (
              <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="w-40"
          placeholder="Subject…"
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          data-testid="subject-filter"
        />
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2 mt-1" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-16 w-full" />
              </CardContent>
              <CardFooter>
                <Skeleton className="h-4 w-24" />
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : !resources || resources.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen size={40} className="text-muted-foreground mb-4" />
          <h3 className="font-semibold text-foreground">No resources found</h3>
          <p className="text-sm text-muted-foreground mt-1">Try adjusting your filters or submit a new resource.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {resources.map((resource) => (
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
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 capitalize ${FORMAT_COLORS[resource.format] ?? FORMAT_COLORS.other}`}>
                    {resource.format}
                  </span>
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

      {/* Unauthenticated sign-up nudge at the bottom of a full list */}
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
    </div>
  );
}
