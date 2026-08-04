import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { ArrowLeft, Trash2, List, ExternalLink, BookOpen, RefreshCw, Check, AlertCircle, GripVertical, Users } from 'lucide-react';
import { Button } from '@workspace/edu-ds/components/ui/button';
import { Card, CardContent } from '@workspace/edu-ds/components/ui/card';
import { Badge } from '@workspace/edu-ds/components/ui/badge';
import { Skeleton } from '@workspace/edu-ds/components/ui/skeleton';
import { Separator } from '@workspace/edu-ds/components/ui/separator';
import { Alert, AlertDescription } from '@workspace/edu-ds/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@workspace/edu-ds/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/edu-ds/components/ui/select';
import { toast } from '@workspace/edu-ds/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  useGetResourceList,
  useRemoveListItem,
  useReorderListItems,
  useGetMe,
  useGetGCStatus,
  useListGCCourses,
  useShareToGC,
  useListClasses,
  useShareListWithClass,
  getGetResourceListQueryKey,
  getListResourceListsQueryKey,
  getGetGCStatusQueryKey,
  getListGCCoursesQueryKey,
  getListClassesQueryKey,
  getListSharedResourceListsQueryKey,
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

interface ListItemData {
  id: number;
  listId: number;
  resourceId: number;
  note?: string | null;
  addedAt: string;
  position?: number;
  resource: {
    id: number;
    title: string;
    url: string;
    format: string;
    subject: string;
    gradeLevel: string;
    description?: string | null;
    avgRating: number;
    reviewCount: number;
  };
}
export default function ListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const listId = Number(id);
  const [removingId, setRemovingId] = useState<number | null>(null);

  // Local ordered items for optimistic drag-reorder
  const [orderedItems, setOrderedItems] = useState<ListItemData[] | null>(null);

  // Share with class state
  const [shareWithClassOpen, setShareWithClassOpen] = useState(false);
  const [shareClassId, setShareClassId] = useState('');

  // Google Classroom share state
  const [gcDialogOpen, setGcDialogOpen] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [gcReconnectNeeded, setGcReconnectNeeded] = useState(false);

  const { data: list, isLoading } = useGetResourceList(listId, {
    query: { enabled: !!listId, queryKey: getGetResourceListQueryKey(listId) },
  });
  const { data: me } = useGetMe();
  const removeItem = useRemoveListItem();
  const reorderItems = useReorderListItems();

  // Sync local order from server whenever the list data changes
  useEffect(() => {
    if (list?.items) {
      setOrderedItems(list.items as ListItemData[]);
    }
  }, [list?.items]);

  const isTeacher = (me?.activeRole ?? me?.role) === UserRole.teacher;
  const isOwner = me?.id != null && list != null && list.ownerId === me.id;
  const canShareToGC = isTeacher && isOwner;
  const canShareWithClass = isTeacher && isOwner;

  const { data: classes } = useListClasses({ query: { enabled: !!me, queryKey: getListClassesQueryKey() } });
  const shareWithClass = useShareListWithClass();

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

  useEffect(() => {
    if (!gcCoursesError) return;
    const status = (gcCoursesError as { status?: number }).status;
    if (status === 401 || status === 403) {
      setGcDialogOpen(false);
      setGcReconnectNeeded(true);
    }
  }, [gcCoursesError]);

  // ── DnD sensors ────────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !orderedItems) return;

    const oldIndex = orderedItems.findIndex((i) => i.id === active.id);
    const newIndex = orderedItems.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // Optimistic update
    const reordered = arrayMove(orderedItems, oldIndex, newIndex);
    setOrderedItems(reordered);

    try {
      await reorderItems.mutateAsync({
        id: listId,
        data: { itemIds: reordered.map((i) => i.id) },
      });
      // Invalidate so positions are fresh from server
      queryClient.invalidateQueries({ queryKey: getGetResourceListQueryKey(listId) });
    } catch {
      // Roll back optimistic update on failure
      setOrderedItems(orderedItems);
      toast({ title: 'Error', description: 'Failed to save new order', variant: 'destructive' });
    }
  }

  async function handleRemove(itemId: number) {
    setRemovingId(itemId);
    try {
      await removeItem.mutateAsync({ id: listId, itemId });
      queryClient.invalidateQueries({ queryKey: getGetResourceListQueryKey(listId) });
      queryClient.invalidateQueries({ queryKey: getListResourceListsQueryKey() });
      toast({ title: 'Item removed' });
    } catch (err: unknown) {
      // A 404 means the item was already removed (e.g. by another device/session).
      // Treat it as a successful removal so the UI stays consistent.
      const status = (err as { status?: number }).status;
      if (status === 404) {
        queryClient.invalidateQueries({ queryKey: getGetResourceListQueryKey(listId) });
        queryClient.invalidateQueries({ queryKey: getListResourceListsQueryKey() });
        toast({ title: 'Item removed' });
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to remove item';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setRemovingId(null);
    }
  }

  async function handleShareWithClass() {
    if (!shareClassId) return;
    try {
      await shareWithClass.mutateAsync({ id: listId, data: { classId: Number(shareClassId) } });
      queryClient.invalidateQueries({ queryKey: getListSharedResourceListsQueryKey() });
      toast({ title: 'Shared with class!', description: 'Students can now see this list on the class page.' });
      setShareWithClassOpen(false);
      setShareClassId('');
    } catch {
      toast({ title: 'Error', description: 'Could not share with the class.', variant: 'destructive' });
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

  const displayItems = orderedItems ?? (list.items as ListItemData[]);

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

        {canShareWithClass && (
          <Dialog open={shareWithClassOpen} onOpenChange={setShareWithClassOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" data-testid="share-with-class-button">
                <Users size={14} className="mr-1.5" /> Share with Class
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Share with Class</DialogTitle>
                <DialogDescription>Make this list visible to all members of a class.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {!classes || classes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">You're not in any classes yet.</p>
                ) : (
                  <Select value={shareClassId} onValueChange={setShareClassId}>
                    <SelectTrigger data-testid="share-class-select"><SelectValue placeholder="Select a class…" /></SelectTrigger>
                    <SelectContent>
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShareWithClassOpen(false)}>Cancel</Button>
                  <Button
                    onClick={handleShareWithClass}
                    disabled={!shareClassId || shareWithClass.isPending}
                    data-testid="share-with-class-confirm"
                  >
                    {shareWithClass.isPending ? 'Sharing…' : 'Share'}
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {canShareToGC && (
          gcStatus?.configured ? (
            <Button
              variant="outline"
              size="sm"
              onClick={openGCShareDialog}
              data-testid="share-to-gc-button"
            >
              <BookOpen size={15} className="mr-1.5 text-[#4285F4]" />
              {gcStatus.connected ? 'Share to Google Classroom' : 'Connect Google Classroom'}
            </Button>
          ) : gcStatus && !gcStatus.configured ? (
            <Button
              variant="outline"
              size="sm"
              disabled
              title="Google Classroom credentials are not configured on this server. Contact your admin."
              data-testid="share-to-gc-not-configured-button"
            >
              <BookOpen size={15} className="mr-1.5 text-muted-foreground" />
              Google Classroom (not configured)
            </Button>
          ) : null
        )}
      </div>

      {/* List Info */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">{list.name}</h1>
        {list.description && <p className="text-muted-foreground text-sm mt-1">{list.description}</p>}
        <p className="text-xs text-muted-foreground mt-1">{list.itemCount} item{list.itemCount !== 1 ? 's' : ''}</p>
      </div>

      {/* Items */}
      {displayItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <List size={36} className="text-muted-foreground mb-3" />
          <p className="font-semibold text-foreground">No items yet</p>
          <p className="text-sm text-muted-foreground mt-1">Browse resources and add them to this list.</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={displayItems.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {displayItems.map((item) => (
                <SortableItem
                  key={item.id}
                  item={item}
                  isRemoving={removingId === item.id}
                  isOwner={isOwner}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
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

function SortableItem({ item, isRemoving, isOwner, onRemove }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card data-testid="list-item-card">
        <CardContent className="py-4">
          <div className="flex items-start gap-4">
            {/* Drag handle — only shown to list owner */}
            {isOwner && (
              <button
                {...attributes}
                {...listeners}
                className="mt-0.5 shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground focus:outline-none"
                aria-label="Drag to reorder"
                data-testid="drag-handle"
              >
                <GripVertical size={16} />
              </button>
            )}
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
              {isOwner && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => onRemove(item.id)}
                  disabled={isRemoving}
                  data-testid="remove-item-button"
                >
                  <Trash2 size={13} />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface SortableItemProps {
  item: ListItemData;
  isRemoving: boolean;
  isOwner: boolean;
  onRemove: (id: number) => void;
}
