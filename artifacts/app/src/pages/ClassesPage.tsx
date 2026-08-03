import { useState } from 'react';
import { useLocation } from 'wouter';
import { Plus, Users } from 'lucide-react';
import { Button } from '@workspace/edu-ds/components/ui/button';
import { Input } from '@workspace/edu-ds/components/ui/input';
import { Label } from '@workspace/edu-ds/components/ui/label';
import { Textarea } from '@workspace/edu-ds/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/edu-ds/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@workspace/edu-ds/components/ui/dialog';
import { Badge } from '@workspace/edu-ds/components/ui/badge';
import { Skeleton } from '@workspace/edu-ds/components/ui/skeleton';
import { toast } from '@workspace/edu-ds/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListClasses,
  useCreateClass,
  useGetMe,
  getListClassesQueryKey,
  UserRole,
} from '@workspace/api-client-react';

export default function ClassesPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newGrade, setNewGrade] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const { data: classes, isLoading } = useListClasses();
  const { data: me } = useGetMe();
  const createClass = useCreateClass();

  const isTeacher = me?.role === UserRole.teacher;

  function resetForm() {
    setNewName('');
    setNewSubject('');
    setNewGrade('');
    setNewDesc('');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createClass.mutateAsync({
        data: {
          name: newName,
          subject: newSubject,
          gradeLevel: newGrade,
          description: newDesc || undefined,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListClassesQueryKey() });
      toast({ title: 'Class created!', description: `"${newName}" is ready.` });
      resetForm();
      setDialogOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create class';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Classes</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage and join your classes</p>
        </div>
        {isTeacher && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="create-class-button">
                <Plus size={16} className="mr-1.5" /> Create Class
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a Class</DialogTitle>
                <DialogDescription>Set up a new class for your students</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="class-name">Class name</Label>
                  <Input id="class-name" value={newName} onChange={(e) => setNewName(e.target.value)} required data-testid="class-name-input" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="class-subject">Subject</Label>
                    <Input id="class-subject" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} required data-testid="class-subject-input" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="class-grade">Grade level</Label>
                    <Input id="class-grade" value={newGrade} onChange={(e) => setNewGrade(e.target.value)} required data-testid="class-grade-input" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="class-desc">Description (optional)</Label>
                  <Textarea id="class-desc" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={2} data-testid="class-desc-input" />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
                  <Button type="submit" disabled={createClass.isPending} data-testid="create-class-confirm">
                    {createClass.isPending ? 'Creating…' : 'Create Class'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
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
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !classes || classes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Users size={40} className="text-muted-foreground mb-4" />
          <h3 className="font-semibold text-foreground">No classes yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {isTeacher ? 'Create your first class to get started.' : 'You haven\'t joined any classes yet.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map((cls) => (
            <Card
              key={cls.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setLocation(`/classes/${cls.id}`)}
              data-testid="class-card"
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{cls.name}</CardTitle>
                  <Badge variant="secondary" className="shrink-0">{cls.gradeLevel}</Badge>
                </div>
                <CardDescription>{cls.subject}</CardDescription>
              </CardHeader>
              <CardContent>
                {cls.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{cls.description}</p>
                )}
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Users size={14} />
                  <span>{cls.memberCount ?? 0} member{cls.memberCount !== 1 ? 's' : ''}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
