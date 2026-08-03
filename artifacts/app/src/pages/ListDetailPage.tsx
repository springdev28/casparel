import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { ArrowLeft, Trash2, List, ExternalLink, BookOpen, RefreshCw, Check, AlertCircle } from 'lucide-react';
import { Button } from '@workspace/edu-ds/components/ui/button';
import { Card, CardContent } from '@workspace/edu-ds/components/ui/card';
import { Badge } from '@workspace/edu-ds/components/ui/badge';
import { Skeleton } from '@workspace/edu-ds/components/ui/skeleton';
import { Separator } from '@workspace/edu-ds/components/ui/separator';
import { Alert, AlertDescription } from '@workspace/edu-ds/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@workspace/edu-ds/components/ui/dialog';
import { toast } from '@workspace/edu-ds/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetResourceList,
  useRemoveListItem,
  useGetMe,
  useGetGCStatus,
  useListGCCourses,
  useShareToGC,
  getGetResourceListQueryKey,
  getGetGCStatusQueryKey,
  getListGCCoursesQueryKey,
  UserRole,
} from '@workspace/api-client-react';
import { StarRating } from '../components/StarRating';

const FORMAT_COLORS: Record<string, string> = {
  article: 'bg-blue-100 text-blue-700',
  video: 'bg-red-100 text-red-700',
  pdf: 'bg-orange-100 text-orange-700',
  podcast: 'bg-purple-100 text-purple-700',
  interactive: 'bg-emerald-100 text-emerald-700',
  other: 'bg-gray-100 text-gray-700',
};

