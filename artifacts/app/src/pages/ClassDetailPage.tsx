import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { ArrowLeft, UserPlus, Users } from 'lucide-react';
import { Button } from '@workspace/edu-ds/components/ui/button';
import { Input } from '@workspace/edu-ds/components/ui/input';
import { Label } from '@workspace/edu-ds/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/edu-ds/components/ui/card';
import { Badge } from '@workspace/edu-ds/components/ui/badge';
import { Skeleton } from '@workspace/edu-ds/components/ui/skeleton';
import { Separator } from '@workspace/edu-ds/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@workspace/edu-ds/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/edu-ds/components/ui/select';
import { toast } from '@workspace/edu-ds/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  useGetClass,
  useAddClassMember,
  getGetClassQueryKey,
  ClassMemberInputRole,
} from '@workspace/api-client-react';

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const classId = Number(id);

  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<ClassMemberInputRole>(ClassMemberInputRole.student);

  const { data: cls, isLoading } = useGetClass(classId, {
    query: { enabled: !!classId, queryKey: getGetClassQueryKey(classId) },
  });
  const addMember = useAddClassMember();

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    try {
      await addMember.mutateAsync({
        id: classId,
        data: { email: memberEmail, role: memberRole },
      });
      queryClient.invalidateQueries({ queryKey: getGetClassQueryKey(classId) });
      toast({ title: 'Member added!', description: `${memberEmail} has been added.` });
      setMemberEmail('');
      setMemberRole(ClassMemberInputRole.student);
      setMemberDialogOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add member';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-32" />
        <Card>
          <CardHeader>
            <Skeleton className="h-7 w-1/2" />
            <Skeleton className="h-4 w-1/3 mt-1" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-4 w-40" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!cls) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-64">
        <Users size={40} className="text-muted-foreground mb-3" />
        <p className="font-semibold text-foreground">Class not found</p>
        <Button variant="outline" className="mt-4" onClick={() => setLocation('/classes')}>Back to Classes</Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={() => setLocation('/classes')} data-testid="back-button">
        <ArrowLeft size={16} className="mr-1.5" /> Classes
      </Button>

      {/* Class Info */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-xl">{cls.name}</CardTitle>
              <CardDescription>{cls.subject} · {cls.gradeLevel}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{cls.members.length} member{cls.members.length !== 1 ? 's' : ''}</Badge>
              <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" data-testid="add-member-button">
                    <UserPlus size={14} className="mr-1" /> Add Member
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add a Member</DialogTitle>
                    <DialogDescription>Add a student or teacher to this class by email</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleAddMember} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="member-email">Email address</Label>
                      <Input
                        id="member-email"
                        type="email"
                        value={memberEmail}
                        onChange={(e) => setMemberEmail(e.target.value)}
                        required
                        placeholder="user@example.com"
                        data-testid="member-email-input"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="member-role">Role</Label>
                      <Select value={memberRole} onValueChange={(v) => setMemberRole(v as ClassMemberInputRole)}>
                        <SelectTrigger id="member-role" data-testid="member-role-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ClassMemberInputRole.student}>Student</SelectItem>
                          <SelectItem value={ClassMemberInputRole.teacher}>Teacher</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setMemberDialogOpen(false)}>Cancel</Button>
                      <Button type="submit" disabled={addMember.isPending} data-testid="add-member-confirm">
                        {addMember.isPending ? 'Adding…' : 'Add Member'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          {cls.description && (
            <p className="text-sm text-muted-foreground mt-2">{cls.description}</p>
          )}
        </CardHeader>
      </Card>

      {/* Members List */}
      <section>
        <h2 className="text-lg font-semibold text-foreground mb-4">Members</h2>
        {cls.members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users size={32} className="text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No members yet. Add members to get started.</p>
          </div>
        ) : (
          <Card>
            <CardContent className="py-2 divide-y divide-border">
              {cls.members.map((member) => (
                <div key={member.userId} className="flex items-center justify-between py-3 gap-3" data-testid="member-item">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <span className="text-xs font-semibold text-muted-foreground uppercase">
                        {member.user.name.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{member.user.name}</p>
                      <p className="text-xs text-muted-foreground">{member.user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={member.role === 'teacher' ? 'default' : 'secondary'} className="capitalize">
                      {member.role}
                    </Badge>
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      Joined {formatDistanceToNow(new Date(member.joinedAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
      <Separator />
    </div>
  );
}
