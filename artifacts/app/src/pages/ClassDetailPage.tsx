import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { ArrowLeft, UserPlus, Users, RefreshCw, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
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
  useBulkInviteClassMembers,
  useGetGCCourseStudents,
  useGetGCStatus,
  getGetClassQueryKey,
  getGetGCStatusQueryKey,
  ClassMemberInputRole,
  type GCRosterStudent,
} from '@workspace/api-client-react';

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const classId = Number(id);

  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<ClassMemberInputRole>(ClassMemberInputRole.student);

  // Sync roster state
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [rosterConfirmed, setRosterConfirmed] = useState(false);

  const { data: cls, isLoading } = useGetClass(classId, {
    query: { enabled: !!classId, queryKey: getGetClassQueryKey(classId) },
  });

  // Determine if the current user is the class teacher
  const { data: gcStatus } = useGetGCStatus({
    query: { queryKey: getGetGCStatusQueryKey() },
  });

  const addMember = useAddClassMember();
  const bulkInvite = useBulkInviteClassMembers();

  // Roster fetch — only fires once the teacher picks a course and opens the sync dialog
  const rosterEnabled = syncDialogOpen && !!selectedCourseId && gcStatus?.connected === true;
  const { data: roster, isLoading: rosterLoading } = useGetGCCourseStudents(
    selectedCourseId ?? '',
    {
      query: {
        enabled: rosterEnabled,
        queryKey: ['getGCCourseStudents', selectedCourseId ?? ''],
      },
    },
  );

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

  async function handleSyncRoster() {
    if (!roster || roster.length === 0) return;
    const emails = roster.map((s: GCRosterStudent) => s.email).filter(Boolean);
    try {
      const result = await bulkInvite.mutateAsync({ id: classId, data: { emails } });
      queryClient.invalidateQueries({ queryKey: getGetClassQueryKey(classId) });
      setSyncDialogOpen(false);
      setSelectedCourseId(null);
      setRosterConfirmed(false);
      toast({
        title: 'Roster synced!',
        description: `Added ${result.added} student${result.added !== 1 ? 's' : ''}. ${result.alreadyMember} already enrolled. ${result.notFound} had no EduHub account.`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to sync roster';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  }

  function handleSyncDialogOpenChange(open: boolean) {
    setSyncDialogOpen(open);
    if (!open) {
      setSelectedCourseId(null);
      setRosterConfirmed(false);
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

  const isTeacher = gcStatus !== undefined; // gcStatus only loads for teachers via requireTeacher on the API
  const gcConnected = gcStatus?.connected === true;

  const linked = roster?.filter((s: GCRosterStudent) => s.linkedUserId !== null && s.linkedUserId !== undefined) ?? [];
  const unlinked = roster?.filter((s: GCRosterStudent) => !s.linkedUserId) ?? [];

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
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">{cls.members.length} member{cls.members.length !== 1 ? 's' : ''}</Badge>

              {/* Sync Roster — only visible when GC is connected */}
              {gcConnected && (
                <Dialog open={syncDialogOpen} onOpenChange={handleSyncDialogOpenChange}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" data-testid="sync-roster-button">
                      <RefreshCw size={14} className="mr-1" /> Sync Roster
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Sync Google Classroom Roster</DialogTitle>
                      <DialogDescription>
                        Enter the Google Classroom course ID to pull its student roster into this class.
                      </DialogDescription>
                    </DialogHeader>

                    {/* Step 1: enter course ID */}
                    {!selectedCourseId && (
                      <SyncCourseIdStep onConfirm={(id) => setSelectedCourseId(id)} />
                    )}

                    {/* Step 2: show roster preview */}
                    {selectedCourseId && !rosterConfirmed && (
                      <div className="space-y-4">
                        {rosterLoading ? (
                          <div className="space-y-2">
                            {Array.from({ length: 4 }).map((_, i) => (
                              <Skeleton key={i} className="h-9 w-full" />
                            ))}
                          </div>
                        ) : !roster || roster.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-6">
                            No students found in this course.
                          </p>
                        ) : (
                          <>
                            <p className="text-sm text-muted-foreground">
                              Found <strong>{roster.length}</strong> student{roster.length !== 1 ? 's' : ''}.{' '}
                              <span className="text-green-600 dark:text-green-400">{linked.length} matched</span> to EduHub accounts.{' '}
                              <span className="text-muted-foreground">{unlinked.length} have no account yet.</span>
                            </p>
                            <div className="max-h-56 overflow-y-auto divide-y divide-border rounded-md border">
                              {roster.map((s: GCRosterStudent) => (
                                <div key={s.gcUserId} className="flex items-center justify-between px-3 py-2 gap-2">
                                  <div>
                                    <p className="text-sm font-medium">{s.name}</p>
                                    <p className="text-xs text-muted-foreground">{s.email}</p>
                                  </div>
                                  {s.linkedUserId ? (
                                    <CheckCircle2 size={16} className="text-green-600 dark:text-green-400 shrink-0" aria-label="Matched to EduHub account" />
                                  ) : (
                                    <AlertCircle size={16} className="text-muted-foreground shrink-0" aria-label="No EduHub account" />
                                  )}
                                </div>
                              ))}
                            </div>
                            {unlinked.length > 0 && (
                              <p className="text-xs text-muted-foreground">
                                Students without an EduHub account will be skipped. They can join after creating an account.
                              </p>
                            )}
                          </>
                        )}
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setSelectedCourseId(null)}>Back</Button>
                          <Button
                            onClick={() => setRosterConfirmed(true)}
                            disabled={!roster || roster.length === 0 || linked.length === 0}
                          >
                            Add {linked.length} Student{linked.length !== 1 ? 's' : ''}
                          </Button>
                        </DialogFooter>
                      </div>
                    )}

                    {/* Step 3: confirm */}
                    {selectedCourseId && rosterConfirmed && (
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                          This will enroll <strong>{linked.length}</strong> student{linked.length !== 1 ? 's' : ''} who already have EduHub accounts into this class.
                        </p>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setRosterConfirmed(false)}>Back</Button>
                          <Button
                            onClick={handleSyncRoster}
                            disabled={bulkInvite.isPending}
                            data-testid="sync-roster-confirm"
                          >
                            {bulkInvite.isPending ? 'Syncing…' : 'Confirm Sync'}
                          </Button>
                        </DialogFooter>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              )}

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

/** Step 1 of the sync flow: collect the GC course ID from the teacher. */
function SyncCourseIdStep({ onConfirm }: { onConfirm: (courseId: string) => void }) {
  const [courseId, setCourseId] = useState('');
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="gc-course-id">Google Classroom Course ID</Label>
        <Input
          id="gc-course-id"
          value={courseId}
          onChange={(e) => setCourseId(e.target.value.trim())}
          placeholder="e.g. 123456789"
          data-testid="gc-course-id-input"
        />
        <p className="text-xs text-muted-foreground">
          Find the ID in your Google Classroom URL: classroom.google.com/c/<strong>COURSE_ID</strong>
        </p>
      </div>
      <DialogFooter>
        <Button onClick={() => onConfirm(courseId)} disabled={!courseId}>
          Fetch Roster
        </Button>
      </DialogFooter>
    </div>
  );
}