export default function ListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const listId = Number(id);
  const [removingId, setRemovingId] = useState<number | null>(null);

  // Google Classroom share state
  const [gcDialogOpen, setGcDialogOpen] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  // Set to true when a GC API call returns 401/403 (token expired/revoked)
  const [gcReconnectNeeded, setGcReconnectNeeded] = useState(false);

  const { data: list, isLoading } = useGetResourceList(listId, {
    query: { enabled: !!listId, queryKey: getGetResourceListQueryKey(listId) },
  });
  const { data: me } = useGetMe();
  const removeItem = useRemoveListItem();

  // GC integration — only fetch status when the user is a teacher
  const isTeacher = me?.role === UserRole.teacher;
  const isOwner = me?.id != null && list != null && list.ownerId === me.id;
  const canShareToGC = isTeacher && isOwner;

  const { data: gcStatus } = useGetGCStatus({
    query: { enabled: canShareToGC, queryKey: getGetGCStatusQueryKey() },
  });
  const { data: gcCourses, isLoading: gcCoursesLoading, error: gcCoursesError } = useListGCCourses({
    query: {
      enabled: gcDialogOpen && gcStatus?.connected === true,
      queryKey: getListGCCoursesQueryKey(),
      retry: false,
    },
  });
  const shareToGC = useShareToGC();

  // Detect 401/403 from GC API calls → prompt re-authentication
  useEffect(() => {
    if (!gcCoursesError) return;
    const status = (gcCoursesError as { status?: number }).status;
    if (status === 401 || status === 403) {
      setGcDialogOpen(false);
      setGcReconnectNeeded(true);
    }
  }, [gcCoursesError]);

  async function handleRemove(itemId: number) {
    setRemovingId(itemId);
    try {
      await removeItem.mutateAsync({ id: listId, itemId });
      queryClient.invalidateQueries({ queryKey: getGetResourceListQueryKey(listId) });
      toast({ title: 'Item removed' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to remove item';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setRemovingId(null);
    }
  }

  async function handleShareToGC() {
    if (!selectedCourseId) return;
    try {
      const result = await shareToGC.mutateAsync({ data: { listId, courseId: selectedCourseId } });
      toast({
        title: 'Shared to Google Classroom!',
        description: result.url ? (
          <span>
            Posted to your course stream.{' '}
            <a href={result.url} target="_blank" rel="noopener noreferrer" className="underline">
              View in Google Classroom
            </a>
          </span>
        ) : 'Posted to your course stream.',
      });
      setGcDialogOpen(false);
      setSelectedCourseId(null);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 403) {
        setGcDialogOpen(false);
        setSelectedCourseId(null);
        setGcReconnectNeeded(true);
      } else {
        const message = err instanceof Error ? err.message : 'Failed to share to Google Classroom';
        toast({ title: 'Error', description: message, variant: 'destructive' });
      }
    }
  }

  function openGCShareDialog() {
    if (gcStatus?.connected) {
      setGcDialogOpen(true);
    } else {
      // Redirect to classes page to connect
      setLocation('/classes?connect_gc=1');
      toast({
        title: 'Connect Google Classroom first',
        description: 'Go to the Classes page and click "Connect Google Classroom".',
      });
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-32" />
        <Card>
          <div className="p-6">
            <Skeleton className="h-7 w-1/2" />
            <div className="mt-6 space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-16 w-16 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (!list) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-64">
        <List size={40} className="text-muted-foreground mb-3" />
        <p className="font-semibold text-foreground">List not found</p>
        <Button variant="outline" className="mt-4" onClick={() => setLocation('/lists')}>Back to Lists</Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">

      {/* Google Classroom reconnect banner */}
      {gcReconnectNeeded && gcStatus?.connected && (
        <Alert variant="destructive" className="flex items-start gap-3" data-testid="gc-reconnect-banner">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <AlertDescription className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="flex-1">
              Your Google Classroom connection has expired or been revoked. Reconnect to share resource lists.
            </span>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => setLocation('/classes?connect_gc=1')}
              data-testid="gc-reconnect-button"
            >
              <BookOpen size={13} className="mr-1.5 text-[#4285F4]" />
              Reconnect Google Classroom
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => setLocation('/lists')} data-testid="back-button">
          <ArrowLeft size={16} className="mr-1.5" /> Lists
        </Button>

        {/* Share to Google Classroom button — list owner + teacher + GC configured */}
        {canShareToGC && gcStatus?.configured && (
          <Button
            variant="outline"
            size="sm"
            onClick={openGCShareDialog}
            data-testid="share-to-gc-button"
          >
            <BookOpen size={15} className="mr-1.5 text-[#4285F4]" />
            {gcStatus.connected ? 'Share to Google Classroom' : 'Connect Google Classroom'}
          </Button>
        )}
      </div>

      {/* List Info */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">{list.name}</h1>
        {list.description && <p className="text-muted-foreground text-sm mt-1">{list.description}</p>}
        <p className="text-xs text-muted-foreground mt-1">{list.itemCount} item{list.itemCount !== 1 ? 's' : ''}</p>
      </div>

      {/* Items */}
      {list.items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <List size={36} className="text-muted-foreground mb-3" />
          <p className="font-semibold text-foreground">No items yet</p>
          <p className="text-sm text-muted-foreground mt-1">Browse resources and add them to this list.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.items.map((item) => (
            <Card key={item.id} data-testid="list-item-card">
              <CardContent className="py-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap">
                      <h3 className="text-sm font-medium text-foreground flex-1 min-w-0">
                        {item.resource.title}
                      </h3>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 capitalize ${FORMAT_COLORS[item.resource.format] ?? FORMAT_COLORS.other}`}>
                        {item.resource.format}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.resource.subject} · {item.resource.gradeLevel}</p>
                    {item.resource.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{item.resource.description}</p>
                    )}
                    {item.note && (
                      <p className="text-xs text-muted-foreground italic mt-1">Note: {item.note}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <StarRating value={item.resource.avgRating} size="sm" />
                      <span className="text-xs text-muted-foreground">{item.resource.reviewCount} review{item.resource.reviewCount !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" asChild>
                      <a href={item.resource.url} target="_blank" rel="noopener noreferrer" data-testid="open-resource-link">
                        <ExternalLink size={13} />
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleRemove(item.id)}
                      disabled={removingId === item.id}
                      data-testid="remove-item-button"
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Separator />

      {/* Google Classroom Share Dialog */}
      <Dialog open={gcDialogOpen} onOpenChange={(open) => { setGcDialogOpen(open); if (!open) setSelectedCourseId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen size={18} className="text-[#4285F4]" />
              Share to Google Classroom
            </DialogTitle>
            <DialogDescription>
              Choose a course to post <strong>{list.name}</strong> as an announcement to its stream.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-72 overflow-y-auto py-1">
            {gcCoursesLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3 items-center p-3 rounded-lg border">
                  <Skeleton className="h-5 w-5 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))
            ) : !gcCourses || gcCourses.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <BookOpen size={28} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">No active courses found in Google Classroom.</p>
              </div>
            ) : (
              gcCourses.map((course) => (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => setSelectedCourseId(course.id)}
                  className={`w-full flex items-center justify-between gap-3 p-3 rounded-lg border text-left transition-colors ${
                    selectedCourseId === course.id
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-muted/50'
                  }`}
                  data-testid="gc-course-option"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{course.name}</p>
                    {course.section && (
                      <p className="text-xs text-muted-foreground">{course.section}</p>
                    )}
                  </div>
                  {selectedCourseId === course.id && (
                    <Check size={16} className="shrink-0 text-primary" />
                  )}
                </button>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setGcDialogOpen(false); setSelectedCourseId(null); }}>
              Cancel
            </Button>
            <Button
              onClick={handleShareToGC}
              disabled={!selectedCourseId || shareToGC.isPending}
              data-testid="confirm-share-to-gc"
            >
              {shareToGC.isPending ? (
                <RefreshCw size={14} className="mr-1.5 animate-spin" />
              ) : (
                <BookOpen size={14} className="mr-1.5" />
              )}
              {shareToGC.isPending ? 'Sharing…' : 'Share to Stream'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
