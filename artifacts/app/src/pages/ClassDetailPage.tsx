import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { ArrowLeft, UserPlus, Users, RefreshCw, CheckCircle2, AlertCircle, BookOpen, Trash2, ExternalLink, LogOut, Check, X, MapPin } from 'lucide-react';
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
import { SeatingChartEditor } from '../components/SeatingChartEditor';
import {
  useGetClass,
  useAddClassMember,
  useBulkInviteClassMembers,
  useGetGCCourseStudents,
  useGetGCStatus,
  useGetMe,
  useGetClassResourcesList,
  useDeleteClass,
  useRemoveClassMember,
  useRemoveClassResource,
  useLeaveClass,
  useListClassResourceRecommendations,
  useReviewClassResourceRecommendation,
  getListClassResourceRecommendationsQueryKey,
  ClassResourceRecommendationStatus,
  type ClassResourceRecommendation,
  getListClassesQueryKey,
  getGetClassQueryKey,
  getGetGCStatusQueryKey,
  getGetClassResourcesListQueryKey,
  ClassMemberInputRole,
  UserRole,
  type GCRosterStudent,
} from '@workspace/api-client-react';

const FORMAT_COLORS: Record<string, string> = {
  article: 'bg-blue-100 text-blue-700',
  video: 'bg-red-100 text-red-700',
  pdf: 'bg-orange-100 text-orange-700',
  podcast: 'bg-purple-100 text-purple-700',
  interactive: 'bg-emerald-100 text-emerald-700',
  other: 'bg-gray-100 text-gray-700',
};

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const classId = Number(id);

  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<ClassMemberInputRole>(ClassMemberInputRole.student);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [rosterConfirmed, setRosterConfirmed] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<{ userId: number; name: string } | null>(null);

  const { data: cls, isLoading } = useGetClass(classId, {
    query: { enabled: !!classId, queryKey: getGetClassQueryKey(classId) },
  });
  const { data: me } = useGetMe();
  // GC status: fetch for any teacher-role user (not class-specific)
  const isTeacherRole = (me?.activeRole ?? me?.role) === UserRole.teacher;
  const { data: gcStatus } = useGetGCStatus({
    query: { enabled: isTeacherRole, queryKey: getGetGCStatusQueryKey() },
  });
  const { data: classResList, isLoading: resListLoading } = useGetClassResourcesList(classId, {
    query: { enabled: !!classId, queryKey: getGetClassResourcesListQueryKey(classId) },
  });
  const removeClassResource = useRemoveClassResource();
  const deleteClass = useDeleteClass();
  const removeClassMember = useRemoveClassMember();
  const leaveClass = useLeaveClass();
  const reviewRecommendation = useReviewClassResourceRecommendation();
  const { data: classRecommendations } = useListClassResourceRecommendations(classId, {
    query: { enabled: !!classId, queryKey: getListClassResourceRecommendationsQueryKey(classId) },
  });

  const addMember = useAddClassMember();
  const bulkInvite = useBulkInviteClassMembers();

  // Class-specific teacher check: only the teacher of THIS class can manage it
  const isTeacher = isTeacherRole && me?.id != null && cls?.teacherId === me.id;
  const gcConnected = gcStatus?.connected === true;
  const gcConfigured = gcStatus?.configured === true;

  const rosterEnabled = syncDialogOpen && !!selectedCourseId && gcConnected;
  const { data: roster, isLoading: rosterLoading } = useGetGCCourseStudents(
    selectedCourseId ?? '',
    { query: { enabled: rosterEnabled, queryKey: ['getGCCourseStudents', selectedCourseId ?? ''] } },
  );

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    try {
      await addMember.mutateAsync({ id: classId, data: { email: memberEmail, role: memberRole } });
      queryClient.invalidateQueries({ queryKey: getGetClassQueryKey(classId) });
      toast({ title: 'Member added!', description: `${memberEmail} has been added.` });
      setMemberEmail('');
      setMemberRole(ClassMemberInputRole.student);
      setMemberDialogOpen(false);
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to add member', variant: 'destructive' });
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
        description: `Added ${result.added} student${result.added !== 1 ? 's' : ''}. ${result.alreadyMember} already enrolled. ${result.notFound} had no account.`,
      });
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to sync roster', variant: 'destructive' });
    }
  }

  async function handleRemoveResource(resourceId: number) {
    try {
      await removeClassResource.mutateAsync({ id: classId, resourceId });
      queryClient.invalidateQueries({ queryKey: getGetClassResourcesListQueryKey(classId) });
      toast({ title: 'Resource removed from class.' });
    } catch {
      toast({ title: 'Error', description: 'Could not remove the resource.', variant: 'destructive' });
    }
  }

  async function handleDeleteClass() {
    try {
      await deleteClass.mutateAsync({ id: classId });
      await queryClient.invalidateQueries({ queryKey: getListClassesQueryKey() });
      toast({ title: "Class deleted", description: "The class and its class list were removed." });
      setLocation("/classes");
    } catch (err: unknown) {
      toast({ title: "Could not delete class", description: err instanceof Error ? err.message : "Please try again.", variant: "destructive" });
    }
  }

  async function handleLeaveClass() {
    try {
      await leaveClass.mutateAsync({ id: classId });
      await queryClient.invalidateQueries({ queryKey: getListClassesQueryKey() });
      toast({ title: "You left the class" });
      setLocation("/classes");
    } catch (err: unknown) {
      toast({ title: "Could not leave class", description: err instanceof Error ? err.message : "Please try again.", variant: "destructive" });
    }
  }

  async function handleReviewRecommendation(recommendationId: number, status: "approved" | "declined") {
    try {
      await reviewRecommendation.mutateAsync({ id: classId, recommendationId, data: { status } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListClassResourceRecommendationsQueryKey(classId) }),
        queryClient.invalidateQueries({ queryKey: getGetClassResourcesListQueryKey(classId) }),
      ]);
      toast({ title: status === "approved" ? "Recommendation approved" : "Recommendation declined" });
    } catch (err: unknown) {
      toast({ title: "Could not review recommendation", description: err instanceof Error ? err.message : "Please try again.", variant: "destructive" });
    }
  }

  async function handleRemoveMember() {
    if (!memberToRemove) return;
    try {
      await removeClassMember.mutateAsync({ id: classId, userId: memberToRemove.userId });
      await queryClient.invalidateQueries({ queryKey: getGetClassQueryKey(classId) });
      toast({ title: "Member removed", description: memberToRemove.name + " is no longer in this class." });
      setMemberToRemove(null);
    } catch (err: unknown) {
      toast({ title: "Could not remove member", description: err instanceof Error ? err.message : "Please try again.", variant: "destructive" });
    }
  }

  function handleSyncDialogOpenChange(open: boolean) {
    setSyncDialogOpen(open);
    if (!open) { setSelectedCourseId(null); setRosterConfirmed(false); }
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-32" />
        <Card><CardHeader><Skeleton className="h-7 w-1/2" /><Skeleton className="h-4 w-1/3 mt-1" /></CardHeader>
          <CardContent><div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3"><Skeleton className="h-8 w-8 rounded-full" /><Skeleton className="h-4 w-40" /></div>
          ))}</div></CardContent>
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

  const linked = roster?.filter((s: GCRosterStudent) => s.linkedUserId !== null && s.linkedUserId !== undefined) ?? [];
  const unlinked = roster?.filter((s: GCRosterStudent) => !s.linkedUserId) ?? [];
  const resourceItems = classResList?.items ?? [];
  const ownMembership = cls.members.find((member) => member.userId === me?.id);
  const showOwnSeat = ownMembership?.role === "student" && cls.mySeat;
  const seatPositionCopy =
    cls.mySeat?.relativePosition === "front"
      ? "Near the front of the room"
      : cls.mySeat?.relativePosition === "back"
        ? "Toward the back of the room"
        : cls.mySeat?.relativePosition === "middle"
          ? "In the middle of the room"
          : null;

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

              {/* Sync Roster — visible to all teachers; state varies by GC connection */}
              <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
                <DialogTrigger asChild><Button size="sm" variant="outline" data-testid="leave-class-button"><LogOut size={14} className="mr-1" /> Leave Class</Button></DialogTrigger>
                <DialogContent><DialogHeader><DialogTitle>Leave {cls.name}?</DialogTitle><DialogDescription>You will lose access to class resources. Class owners must have another teacher available for ownership transfer.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setLeaveDialogOpen(false)}>Cancel</Button><Button variant="destructive" onClick={handleLeaveClass} disabled={leaveClass.isPending} data-testid="leave-class-confirm">{leaveClass.isPending ? "Leaving…" : "Leave Class"}</Button></DialogFooter></DialogContent>
              </Dialog>
              {isTeacher && (
                gcConnected ? (
                  <Dialog open={syncDialogOpen} onOpenChange={handleSyncDialogOpenChange}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" data-testid="sync-roster-button">
                        <RefreshCw size={14} className="mr-1" /> Sync Roster
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Sync Google Classroom Roster</DialogTitle>
                        <DialogDescription>Enter the Google Classroom course ID to pull its student roster.</DialogDescription>
                      </DialogHeader>
                      {!selectedCourseId && <SyncCourseIdStep onConfirm={(id) => setSelectedCourseId(id)} />}
                      {selectedCourseId && !rosterConfirmed && (
                        <div className="space-y-4">
                          {rosterLoading ? (
                            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
                          ) : !roster || roster.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-6">No students found in this course.</p>
                          ) : (
                            <>
                              <p className="text-sm text-muted-foreground">
                                Found <strong>{roster.length}</strong> student{roster.length !== 1 ? 's' : ''}.{' '}
                                <span className="text-green-600 dark:text-green-400">{linked.length} matched</span> to accounts.{' '}
                                <span className="text-muted-foreground">{unlinked.length} have no account yet.</span>
                              </p>
                              <div className="max-h-56 overflow-y-auto divide-y divide-border rounded-md border">
                                {roster.map((s: GCRosterStudent) => (
                                  <div key={s.gcUserId} className="flex items-center justify-between px-3 py-2 gap-2">
                                    <div>
                                      <p className="text-sm font-medium">{s.name}</p>
                                      <p className="text-xs text-muted-foreground">{s.email}</p>
                                    </div>
                                    {s.linkedUserId
                                      ? <CheckCircle2 size={16} className="text-green-600 dark:text-green-400 shrink-0" />
                                      : <AlertCircle size={16} className="text-muted-foreground shrink-0" />}
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setSelectedCourseId(null)}>Back</Button>
                            <Button onClick={() => setRosterConfirmed(true)} disabled={!roster || roster.length === 0 || linked.length === 0}>
                              Add {linked.length} Student{linked.length !== 1 ? 's' : ''}
                            </Button>
                          </DialogFooter>
                        </div>
                      )}
                      {selectedCourseId && rosterConfirmed && (
                        <div className="space-y-4">
                          <p className="text-sm text-muted-foreground">
                            This will enroll <strong>{linked.length}</strong> student{linked.length !== 1 ? 's' : ''} who already have accounts.
                          </p>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setRosterConfirmed(false)}>Back</Button>
                            <Button onClick={handleSyncRoster} disabled={bulkInvite.isPending} data-testid="sync-roster-confirm">
                              {bulkInvite.isPending ? 'Syncing…' : 'Confirm Sync'}
                            </Button>
                          </DialogFooter>
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                ) : gcConfigured ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setLocation('/classes?connect_gc=1')}
                    title="Connect Google Classroom to sync the roster"
                    data-testid="sync-roster-connect-button"
                  >
                    <RefreshCw size={14} className="mr-1" /> Sync Roster
                  </Button>
                ) : gcStatus && !gcConfigured ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled
                    title="Google Classroom credentials are not configured on this server. Contact your admin."
                    data-testid="sync-roster-not-configured-button"
                  >
                    <RefreshCw size={14} className="mr-1" /> Sync Roster
                  </Button>
                ) : null
              )}              {isTeacher && (
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
                        <Input id="member-email" type="email" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} required placeholder="user@example.com" data-testid="member-email-input" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="member-role">Role</Label>
                        <Select value={memberRole} onValueChange={(v) => setMemberRole(v as ClassMemberInputRole)}>
                          <SelectTrigger id="member-role" data-testid="member-role-select"><SelectValue /></SelectTrigger>
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
              )}              {isTeacher && (
                <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                  <DialogTrigger asChild><Button size="sm" variant="destructive" data-testid="delete-class-button"><Trash2 size={14} className="mr-1" /> Delete Class</Button></DialogTrigger>
                  <DialogContent><DialogHeader><DialogTitle>Delete {cls.name}?</DialogTitle><DialogDescription>This permanently deletes the class, its memberships, and its class resource list. Original resources remain available.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button><Button variant="destructive" onClick={handleDeleteClass} disabled={deleteClass.isPending} data-testid="delete-class-confirm">{deleteClass.isPending ? "Deleting…" : "Delete Class"}</Button></DialogFooter></DialogContent>
                </Dialog>
              )}
            </div>
          </div>
          {cls.description && <p className="text-sm text-muted-foreground mt-2">{cls.description}</p>}
        </CardHeader>
      </Card>

      {showOwnSeat && (
        <section aria-labelledby="student-seat-heading">
          <h2
            id="student-seat-heading"
            className="mb-4 text-lg font-semibold text-foreground"
          >
            Your position
          </h2>
          <Card data-testid="student-seat-position">
            <CardContent className="flex items-center gap-4 py-5">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <MapPin size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-foreground">
                    {cls.mySeat!.assigned
                      ? cls.mySeat!.layoutMode === "custom"
                        ? `${cls.mySeat!.deskLabel || "Desk"} · Seat ${(cls.mySeat!.deskSeat ?? 0) + 1}`
                        : `Row ${(cls.mySeat!.row ?? 0) + 1} · Seat ${(cls.mySeat!.column ?? 0) + 1}`
                      : "No seat assigned yet"}
                  </p>
                  <Badge variant={cls.mySeat!.assigned ? "secondary" : "outline"}>
                    {cls.mySeat!.assigned ? "Assigned" : "Awaiting assignment"}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {cls.mySeat!.assigned
                    ? seatPositionCopy
                    : "Your teacher has not placed you in the seating plan yet."}
                </p>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Members */}
      <section>
        <h2 className="text-lg font-semibold text-foreground mb-4">Members</h2>
        {cls.members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users size={32} className="text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No members yet.</p>
          </div>
        ) : (
          <Card>
            <CardContent className="py-2 divide-y divide-border">
              {cls.members.map((member) => (
                <div key={member.userId} className="flex items-center justify-between py-3 gap-3" data-testid="member-item">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                      {member.user.avatarUrl ? <img src={member.user.avatarUrl} alt={member.user.name + " profile"} className="h-full w-full object-cover" /> : <span className="text-xs font-semibold text-muted-foreground uppercase">{member.user.name.charAt(0)}</span>}
                    </div>
                    <div>
                      <button className="text-left text-sm font-medium text-foreground hover:text-primary hover:underline" onClick={() => setLocation(`/profile/${member.userId}${isTeacher ? `?classId=${classId}` : ""}`)}>{member.user.name}</button>
                      {member.user.gradeOrDept && (
                        <p className="text-xs text-muted-foreground">{member.user.gradeOrDept}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={member.role === 'teacher' ? 'default' : 'secondary'} className="capitalize">{member.role}</Badge>
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      Joined {formatDistanceToNow(new Date(member.joinedAt), { addSuffix: true })}
                    </span>
                    {isTeacher && member.userId !== cls.teacherId && <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setMemberToRemove({ userId: member.userId, name: member.user.name })} aria-label={"Remove " + member.user.name} data-testid="remove-class-member"><Trash2 size={14} /></Button>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      <Dialog open={memberToRemove !== null} onOpenChange={(open) => { if (!open) setMemberToRemove(null); }}>
        <DialogContent><DialogHeader><DialogTitle>Remove {memberToRemove?.name}?</DialogTitle><DialogDescription>They will lose access to this class and its shared resources. You can add them again later.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setMemberToRemove(null)}>Cancel</Button><Button variant="destructive" onClick={handleRemoveMember} disabled={removeClassMember.isPending} data-testid="remove-class-member-confirm">{removeClassMember.isPending ? "Removing…" : "Remove Member"}</Button></DialogFooter></DialogContent>
      </Dialog>

      {isTeacher && <><Separator /><SeatingChartEditor classId={classId} /></>}

      <Separator />

      {isTeacher && (classRecommendations as ClassResourceRecommendation[] | undefined)?.some((item) => item.status === ClassResourceRecommendationStatus.pending) && (
        <section className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 dark:bg-amber-950/20" data-testid="student-recommendations-bar">
          <div className="mb-3"><h2 className="font-semibold">Student recommendations</h2><p className="text-xs text-muted-foreground">Review student suggestions before they become class resources.</p></div>
          <div className="space-y-2">
            {(classRecommendations as ClassResourceRecommendation[]).filter((item) => item.status === ClassResourceRecommendationStatus.pending).map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3">
                <div><p className="text-sm font-medium">{item.resource.title}</p><p className="text-xs text-muted-foreground">Recommended by {item.recommenderName}{item.note ? ` — ${item.note}` : ""}</p></div>
                <div className="flex gap-2"><Button size="sm" onClick={() => handleReviewRecommendation(item.id, "approved")} disabled={reviewRecommendation.isPending}><Check size={14} className="mr-1" /> Approve</Button><Button size="sm" variant="outline" onClick={() => handleReviewRecommendation(item.id, "declined")} disabled={reviewRecommendation.isPending}><X size={14} className="mr-1" /> Decline</Button></div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Class Resources */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Class Resources</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isTeacher ? 'Resources you assign show here for all class members.' : 'Resources assigned by your teacher.'}
            </p>
          </div>
          {isTeacher ? (
            <Button size="sm" variant="outline" onClick={() => setLocation('/resources')}>
              <BookOpen size={14} className="mr-1.5" /> Assign a Resource
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setLocation(`/resources?goal=${encodeURIComponent(cls.subject)}&subject=${encodeURIComponent(cls.subject)}&mode=source`)} data-testid="recommend-class-source">
              <BookOpen size={14} className="mr-1.5" /> Recommend a Source
            </Button>
          )}
        </div>

        {resListLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}><CardContent className="py-4"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/2 mt-2" /></CardContent></Card>
            ))}
          </div>
        ) : resourceItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg bg-muted/20">
            <BookOpen size={32} className="text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-foreground">No resources assigned yet</p>
            {isTeacher && (
              <p className="text-xs text-muted-foreground mt-1">
                Open a resource and click <strong>Assign to Class</strong> to add it here.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {resourceItems.map((item) => (
              <Card key={item.id} className="hover:shadow-sm transition-shadow" data-testid="class-resource-item">
                <CardContent className="py-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground line-clamp-1">{item.resource.title}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${FORMAT_COLORS[item.resource.format] ?? FORMAT_COLORS.other}`}>
                          {item.resource.format}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.resource.subject} · {item.resource.gradeLevel}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button size="sm" variant="outline" asChild>
                        <a href={item.resource.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink size={12} />
                        </a>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setLocation(`/resources/${item.resource.id}`)}
                      >
                        View
                      </Button>                      {isTeacher && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleRemoveResource(item.resource.id)}
                          disabled={removeClassResource.isPending}
                          data-testid="remove-class-resource"
                        >
                          <Trash2 size={13} />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SyncCourseIdStep({ onConfirm }: { onConfirm: (courseId: string) => void }) {
  const [courseId, setCourseId] = useState('');
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="gc-course-id">Google Classroom Course ID</Label>
        <Input id="gc-course-id" value={courseId} onChange={(e) => setCourseId(e.target.value.trim())} placeholder="e.g. 123456789" data-testid="gc-course-id-input" />
        <p className="text-xs text-muted-foreground">Find the ID in your Google Classroom URL: classroom.google.com/c/<strong>COURSE_ID</strong></p>
      </div>
      <DialogFooter>
        <Button onClick={() => onConfirm(courseId)} disabled={!courseId}>Fetch Roster</Button>
      </DialogFooter>
    </div>
  );
}
