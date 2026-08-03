import { useState } from 'react';
import { useParams, useLocation, Link } from 'wouter';
import { ArrowLeft, ExternalLink, Plus, BookOpen, LogIn, Search, ShieldCheck, ShieldAlert, Shield, ShieldX, ExternalLink as LinkIcon } from 'lucide-react';
import { Button } from '@workspace/edu-ds/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/edu-ds/components/ui/card';
import { Badge } from '@workspace/edu-ds/components/ui/badge';
import { Skeleton } from '@workspace/edu-ds/components/ui/skeleton';
import { Textarea } from '@workspace/edu-ds/components/ui/textarea';
import { Label } from '@workspace/edu-ds/components/ui/label';
import { Separator } from '@workspace/edu-ds/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@workspace/edu-ds/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/edu-ds/components/ui/select';
import { toast } from '@workspace/edu-ds/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  useGetResource,
  useListResourceReviews,
  useCreateResourceReview,
  useListResourceLists,
  useAddListItem,
  useGetMe,
  useGetResourceSourceReview,
  getListResourceReviewsQueryKey,
  getGetResourceQueryKey,
  getListResourcesQueryKey,
  getGetMeQueryKey,
  getListResourceListsQueryKey,
  getGetResourceSourceReviewQueryKey,
} from '@workspace/api-client-react';
import type { SourceReview } from '@workspace/api-client-react';
import { StarRating } from '../components/StarRating';

// ── Media helpers ────────────────────────────────────────────────────────────

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

function getVimeoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes('vimeo.com')) return null;
    // /123456789 or /video/123456789
    const m = u.pathname.match(/\/(?:video\/)?(\d+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function getLoomId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes('loom.com')) return null;
    // /share/abc123def or /embed/abc123def
    const m = u.pathname.match(/\/(?:share|embed)\/([a-zA-Z0-9]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function isPdf(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.endsWith('.pdf');
  } catch {
    return url.toLowerCase().endsWith('.pdf');
  }
}

function ResourceEmbed({ url }: { url: string }) {
  const ytId = getYouTubeId(url);
  if (ytId) {
    return (
      <div className="relative w-full overflow-hidden rounded-lg bg-black" style={{ aspectRatio: '16/9' }}>
        <iframe
          src={`https://www.youtube.com/embed/${ytId}`}
          title="YouTube video player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
        />
      </div>
    );
  }

  const vimeoId = getVimeoId(url);
  if (vimeoId) {
    return (
      <div className="relative w-full overflow-hidden rounded-lg bg-black" style={{ aspectRatio: '16/9' }}>
        <iframe
          src={`https://player.vimeo.com/video/${vimeoId}?badge=0&autopause=0`}
          title="Vimeo video player"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
        />
      </div>
    );
  }

  const loomId = getLoomId(url);
  if (loomId) {
    return (
      <div className="relative w-full overflow-hidden rounded-lg bg-black" style={{ aspectRatio: '16/9' }}>
        <iframe
          src={`https://www.loom.com/embed/${loomId}`}
          title="Loom video player"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
        />
      </div>
    );
  }

  if (isPdf(url)) {
    return (
      <div className="w-full rounded-lg overflow-hidden border bg-muted" style={{ height: '520px' }}>
        <iframe
          src={url}
          title="PDF viewer"
          className="w-full h-full border-0"
        />
      </div>
    );
  }

  return null;
}

// ── Trust metadata ────────────────────────────────────────────────────────────

const TRUST_META: Record<SourceReview['trustLevel'], { label: string; icon: typeof ShieldCheck; color: string }> = {
  high:    { label: 'Highly Trusted',    icon: ShieldCheck,  color: 'text-green-600' },
  medium:  { label: 'Generally Trusted', icon: Shield,       color: 'text-yellow-600' },
  low:     { label: 'Use with Caution',  icon: ShieldAlert,  color: 'text-orange-500' },
  unknown: { label: 'Trust Unknown',     icon: ShieldX,      color: 'text-muted-foreground' },
};

function SourceReviewPanel({ resourceId }: { resourceId: number }) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);

  const { data, isLoading, isError } = useGetResourceSourceReview(resourceId, {
    query: {
      enabled,
      queryKey: getGetResourceSourceReviewQueryKey(resourceId),
      staleTime: 1000 * 60 * 10, // cache 10 min — AI calls are expensive
    },
  });

  function handleOpen() {
    setEnabled(true);
    setOpen(true);
  }

  const trust = data ? TRUST_META[data.trustLevel] : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" onClick={handleOpen} data-testid="review-source-button">
          <Search size={14} className="mr-1.5" /> Review the Source
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Source Review</DialogTitle>
          <DialogDescription>
            AI-researched background on the publisher or uploader of this resource.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-3 py-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="text-xs text-muted-foreground text-center pt-1">Searching the web…</div>
          </div>
        )}

        {isError && (
          <div className="py-4 text-center text-sm text-destructive">
            Could not retrieve source information. Please try again later.
          </div>
        )}

        {data && trust && (
          <div className="space-y-4 py-1">
            {/* Source identity */}
            <div>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <p className="font-semibold text-foreground">{data.sourceName}</p>
                  <p className="text-xs text-muted-foreground capitalize">{data.sourceType.replace(/-/g, ' ')}</p>
                </div>
                <div className={`flex items-center gap-1.5 text-sm font-medium ${trust.color}`}>
                  <trust.icon size={16} />
                  <span>{trust.label}</span>
                </div>
              </div>
            </div>

            {/* Meta row */}
            {(data.founded || data.headquarters) && (
              <div className="flex gap-4 text-xs text-muted-foreground">
                {data.founded && <span>Founded: {data.founded}</span>}
                {data.headquarters && <span>Location: {data.headquarters}</span>}
              </div>
            )}

            <Separator />

            {/* Summary */}
            <p className="text-sm text-foreground leading-relaxed">{data.summary}</p>

            {/* Trust reason */}
            {data.trustReason && (
              <p className="text-xs text-muted-foreground italic border-l-2 pl-3">{data.trustReason}</p>
            )}

            {/* Links */}
            {data.links && data.links.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Learn more</p>
                <div className="flex flex-wrap gap-2">
                  {data.links.map((link, i) => (
                    <a
                      key={i}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <LinkIcon size={11} />
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground pt-1">
              This review is AI-generated from public web sources and may not be fully accurate.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ResourceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const resourceId = Number(id);

  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [addToListOpen, setAddToListOpen] = useState(false);
  const [selectedListId, setSelectedListId] = useState('');
  const [listNote, setListNote] = useState('');

  const { data: resource, isLoading: resourceLoading } = useGetResource(resourceId, {
    query: { enabled: !!resourceId, queryKey: getGetResourceQueryKey(resourceId) },
  });
  const { data: reviews, isLoading: reviewsLoading } = useListResourceReviews(resourceId, {
    query: { enabled: !!resourceId, queryKey: getListResourceReviewsQueryKey(resourceId) },
  });
  const { data: me } = useGetMe({ query: { retry: false, queryKey: getGetMeQueryKey() } });
  const { data: lists } = useListResourceLists({ query: { enabled: !!me, queryKey: getListResourceListsQueryKey() } });
  const createReview = useCreateResourceReview();
  const addListItem = useAddListItem();

  const isLoggedIn = !!me;

  async function handleReviewSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (reviewRating === 0) {
      toast({ title: 'Select a rating', description: 'Please choose 1–5 stars.', variant: 'destructive' });
      return;
    }
    try {
      await createReview.mutateAsync({
        id: resourceId,
        data: { rating: reviewRating, comment: reviewComment || undefined },
      });
      queryClient.invalidateQueries({ queryKey: getListResourceReviewsQueryKey(resourceId) });
      queryClient.invalidateQueries({ queryKey: getGetResourceQueryKey(resourceId) });
      queryClient.invalidateQueries({ queryKey: getListResourcesQueryKey() });
      toast({ title: 'Review submitted!' });
      setReviewRating(0);
      setReviewComment('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit review';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  }

  async function handleAddToList(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedListId) return;
    try {
      await addListItem.mutateAsync({
        id: Number(selectedListId),
        data: { resourceId, note: listNote || undefined },
      });
      toast({ title: 'Added to list!' });
      setAddToListOpen(false);
      setSelectedListId('');
      setListNote('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add to list';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  }

  if (resourceLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-40" />
        <Card>
          <CardHeader>
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-5 w-1/3 mt-1" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!resource) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-64">
        <BookOpen size={40} className="text-muted-foreground mb-3" />
        <p className="text-foreground font-semibold">Resource not found</p>
        <Button variant="outline" className="mt-4" onClick={() => setLocation('/resources')}>Back to Resources</Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Back */}
      <Button variant="ghost" size="sm" onClick={() => setLocation('/resources')} data-testid="back-button">
        <ArrowLeft size={16} className="mr-1.5" /> Resources
      </Button>

      {/* Resource Info */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-xl">{resource.title}</CardTitle>
              <CardDescription className="mt-1">{resource.subject} · {resource.gradeLevel}</CardDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <Badge variant="secondary" className="capitalize">{resource.format}</Badge>

              {/* Review the Source */}
              <SourceReviewPanel resourceId={resourceId} />

              {/* Add to List — auth-gated */}
              {isLoggedIn ? (
                <Dialog open={addToListOpen} onOpenChange={setAddToListOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" data-testid="add-to-list-button">
                      <Plus size={14} className="mr-1" /> Add to List
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add to a List</DialogTitle>
                      <DialogDescription>Choose which list to add this resource to</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAddToList} className="space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="list-select">List</Label>
                        {lists && lists.length > 0 ? (
                          <Select value={selectedListId} onValueChange={setSelectedListId}>
                            <SelectTrigger id="list-select" data-testid="list-select">
                              <SelectValue placeholder="Select a list…" />
                            </SelectTrigger>
                            <SelectContent>
                              {lists.map((l) => (
                                <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <p className="text-sm text-muted-foreground">No lists yet. Create one first.</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="list-note">Note (optional)</Label>
                        <Textarea id="list-note" value={listNote} onChange={(e) => setListNote(e.target.value)} rows={2} data-testid="list-note-input" />
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setAddToListOpen(false)}>Cancel</Button>
                        <Button type="submit" disabled={!selectedListId || addListItem.isPending} data-testid="add-to-list-confirm">
                          {addListItem.isPending ? 'Adding…' : 'Add to List'}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              ) : (
                <Button size="sm" variant="outline" asChild data-testid="sign-in-to-save">
                  <Link href="/auth/login"><Plus size={14} className="mr-1" /> Save to List</Link>
                </Button>
              )}

              <Button size="sm" asChild>
                <a href={resource.url} target="_blank" rel="noopener noreferrer" data-testid="open-resource-link">
                  <ExternalLink size={14} className="mr-1" /> Open
                </a>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Inline embed for YouTube and PDF resources */}
          <ResourceEmbed url={resource.url} />

          {resource.description && (
            <p className="text-sm text-muted-foreground">{resource.description}</p>
          )}
          <div className="flex items-center gap-3">
            <StarRating value={resource.avgRating} />
            <span className="text-sm text-muted-foreground">{resource.avgRating.toFixed(1)} · {resource.reviewCount} review{resource.reviewCount !== 1 ? 's' : ''}</span>
          </div>
        </CardContent>
      </Card>

      {/* Reviews */}
      <section>
        <h2 className="text-lg font-semibold text-foreground mb-4">Reviews</h2>

        {/* Write a Review — auth-gated */}
        {isLoggedIn ? (
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Write a Review</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleReviewSubmit} className="space-y-3">
                <div>
                  <Label className="text-xs mb-1.5 block">Your rating</Label>
                  <StarRating value={reviewRating} onChange={setReviewRating} data-testid="review-rating" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="review-comment" className="text-xs">Comment (optional)</Label>
                  <Textarea
                    id="review-comment"
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="Share your thoughts…"
                    rows={2}
                    data-testid="review-comment-input"
                  />
                </div>
                <Button type="submit" size="sm" disabled={createReview.isPending} data-testid="submit-review-button">
                  {createReview.isPending ? 'Submitting…' : 'Submit Review'}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card className="mb-4 border-dashed">
            <CardContent className="py-5 flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">Sign in to write a review and help others find great resources.</p>
              <Button size="sm" asChild data-testid="sign-in-to-review">
                <Link href="/auth/login"><LogIn size={14} className="mr-1.5" /> Sign in</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Review List */}
        {reviewsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="py-3">
                  <div className="flex gap-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <Skeleton className="h-12 w-full mt-2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !reviews || reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No reviews yet. Be the first!</p>
        ) : (
          <div className="space-y-3">
            {reviews.map((review) => (
              <Card key={review.id} data-testid="review-item">
                <CardContent className="py-3">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{review.user.name}</span>
                      <StarRating value={review.rating} size="sm" />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(review.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  {review.comment && (
                    <p className="text-sm text-muted-foreground">{review.comment}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
      <Separator />
    </div>
  );
}
