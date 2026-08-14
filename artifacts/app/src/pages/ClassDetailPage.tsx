import { useEffect, useState } from 'react';
import { useParams, useLocation, useSearch as useRouteSearch } from 'wouter';
import { ArrowLeft, UserPlus, Users, RefreshCw, CheckCircle2, AlertCircle, BookOpen, Trash2, ExternalLink, LogOut, Check, X, MessagesSquare, ShieldCheck, Workflow, Pencil, StickyNote, LayoutDashboard, ClipboardList, LibraryBig, KeyRound } from 'lucide-react';
import { Button } from '@workspace/edu-ds/components/ui/button';
import { Input } from '@workspace/edu-ds/components/ui/input';
import { Label } from '@workspace/edu-ds/components/ui/label';
import { Textarea } from '@workspace/edu-ds/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/edu-ds/components/ui/card';
import { Badge } from '@workspace/edu-ds/components/ui/badge';
import { Skeleton } from '@workspace/edu-ds/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@workspace/edu-ds/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/edu-ds/components/ui/select';
import { toast } from '@workspace/edu-ds/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { SeatingChartEditor } from '../components/SeatingChartEditor';
import { ClassAssignments } from '../components/ClassAssignments';
import {
  useGetClass,
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
  useUpdateClass,
  useGetSeatingChart,
  useUpdateStudentNote,
  getListClassResourceRecommendationsQueryKey,
  ClassResourceRecommendationStatus,
  type ClassResourceRecommendation,
  getListClassesQueryKey,
  getGetClassQueryKey,
  getGetGCStatusQueryKey,
  getGetClassResourcesListQueryKey,
  getGetSeatingChartQueryKey,
  ClassMemberInputRole,
  UserRole,
  type GCRosterStudent,
} from '@workspace/api-client-react';
import { classRequest, type ClassInvitation } from '../lib/class-api';
import ForumPage from './ForumPage';
import ActivitiesPage from './ActivitiesPage';
import CanvasesPage from './CanvasesPage';

