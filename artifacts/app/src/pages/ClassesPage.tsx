import { useState, useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Plus, Users, BookOpen, RefreshCw, LogOut, ExternalLink, Download, AlertCircle } from 'lucide-react';
import { Button } from '@workspace/edu-ds/components/ui/button';
import { Input } from '@workspace/edu-ds/components/ui/input';
import { Label } from '@workspace/edu-ds/components/ui/label';
import { Textarea } from '@workspace/edu-ds/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/edu-ds/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@workspace/edu-ds/components/ui/dialog';
import { Alert, AlertDescription } from '@workspace/edu-ds/components/ui/alert';
import { Badge } from '@workspace/edu-ds/components/ui/badge';
import { Skeleton } from '@workspace/edu-ds/components/ui/skeleton';
import { toast } from '@workspace/edu-ds/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListClasses,
  useCreateClass,
  useGetMe,
  useGetGCStatus,
  useGetGCAuthUrl,
  useListGCCourses,
  useDisconnectGoogle,
  useImportGCCourse,
  getListClassesQueryKey,
  getGetGCStatusQueryKey,
  getGetGCAuthUrlQueryKey,
  getListGCCoursesQueryKey,
  UserRole,
} from '@workspace/api-client-react';

export default function ClassesPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();

  // Create class dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newGrade, setNewGrade] = useState('');
  const [newDesc, setNewDesc] = useState('');

  // GC dialog
  const [gcDialogOpen, setGcDialogOpen] = useState(false);
  const [importingCourseId, setImportingCourseId] = useState<string | null>(null);
  // Set to true when arriving via ?connect_gc=1 — triggers OAuth once gcStatus loads
  const [pendingAutoConnect, setPendingAutoConnect] = useState(false);
  // Set to true when a GC API call returns 401/403 (token expired/revoked)
  const [gcReconnectNeeded, setGcReconnectNeeded] = useState(false);

  const { data: classes, isLoading } = useListClasses();
  const { data: me } = useGetMe();
  const createClass = useCreateClass();
  const isTeacher = (me?.activeRole ?? me?.role) === UserRole.teacher;

  // Google Classroom
  const { data: gcStatus, isLoading: gcStatusLoading } = useGetGCStatus({
    query: { enabled: isTeacher, queryKey: getGetGCStatusQueryKey() },
  });
  const { data: gcAuthUrlData, refetch: fetchAuthUrl, isFetching: authUrlFetching } = useGetGCAuthUrl({
    query: { enabled: false, queryKey: getGetGCAuthUrlQueryKey() },
  });
  // Background health check: fetch courses whenever teacher is connected so we catch
  // revoked/expired tokens before the user opens the import dialog.
  const { data: gcCourses, isLoading: gcCoursesLoading, refetch: refetchCourses, error: gcCoursesError } = useListGCCourses({
    query: {
      enabled: isTeacher && gcStatus?.connected === true,
      queryKey: getListGCCoursesQueryKey(),
      retry: false,
      staleTime: 5 * 60 * 1000,
    },
  });
  const disconnectGoogle = useDisconnectGoogle();
  const importGCCourse = useImportGCCourse();

  // Detect 401/403 from GC API calls → prompt re-authentication
  useEffect(() => {
    if (!gcCoursesError) return;
    const status = (gcCoursesError as { status?: number }).status;
    if (status === 401 || status === 403) {
      setGcReconnectNeeded(true);
    }
  }, [gcCoursesError]);

  // ── Handle OAuth redirect params ──────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(search);
    const gcConnected = params.get('gc_connected');
    const gcError = params.get('gc_error');
    const connectGc = params.get('connect_gc');

    if (gcConnected === '1') {
      toast({
        title: 'Google Classroom connected!',
        description: 'You can now import courses and share resource lists.',
      });
      queryClient.invalidateQueries({ queryKey: getGetGCStatusQueryKey() });
      setLocation('/classes', { replace: true });
    } else if (gcError) {
      const messages: Record<string, string> = {
        access_denied: 'You denied access to Google Classroom.',
        invalid_state: 'The authorization request expired. Please try again.',
        token_exchange_failed: 'Could not complete Google authorization. Please try again.',
        missing_params: 'Authorization was interrupted. Please try again.',
        network_error: 'A network error occurred. Please try again.',
      };
      toast({
        title: 'Google Classroom connection failed',
        description: messages[gcError] ?? 'An unknown error occurred.',
        variant: 'destructive',
      });
      setLocation('/classes', { replace: true });
    } else if (connectGc === '1') {
      // Arrived from another page requesting a GC connect — flag it and clear the URL.
      // The second effect below will trigger OAuth once gcStatus has loaded.
      setPendingAutoConnect(true);
      setLocation('/classes', { replace: true });
    }
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Once gcStatus loads and we have a pending auto-connect request, initiate OAuth.
  useEffect(() => {
    if (pendingAutoConnect && gcStatus?.configured && !gcStatus.connected) {
      setPendingAutoConnect(false);
      handleConnectGoogle();
    } else if (pendingAutoConnect && gcStatus && !gcStatus.configured) {
      // GC not configured on this server — clear the flag silently
      setPendingAutoConnect(false);
    }
  }, [gcStatus, pendingAutoConnect]); // eslint-disable-line react-hooks/exhaustive-deps

  // When auth URL arrives, redirect there
  useEffect(() => {
    if (gcAuthUrlData?.url) {
      window.location.href = gcAuthUrlData.url;
    }
  }, [gcAuthUrlData]);

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

  async function handleConnectGoogle() {
    try {
      await fetchAuthUrl();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not initiate Google authorization';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  }

  async function handleDisconnectGoogle() {
    try {
      await disconnectGoogle.mutateAsync();
      queryClient.invalidateQueries({ queryKey: getGetGCStatusQueryKey() });
      toast({ title: 'Google Classroom disconnected' });
    } catch {
      toast({ title: 'Error', description: 'Could not disconnect Google Classroom', variant: 'destructive' });
    }
  }

  async function handleImportCourse(courseId: string, courseName: string) {
    setImportingCourseId(courseId);
    try {
      const cls = await importGCCourse.mutateAsync({ data: { courseId } });
      queryClient.invalidateQueries({ queryKey: getListClassesQueryKey() });
      toast({
        title: 'Class imported!',
        description: `"${cls.name}" was created from your Google Classroom course.`,
      });
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 403) {
        setGcDialogOpen(false);
        setGcReconnectNeeded(true);
      } else {
        const message = err instanceof Error ? err.message : 'Failed to import course';
        toast({ title: 'Error', description: message, variant: 'destructive' });
      }
    } finally {
      setImportingCourseId(null);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* Google Classroom reconnect banner */}
      {gcReconnectNeeded && gcStatus?.connected && (
        <Alert variant="destructive" className="flex items-start gap-3" data-testid="gc-reconnect-banner">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <AlertDescription className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="flex-1">
              Your Google Classroom connection has expired or been revoked. Reconnect to continue importing courses.
            </span>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => { setGcReconnectNeeded(false); handleConnectGoogle(); }}
              disabled={authUrlFetching}
              data-testid="gc-reconnect-button"
            >
              {authUrlFetching ? <RefreshCw size={13} className="mr-1.5 animate-spin" /> : <BookOpen size={13} className="mr-1.5 text-[#4285F4]" />}
              Reconnect Google Classroom
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Classes</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage and join your classes</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">

          {/* Google Classroom — teachers only */}
          {isTeacher && (
            <>
              {gcStatusLoading ? (
                <Skeleton className="h-9 w-44" />
              ) : gcStatus?.connected ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setGcDialogOpen(true); refetchCourses(); }}
                    data-testid="import-gc-button"
                  >
                    <BookOpen size={15} className="mr-1.5 text-[#4285F4]" />
                    Import from Google Classroom
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDisconnectGoogle}
                    disabled={disconnectGoogle.isPending}
                    title="Disconnect Google Classroom"
                    data-testid="disconnect-gc-button"
                  >
                    <LogOut size={14} />
                  </Button>
                </>
              ) : gcStatus?.configured ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleConnectGoogle}
                  disabled={authUrlFetching}
                  data-testid="connect-gc-button"
                >
                  {authUrlFetching ? (
                    <RefreshCw size={14} className="mr-1.5 animate-spin" />
                  ) : (
                    <BookOpen size={15} className="mr-1.5 text-[#4285F4]" />
                  )}
                  Connect Google Classroom
                </Button>
              ) : gcStatus && !gcStatus.configured ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  title="Google Classroom credentials are not configured on this server. Contact your admin."
                  data-testid="gc-not-configured-button"
                >
                  <BookOpen size={15} className="mr-1.5 text-muted-foreground" />
                  Google Classroom (not configured)
                </Button>
              ) : null}
            </>
          )}

          {/* Create class dialog */}
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
                    <Input
                      id="class-name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      required
                      data-testid="class-name-input"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="class-subject">Subject</Label>
                      <Input
                        id="class-subject"
                        value={newSubject}
                        onChange={(e) => setNewSubject(e.target.value)}
                        required
                        data-testid="class-subject-input"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="class-grade">Grade level</Label>
                      <Input
                        id="class-grade"
                        value={newGrade}
                        onChange={(e) => setNewGrade(e.target.value)}
                        required
                        data-testid="class-grade-input"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="class-desc">Description (optional)</Label>
                    <Textarea
                      id="class-desc"
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      rows={2}
                      data-testid="class-desc-input"
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => { setDialogOpen(false); resetForm(); }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={createClass.isPending}
                      data-testid="create-class-confirm"
                    >
                      {createClass.isPending ? 'Creating…' : 'Create Class'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Google Classroom import dialog */}
      <Dialog open={gcDialogOpen} onOpenChange={setGcDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen size={18} className="text-[#4285F4]" />
              Import from Google Classroom
            </DialogTitle>
            <DialogDescription>
              Your active Google Classroom courses. Click <strong>Import as Class</strong> to
              create a Schoolar class from any course — you can then share resource lists to its
              stream.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-80 overflow-y-auto py-1">
            {gcCoursesLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3 items-center p-3 rounded-lg border">
                  <Skeleton className="h-5 w-5 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                  <Skeleton className="h-8 w-28 shrink-0" />
                </div>
              ))
            ) : !gcCourses || gcCourses.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <BookOpen size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">No active Google Classroom courses found.</p>
                <p className="text-xs mt-1">
                  Make sure you are a teacher in at least one active course.
                </p>
              </div>
            ) : (
              gcCourses.map((course) => (
                <div
                  key={course.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                  data-testid="gc-course-row"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{course.name}</p>
                    {course.section && (
                      <p className="text-xs text-muted-foreground">{course.section}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <a
                      href={`https://classroom.google.com/c/${course.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground p-1"
                      title="Open in Google Classroom"
                    >
                      <ExternalLink size={14} />
                    </a>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleImportCourse(course.id, course.name)}
                      disabled={importingCourseId === course.id}
                      data-testid="import-gc-course-button"
                    >
                      {importingCourseId === course.id ? (
                        <RefreshCw size={13} className="mr-1 animate-spin" />
                      ) : (
                        <Download size={13} className="mr-1" />
                      )}
                      {importingCourseId === course.id ? 'Importing…' : 'Import as Class'}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setGcDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Classes grid */}
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
            {isTeacher
              ? 'Create your first class or import one from Google Classroom.'
              : "You haven't joined any classes yet."}
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
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                    {cls.description}
                  </p>
                )}
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Users size={14} />
                  <span>
                    {cls.memberCount ?? 0} member{cls.memberCount !== 1 ? 's' : ''}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
