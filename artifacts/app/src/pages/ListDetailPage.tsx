import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { ArrowLeft, Trash2, List, ExternalLink } from 'lucide-react';
import { Button } from '@workspace/edu-ds/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/edu-ds/components/ui/card';
import { Badge } from '@workspace/edu-ds/components/ui/badge';
import { Skeleton } from '@workspace/edu-ds/components/ui/skeleton';
import { Separator } from '@workspace/edu-ds/components/ui/separator';
import { toast } from '@workspace/edu-ds/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetResourceList,
  useRemoveListItem,
  getGetResourceListQueryKey,
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

  const { data: list, isLoading } = useGetResourceList(listId, {
    query: { enabled: !!listId, queryKey: getGetResourceListQueryKey(listId) },
  });
  const removeItem = useRemoveListItem();

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

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-32" />
        <Card>
          <CardHeader>
            <Skeleton className="h-7 w-1/2" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
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
          </CardContent>
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
      <Button variant="ghost" size="sm" onClick={() => setLocation('/lists')} data-testid="back-button">
        <ArrowLeft size={16} className="mr-1.5" /> Lists
      </Button>

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
                    <Button
                      size="sm"
                      variant="outline"
                      asChild
                    >
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
    </div>
  );
}
