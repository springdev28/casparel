/**
 * @fileOverview Web screen role: renders the User Profile Page route and coordinates its page-level data and interactions.
 * System connection: mounted from App.tsx; composes generated API hooks, local helpers, and reusable UI components.
 */
import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { User, Globe, Tag, GraduationCap, ExternalLink, ShieldBan, Flag, Loader2, ClipboardPen, BookOpen, List, MessageCircle } from 'lucide-react';
import { Badge } from '@workspace/edu-ds/components/ui/badge';
import { Button } from '@workspace/edu-ds/components/ui/button';
import { Textarea } from '@workspace/edu-ds/components/ui/textarea';
import { toast } from '@workspace/edu-ds/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/edu-ds/components/ui/card';
import { Skeleton } from '@workspace/edu-ds/components/ui/skeleton';
import { Separator } from '@workspace/edu-ds/components/ui/separator';
import { useGetPublicProfile, getGetPublicProfileQueryKey, useGetUserLibrary, getGetUserLibraryQueryKey, useGetUserSafetyStatus, getGetUserSafetyStatusQueryKey, useBlockUser, useUnblockUser, useReportUser, ReportUserInputReason, useGetSeatingChart, getGetSeatingChartQueryKey, useUpdateStudentNote } from '@workspace/api-client-react';
import { formatName } from "@/lib/resource-format";
import { LoadFailure } from "@/components/LoadFailure";