type ClassTab = 'members' | 'notes' | 'forum' | 'designer' | 'assignments' | 'activities' | 'resources' | 'canvas';

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
  const routeSearch = useRouteSearch();
  const queryClient = useQueryClient();
  const classId = Number(id);
  const workflowParams = new URLSearchParams(routeSearch);
  const requestedTab = workflowParams.get('tab');
  const initialTab: ClassTab = requestedTab && ['members', 'notes', 'forum', 'designer', 'assignments', 'activities', 'resources', 'canvas'].includes(requestedTab)
    ? requestedTab as ClassTab
    : 'members';
  const initialActivityId = Number(workflowParams.get('activity')) || null;
  const initialResourceId = Number(workflowParams.get('resource')) || null;

  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<ClassMemberInputRole>(ClassMemberInputRole.student);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [rosterConfirmed, setRosterConfirmed] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<{ userId: number; name: string } | null>(null);
  const [activeTab, setActiveTab] = useState<ClassTab>(initialTab);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editGrade, setEditGrade] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [pendingInvitations, setPendingInvitations] = useState<ClassInvitation[]>([]);
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});

  const { data: cls, isLoading } = useGetClass(classId, {
    query: { enabled: !!classId, queryKey: getGetClassQueryKey(classId) },
  });
  const { data: me } = useGetMe();
  // GC status: fetch for any teacher-role user (not class-specific)
  const isAdministrator = me?.role === UserRole.admin;
  const isTeacherRole =
    (me?.activeRole ?? me?.role) === UserRole.teacher || isAdministrator;
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

  const bulkInvite = useBulkInviteClassMembers();
  const updateClass = useUpdateClass();

  // Class-specific teacher check: only the teacher of THIS class can manage it
  const isTeacher =
    isAdministrator ||
    (isTeacherRole && me?.id != null && cls?.teacherId === me.id);
  const { data: seatingChart } = useGetSeatingChart(classId, {
    query: { enabled: isTeacher && !!classId, queryKey: getGetSeatingChartQueryKey(classId) },
  });
  const updateStudentNote = useUpdateStudentNote();
  const gcConnected = gcStatus?.connected === true;
  const gcConfigured = gcStatus?.configured === true;

  const rosterEnabled = syncDialogOpen && !!selectedCourseId && gcConnected;
  const { data: roster, isLoading: rosterLoading } = useGetGCCourseStudents(
    selectedCourseId ?? '',
    { query: { enabled: rosterEnabled, queryKey: ['getGCCourseStudents', selectedCourseId ?? ''] } },
  );

  useEffect(() => {
    if (!cls) return;
    setEditName(cls.name);
    setEditSubject(cls.subject);
    setEditGrade(cls.gradeLevel);
    setEditDescription(cls.description ?? '');
  }, [cls]);

  useEffect(() => {
    if (!isTeacher || !classId) return;
    void Promise.all([
      classRequest<{ joinCode: string | null }>(`/classes/${classId}/join-code`),
      classRequest<ClassInvitation[]>(`/classes/${classId}/invitations`),
    ]).then(([code, invitations]) => {
      setJoinCode(code.joinCode);
      setPendingInvitations(invitations);
    }).catch(() => undefined);
  }, [classId, isTeacher]);

  useEffect(() => {
    if (!seatingChart) return;
    setNoteDrafts(Object.fromEntries(seatingChart.students.map((student) => [student.userId, student.teacherNote ?? ''])));
  }, [seatingChart]);

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    try {
      const invitation = await classRequest<ClassInvitation>(`/classes/${classId}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ email: memberEmail, role: memberRole }),
      });
      setPendingInvitations((current) => [invitation, ...current.filter((item) => item.id !== invitation.id)]);
      toast({ title: 'Invitation sent', description: `${memberEmail} can accept or decline it from notifications.` });
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

  async function handleUpdateClass(event: React.FormEvent) {
    event.preventDefault();
    try {
      await updateClass.mutateAsync({
        id: classId,
        data: {
          name: editName.trim(),
          subject: editSubject.trim(),
          gradeLevel: editGrade.trim(),
          description: editDescription.trim() || undefined,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getGetClassQueryKey(classId) });
      setEditDialogOpen(false);
      toast({ title: 'Class information updated' });
    } catch (error) {
      toast({ title: 'Could not update class', description: error instanceof Error ? error.message : 'Please try again', variant: 'destructive' });
    }
  }

  async function refreshJoinCode() {
    try {
      const result = await classRequest<{ joinCode: string }>(`/classes/${classId}/join-code`, { method: 'POST' });
      setJoinCode(result.joinCode);
      await navigator.clipboard.writeText(result.joinCode).catch(() => undefined);
      toast({ title: joinCode ? 'New class code created' : 'Class code created', description: 'The code was copied to your clipboard.' });
    } catch (error) {
      toast({ title: 'Could not create class code', description: error instanceof Error ? error.message : 'Please try again', variant: 'destructive' });
    }
  }

  async function saveMemberNote(userId: number) {
    try {
      await updateStudentNote.mutateAsync({ id: classId, userId, data: { note: noteDrafts[userId]?.trim() || null } });
      await queryClient.invalidateQueries({ queryKey: getGetSeatingChartQueryKey(classId) });
      toast({ title: 'Private student note saved' });
    } catch (error) {
      toast({ title: 'Could not save note', description: error instanceof Error ? error.message : 'Please try again', variant: 'destructive' });
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
  const classTabs: Array<{ id: ClassTab; label: string; icon: typeof Users }> = [
    { id: 'members', label: 'Members', icon: Users },
    ...(isTeacher ? [{ id: 'notes' as const, label: 'Member notes', icon: StickyNote }] : []),
    { id: 'forum', label: 'Class forum', icon: MessagesSquare },
    { id: 'designer', label: 'Classroom Designer', icon: LayoutDashboard },
    { id: 'assignments', label: 'Assignments', icon: ClipboardList },
    { id: 'activities', label: 'Class activities', icon: LibraryBig },
    { id: 'resources', label: 'Class resources', icon: BookOpen },
    { id: 'canvas', label: 'Class canvas', icon: Workflow },
  ];

  return (
    <div className="mx-auto max-w-7xl min-w-0 space-y-4 p-3 sm:space-y-6 sm:p-6">
      <Button variant="ghost" size="sm" onClick={() => setLocation('/classes')} data-testid="back-button">
        <ArrowLeft size={16} className="mr-1.5" /> Classes
      </Button>

      {/* Class Info */}
      <Card className="overflow-hidden">
        <CardHeader className="p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <CardTitle className="text-xl">{cls.name}</CardTitle>
              <CardDescription>{cls.subject} · {cls.gradeLevel}</CardDescription>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <Badge variant="secondary">{cls.members.length} member{cls.members.length !== 1 ? 's' : ''}</Badge>
              {isTeacher && <Button size="sm" variant="outline" onClick={() => setEditDialogOpen(true)}><Pencil size={14} className="mr-1.5" />Edit info</Button>}
              {isTeacher && <Button size="sm" variant="outline" onClick={() => joinCode ? void navigator.clipboard.writeText(joinCode).then(() => toast({ title: 'Class code copied' })) : void refreshJoinCode()}><KeyRound size={14} className="mr-1.5" />{joinCode ?? 'Create class code'}</Button>}
              {isTeacher && joinCode && <Button size="icon" variant="ghost" className="size-8" title="Create a new class code" onClick={() => void refreshJoinCode()}><RefreshCw size={14} /></Button>}

              {/* Sync Roster, visible to all teachers; state varies by GC connection */}
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
                      <DialogDescription>Send a student or teacher an invitation they can accept or decline.</DialogDescription>
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
                        <Button type="submit" data-testid="add-member-confirm">
                          Send invitation
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

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit class information</DialogTitle><DialogDescription>Update the details shown to everyone in this class.</DialogDescription></DialogHeader>
          <form onSubmit={handleUpdateClass} className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="edit-class-name">Name</Label><Input id="edit-class-name" value={editName} onChange={(event) => setEditName(event.target.value)} required maxLength={120} /></div>
            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="edit-class-subject">Subject</Label><Input id="edit-class-subject" value={editSubject} onChange={(event) => setEditSubject(event.target.value)} required maxLength={120} /></div><div className="space-y-1.5"><Label htmlFor="edit-class-grade">Grade or level</Label><Input id="edit-class-grade" value={editGrade} onChange={(event) => setEditGrade(event.target.value)} required maxLength={120} /></div></div>
            <div className="space-y-1.5"><Label htmlFor="edit-class-description">Description</Label><Textarea id="edit-class-description" value={editDescription} onChange={(event) => setEditDescription(event.target.value)} maxLength={1000} /></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={updateClass.isPending || !editName.trim() || !editSubject.trim() || !editGrade.trim()}>{updateClass.isPending ? 'Saving…' : 'Save changes'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <nav className="-mx-3 overflow-x-auto border-y bg-card px-3 py-2 text-card-foreground sm:mx-0 sm:border sm:p-2" aria-label="Class workspace sections" style={{ borderRadius: 8 }}>
        <div className="flex w-max min-w-full gap-1">
          {classTabs.map(({ id: tabId, label, icon: Icon }) => (
            <button key={tabId} type="button" onClick={() => setActiveTab(tabId)} className={`flex h-10 shrink-0 items-center gap-2 px-3 text-sm font-medium transition-colors ${activeTab === tabId ? 'bg-primary text-primary-foreground' : 'text-card-foreground/80 hover:bg-accent hover:text-card-foreground'}`} style={{ borderRadius: 6 }}>
              <Icon size={15} />{label}
            </button>
          ))}
        </div>
      </nav>

      {/* Members */}
      {activeTab === 'members' && <section>
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
                <div key={member.userId} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid="member-item">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                      {member.user.avatarUrl ? <img src={member.user.avatarUrl} alt={member.user.name + " profile"} className="h-full w-full object-cover" /> : <span className="text-xs font-semibold text-muted-foreground uppercase">{member.user.name.charAt(0)}</span>}
                    </div>
                    <div>
                      <button className="text-left text-sm font-medium text-foreground hover:text-primary-text hover:underline" onClick={() => setLocation(`/profile/${member.userId}${isTeacher ? `?classId=${classId}` : ""}`)}>{member.user.name}</button>
                      {member.user.gradeOrDept && (
                        <p className="text-xs text-muted-foreground">{member.user.gradeOrDept}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
                    <Badge variant={member.role === 'teacher' ? 'default' : 'secondary'} className="capitalize">{member.role}</Badge>
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      Joined {formatDistanceToNow(new Date(member.joinedAt), { addSuffix: true })}
                    </span>
                    {isTeacher && member.role === 'student' && <Button size="sm" variant="outline" onClick={() => setActiveTab('notes')}><StickyNote size={14} className="mr-1.5" />Note</Button>}
                    {isTeacher && member.userId !== cls.teacherId && <Button size="icon" variant="ghost" className="size-8 text-destructive-text hover:bg-destructive/10 hover:text-destructive-text" onClick={() => setMemberToRemove({ userId: member.userId, name: member.user.name })} aria-label={"Remove " + member.user.name} data-testid="remove-class-member"><Trash2 size={14} /></Button>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        {isTeacher && pendingInvitations.length > 0 && <div className="mt-5 space-y-2"><h3 className="text-sm font-semibold">Pending invitations</h3>{pendingInvitations.map((invitation) => <div key={invitation.id} className="flex flex-col gap-2 border p-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderRadius: 8 }}><div className="min-w-0"><p className="truncate text-sm font-medium">{invitation.invitee.name}</p><p className="truncate text-xs text-muted-foreground">{invitation.invitee.email} · invited as {invitation.role}</p></div><Badge variant="outline">Awaiting response</Badge></div>)}</div>}
      </section>}

      <Dialog open={memberToRemove !== null} onOpenChange={(open) => { if (!open) setMemberToRemove(null); }}>
        <DialogContent><DialogHeader><DialogTitle>Remove {memberToRemove?.name}?</DialogTitle><DialogDescription>They will lose access to this class and its shared resources. You can add them again later.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setMemberToRemove(null)}>Cancel</Button><Button variant="destructive" onClick={handleRemoveMember} disabled={removeClassMember.isPending} data-testid="remove-class-member-confirm">{removeClassMember.isPending ? "Removing…" : "Remove Member"}</Button></DialogFooter></DialogContent>
      </Dialog>

      {activeTab === 'notes' && isTeacher && <section className="space-y-4"><div><h2 className="text-lg font-semibold">Member notes</h2><p className="text-sm text-muted-foreground">Private teacher notes for planning support, seating, and follow-up.</p></div><div className="grid gap-3 lg:grid-cols-2">{(seatingChart?.students ?? []).map((student) => <Card key={student.userId}><CardHeader className="pb-2"><CardTitle className="text-sm">{student.name}</CardTitle>{student.gradeOrDept && <CardDescription>{student.gradeOrDept}</CardDescription>}</CardHeader><CardContent className="space-y-3"><Textarea value={noteDrafts[student.userId] ?? ''} onChange={(event) => setNoteDrafts((current) => ({ ...current, [student.userId]: event.target.value }))} rows={5} maxLength={2000} placeholder="Private note about learning needs, collaboration, or classroom placement…" /><div className="flex flex-wrap justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setLocation(`/profile/${student.userId}?classId=${classId}`)}>Open profile</Button><Button size="sm" onClick={() => void saveMemberNote(student.userId)} disabled={updateStudentNote.isPending}>Save note</Button></div></CardContent></Card>)}</div>{!seatingChart?.students.length && <p className="border-y py-10 text-center text-sm text-muted-foreground">No students are enrolled yet.</p>}</section>}

      {activeTab === 'designer' && (isTeacher || ownMembership?.role === "student") && <SeatingChartEditor classId={classId} readOnly={!isTeacher} />}

      {activeTab === 'forum' && <ForumPage classIdOverride={classId} embedded />}

      {activeTab === 'activities' && <ActivitiesPage classIdOverride={classId} embedded readOnly={!isTeacher} />}

      {activeTab === 'canvas' && <CanvasesPage classIdOverride={classId} embedded />}

      {activeTab === 'resources' && isTeacher && (classRecommendations as ClassResourceRecommendation[] | undefined)?.some((item) => item.status === ClassResourceRecommendationStatus.pending) && (
        <section className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 dark:bg-amber-950/20" data-testid="student-recommendations-bar">
          <div className="mb-3"><h2 className="font-semibold">Student recommendations</h2><p className="text-xs text-muted-foreground">Review student suggestions before they become class resources.</p></div>
          <div className="space-y-2">
            {(classRecommendations as ClassResourceRecommendation[]).filter((item) => item.status === ClassResourceRecommendationStatus.pending).map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3">
                <div><p className="text-sm font-medium">{item.resource.title}</p><p className="text-xs text-muted-foreground">Recommended by {item.recommenderName}{item.note ? `, ${item.note}` : ""}</p></div>
                <div className="flex gap-2"><Button size="sm" onClick={() => handleReviewRecommendation(item.id, "approved")} disabled={reviewRecommendation.isPending}><Check size={14} className="mr-1" /> Approve</Button><Button size="sm" variant="outline" onClick={() => handleReviewRecommendation(item.id, "declined")} disabled={reviewRecommendation.isPending}><X size={14} className="mr-1" /> Decline</Button></div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'assignments' && <ClassAssignments
        classId={classId}
        isTeacher={isTeacher}
        resources={resourceItems.map((item) => ({ id: item.resource.id, title: item.resource.title, url: item.resource.url }))}
        initialActivityId={initialActivityId}
        initialResourceId={initialResourceId}
      />}

      {/* Class Resources */}
      {activeTab === 'resources' && <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground line-clamp-1">{item.resource.title}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${FORMAT_COLORS[item.resource.format] ?? FORMAT_COLORS.other}`}>
                          {item.resource.format}
                        </span>
                        <Badge variant="outline" className="text-[10px]"><ShieldCheck size={11} className="mr-1" /> Teacher assigned</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.resource.subject} · {item.resource.gradeLevel}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
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
                          className="text-destructive-text hover:text-destructive-text hover:bg-destructive/10"
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
      </section>}
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
