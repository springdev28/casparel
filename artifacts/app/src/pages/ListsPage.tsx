import { useState } from 'react';
import { useLocation } from 'wouter';
import { Plus, List, Trash2, Users } from 'lucide-react';
import { Button } from '@workspace/edu-ds/components/ui/button';
import { Input } from '@workspace/edu-ds/components/ui/input';
import { Label } from '@workspace/edu-ds/components/ui/label';
import { Textarea } from '@workspace/edu-ds/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/edu-ds/components/ui/card';
import { Badge } from '@workspace/edu-ds/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@workspace/edu-ds/components/ui/dialog';
import { Skeleton } from '@workspace/edu-ds/components/ui/skeleton';
import { Separator } from '@workspace/edu-ds/components/ui/separator';
import { toast } from '@workspace/edu-ds/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  useListResourceLists,
  useCreateResourceList,
  useDeleteResourceList,
  useListSharedResourceLists,
  getListResourceListsQueryKey,
} from '@workspace/api-client-react';

export default function ListsPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  const { data: lists, isLoading } = useListResourceLists();
  const { data: sharedLists, isLoading: sharedLoading } = useListSharedResourceLists();
  const createList = useCreateResourceList();
  const deleteList = useDeleteResourceList();

  function resetForm() {
    setNewName('');
    setNewDesc('');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createList.mutateAsync({
        data: { name: newName, description: newDesc || undefined },
      });
      queryClient.invalidateQueries({ queryKey: getListResourceListsQueryKey() });
      toast({ title: 'List created!', description: `"${newName}" is ready.` });
      resetForm();
      setDialogOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create list';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { id, name } = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteList.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListResourceListsQueryKey() });
      toast({ title: 'List deleted', description: `"${name}" has been removed.` });
    } catch (err: unknown) {
      // A 404 means another session already deleted this list, treat as success.
      const status = (err as { status?: number }).status;
      if (status === 404) {
        queryClient.invalidateQueries({ queryKey: getListResourceListsQueryKey() });
        toast({ title: 'List deleted', description: `"${name}" has been removed.` });
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to delete list';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Resource Lists</h1>
          <p className="text-muted-foreground text-sm mt-1">Curate and organize your resources</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="create-list-button">
              <Plus size={16} className="mr-1.5" /> Create List
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a List</DialogTitle>
              <DialogDescription>Organize resources into a curated list</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="list-name">List name</Label>
                <Input id="list-name" value={newName} onChange={(e) => setNewName(e.target.value)} required data-testid="list-name-input" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="list-desc">Description (optional)</Label>
                <Textarea id="list-desc" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={2} data-testid="list-desc-input" />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
                <Button type="submit" disabled={createList.isPending} data-testid="create-list-confirm">
                  {createList.isPending ? 'Creating…' : 'Create List'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2 mt-1" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !lists || lists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <List size={40} className="text-muted-foreground mb-4" />
          {/* h2, not h3: directly under the page's h1. */}
          <h2 className="font-semibold text-foreground">No lists yet</h2>
          <p className="text-sm text-muted-foreground mt-1">Create your first list to start organizing resources.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {lists.map((list) => (
            <Card
              key={list.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setLocation(`/lists/${list.id}`)}
              data-testid="list-card"
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{list.name}</CardTitle>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 text-muted-foreground hover:text-destructive-text hover:bg-destructive/10 -mt-1 -mr-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget({ id: list.id, name: list.name });
                    }}
                    data-testid="delete-list-button"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
                {list.description && (
                  <CardDescription className="line-clamp-2">{list.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{list.itemCount} item{list.itemCount !== 1 ? 's' : ''}</span>
                  <span className="text-xs">{formatDistanceToNow(new Date(list.createdAt), { addSuffix: true })}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Shared with me */}
      {((sharedLists && sharedLists.length > 0) || sharedLoading) && (
        <>
          <Separator />
          <div>
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
              <Users size={18} /> Shared with me
            </h2>
            {sharedLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i}>
                    <CardHeader><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/2 mt-1" /></CardHeader>
                    <CardContent><Skeleton className="h-4 w-20" /></CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sharedLists!.map((list) => (
                  <Card
                    key={list.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setLocation(`/lists/${list.id}`)}
                    data-testid="shared-list-card"
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base">{list.name}</CardTitle>
                        <Badge variant="secondary" className="shrink-0 text-xs">Shared</Badge>
                      </div>
                      {list.description && (
                        <CardDescription className="line-clamp-2">{list.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>{list.itemCount} item{list.itemCount !== 1 ? 's' : ''}</span>
                        <span className="text-xs">{formatDistanceToNow(new Date(list.createdAt), { addSuffix: true })}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete list?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This will remove the list and all its items permanently.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteList.isPending}
              data-testid="confirm-delete-list"
            >
              {deleteList.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