export default function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const id = Number(userId);
  const classId = Number(new URLSearchParams(window.location.search).get("classId"));
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportUserInputReason>(ReportUserInputReason.other);
  const [reportDetails, setReportDetails] = useState("");
  const safety = useGetUserSafetyStatus(id, { query: { enabled: !isNaN(id), queryKey: getGetUserSafetyStatusQueryKey(id) } });
  const blockUser = useBlockUser(), unblockUser = useUnblockUser(), reportUser = useReportUser();
  const classChart = useGetSeatingChart(classId, { query: { enabled: Number.isInteger(classId) && classId > 0, queryKey: getGetSeatingChartQueryKey(classId), retry: false } });
  const updateStudentNote = useUpdateStudentNote();
  const classStudent = classChart.data?.students.find((student) => student.userId === id);
  const [teacherNote, setTeacherNote] = useState("");
  useEffect(() => setTeacherNote(classStudent?.teacherNote ?? ""), [classStudent?.teacherNote]);
  const {
    data: profile,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useGetPublicProfile(id, {
    query: { enabled: !isNaN(id), queryKey: getGetPublicProfileQueryKey(id) },
  });
  const library = useGetUserLibrary(id, {
    query: { enabled: !isNaN(id), queryKey: getGetUserLibraryQueryKey(id), retry: false },
  });

  async function saveTeacherNote() {
    if (!classStudent) return;
    try {
      await updateStudentNote.mutateAsync({ id: classId, userId: id, data: { note: teacherNote.trim() || null } });
      await queryClient.invalidateQueries({ queryKey: getGetSeatingChartQueryKey(classId) });
      toast({ title: "Private student note saved", description: "Future seating suggestions will use the updated note." });
    } catch { toast({ title: "Could not save private note", variant: "destructive" }); }
  }

  async function toggleBlock() {
    try {
      if (safety.data?.blocked) {
        await unblockUser.mutateAsync({ id });
        await queryClient.invalidateQueries({ queryKey: getGetUserSafetyStatusQueryKey(id) });
        toast({ title: "User unblocked" });
      } else {
        if (!window.confirm("Block this user? You will no longer be able to view each other or collaborate in study sessions.")) return;
        await blockUser.mutateAsync({ id });
        toast({ title: "User blocked", description: "They can no longer view your profile or collaborate with you." });
        setLocation("/people");
      }
    } catch { toast({ title: "Could not update block", variant: "destructive" }); }
  }

  async function submitReport() {
    try {
      await reportUser.mutateAsync({ id, data: { reason: reportReason, details: reportDetails.trim() || null } });
      setReportOpen(false); setReportDetails("");
      toast({ title: "Report received", description: "Thanks. This was submitted privately for moderation review." });
    } catch { toast({ title: "Could not submit report", variant: "destructive" }); }
  }

  if (isLoading) {
    return (
      <div className="max-w-xl mx-auto p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  /*
   * A request that failed is not a person who does not exist.
   *
   * One branch covered both, so a reader whose network dropped was told
   * "User not found." about somebody they had just tapped on -- which reads
   * as "this account is gone" and offers nothing to do about it. The page had
   * never been rendered against a server that would not answer.
   */
  if (isError && profile === undefined) {
    return (
      <div className="max-w-xl mx-auto p-6">
        <LoadFailure
          error={error}
          retrying={isFetching}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-xl mx-auto p-6">
        <p className="text-muted-foreground">User not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Profile</h1>
      </div>

      {/* Identity card */}
      <Card>
        <CardContent className="pt-6 pb-4">
          <div className="flex items-start gap-5">
            {/* Avatar */}
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden border-2 border-border shrink-0">
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt={profile.name} className="w-full h-full object-cover" />
              ) : (
                <User size={36} className="text-primary-text/60" />
              )}
            </div>
            {/* Name + role */}
            <div className="flex-1 min-w-0 pt-1">
              <p translate="no" className="text-xl font-semibold text-foreground truncate">{profile.name}</p>
              <div className="mt-2">
                <Badge variant="secondary" className="capitalize">
                  {profile.role}
                </Badge>
              </div>
              <Button size="sm" className="mt-3" onClick={() => setLocation(`/messages?userId=${profile.id}`)}><MessageCircle className="mr-2 size-4" />Message</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {classStudent && <Card className="border-primary/20">
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><ClipboardPen className="size-4 text-primary-text" />Private teacher note · class seating</CardTitle></CardHeader>
        <CardContent className="space-y-3"><p className="text-xs text-muted-foreground">Only teachers of this class can see this note. The seating assistant uses its latest saved wording, including named relationships.</p><Textarea value={teacherNote} onChange={(event) => setTeacherNote(event.target.value)} maxLength={2000} rows={5} placeholder={`Example:  talks a lot with Jane. Keep them at different desks.`} /><Button onClick={saveTeacherNote} disabled={updateStudentNote.isPending}>{updateStudentNote.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Save private note</Button></CardContent>
      </Card>}

      <Card className="border-border/80">
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><ShieldBan className="size-4" />Safety controls</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Blocking is private. Blocked users cannot view your profile or join collaborative study sessions with you.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={toggleBlock} disabled={blockUser.isPending || unblockUser.isPending || safety.isLoading}>
              {(blockUser.isPending || unblockUser.isPending) ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ShieldBan className="mr-2 size-4" />}
              {safety.data?.blocked ? "Unblock user" : "Block user"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setReportOpen((open) => !open)}><Flag className="mr-2 size-4" />Report privately</Button>
          </div>
          {reportOpen && <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <label className="block text-xs font-medium">Reason<select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={reportReason} onChange={(event) => setReportReason(event.target.value as ReportUserInputReason)}>
              <option value={ReportUserInputReason.spam}>Spam</option><option value={ReportUserInputReason.harassment}>Harassment</option><option value={ReportUserInputReason.impersonation}>Impersonation</option><option value={ReportUserInputReason.unsafe_content}>Unsafe content</option><option value={ReportUserInputReason.other}>Other</option>
            </select></label>
            <Textarea value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={1000} rows={3} placeholder="Optional context for the moderation team…" />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="ghost" size="sm" onClick={() => setReportOpen(false)}>Cancel</Button><Button size="sm" onClick={submitReport} disabled={reportUser.isPending}>{reportUser.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Submit report</Button></div>
          </div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><BookOpen size={16} className="text-primary-text" />User Library</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {library.isLoading ? <Skeleton className="h-24 w-full" /> : library.isError ? (
            <p className="text-sm text-muted-foreground">This user’s library is private or limited to classmates.</p>
          ) : (library.data?.resources.length || library.data?.lists.length) ? (
            <>
              {library.data.lists.length > 0 && <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lists</p><div className="space-y-2">{library.data.lists.map((item) => <button key={item.id} onClick={() => setLocation("/lists/" + item.id)} className="flex w-full items-center gap-3 rounded-lg border p-3 text-left hover:border-primary"><List size={16} className="text-primary-text" /><span><span translate="no" className="block text-sm font-medium">{item.name}</span>{item.description && <span translate="no" className="block text-xs text-muted-foreground">{item.description}</span>}</span></button>)}</div></div>}
              {library.data.resources.length > 0 && <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resources</p><div className="space-y-2">{library.data.resources.map((resource) => <button key={resource.id} onClick={() => setLocation("/resources/" + resource.id)} className="flex w-full items-center gap-3 rounded-lg border p-3 text-left hover:border-primary"><BookOpen size={16} className="text-primary-text" /><span><span translate="no" className="block text-sm font-medium">{resource.title}</span><span className="block text-xs text-muted-foreground"><span translate="no">{resource.subject}</span> · {formatName(resource.format)}</span></span></button>)}</div></div>}
            </>
          ) : <p className="text-sm text-muted-foreground">This user has not added anything to their library yet.</p>}
        </CardContent>
      </Card>

      {/* Bio */}
      {profile.bio && (
        <Card>
          <CardContent className="pt-5 pb-4">
            <p translate="no" className="text-sm text-foreground leading-relaxed">{profile.bio}</p>
          </CardContent>
        </Card>
      )}

      {/* Subjects */}
      {profile.subjects && profile.subjects.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Tag size={15} className="text-muted-foreground" />
              Subjects &amp; Interests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {profile.subjects.map((s) => (
                <Badge key={s} translate="no" variant="secondary">{s}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Details */}
      {(profile.gradeOrDept || profile.websiteUrl) && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><GraduationCap size={15} className="text-muted-foreground" />Details</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {profile.gradeOrDept && <div className="flex items-center gap-2"><GraduationCap size={15} className="shrink-0 text-muted-foreground" /><span className="w-28 shrink-0 text-sm text-muted-foreground">{profile.role === "teacher" ? "Department" : "Grade"}</span><span translate="no" className="text-sm text-foreground">{profile.gradeOrDept}</span></div>}
            {profile.gradeOrDept && profile.websiteUrl && <Separator />}
            {profile.websiteUrl && <a href={profile.websiteUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary-text hover:underline"><Globe size={15} className="shrink-0" /><span className="min-w-0 flex-1 truncate">{profile.websiteUrl}</span><ExternalLink size={14} className="shrink-0" /></a>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
