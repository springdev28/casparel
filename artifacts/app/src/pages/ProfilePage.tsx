import { useState, useRef } from 'react';
import { useLocation } from 'wouter';
import {
  User,
  Camera,
  Globe,
  BookOpen,
  Tag,
  Clock,
  GraduationCap,
  CheckCircle2,
  AlertCircle,
  Pencil,
  X,
  Save,
} from 'lucide-react';
import { Button } from '@workspace/edu-ds/components/ui/button';
import { Input } from '@workspace/edu-ds/components/ui/input';
import { Label } from '@workspace/edu-ds/components/ui/label';
import { Textarea } from '@workspace/edu-ds/components/ui/textarea';
import { Badge } from '@workspace/edu-ds/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/edu-ds/components/ui/card';
import { Skeleton } from '@workspace/edu-ds/components/ui/skeleton';
import { Separator } from '@workspace/edu-ds/components/ui/separator';
import { Progress } from '@workspace/edu-ds/components/ui/progress';
import { toast } from '@workspace/edu-ds/hooks/use-toast';
import {
  useGetMe,
  useUpdateMe,
  useUploadAvatar,
  getGetMeQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@workspace/edu-ds/lib/utils';

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
  'Pacific/Auckland',
];

const SUBJECT_SUGGESTIONS = [
  'Mathematics', 'Science', 'English', 'History', 'Geography',
  'Computer Science', 'Art', 'Music', 'Physical Education',
  'Biology', 'Chemistry', 'Physics', 'Economics', 'Psychology',
  'Literature', 'Philosophy', 'Languages', 'Engineering',
];

/** Returns number 0–100 representing how complete a profile is */
function profileCompleteness(user: {
  name?: string;
  avatarUrl?: string | null;
  bio?: string | null;
  subjects?: string[] | null;
  gradeOrDept?: string | null;
  timezone?: string | null;
  websiteUrl?: string | null;
}): number {
  const fields = [
    !!user.name,
    !!user.avatarUrl,
    !!user.bio,
    !!(user.subjects && user.subjects.length > 0),
    !!user.gradeOrDept,
    !!user.timezone,
    !!user.websiteUrl,
  ];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
}

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: me, isLoading } = useGetMe();
  const updateMe = useUpdateMe();
  const uploadAvatar = useUploadAvatar();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: '',
    bio: '',
    gradeOrDept: '',
    timezone: '',
    websiteUrl: '',
    subjects: [] as string[],
  });
  const [subjectInput, setSubjectInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function startEditing() {
    if (!me) return;
    setForm({
      name: me.name ?? '',
      bio: me.bio ?? '',
      gradeOrDept: me.gradeOrDept ?? '',
      timezone: me.timezone ?? '',
      websiteUrl: me.websiteUrl ?? '',
      subjects: me.subjects ?? [],
    });
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setSubjectInput('');
  }

  async function handleSave() {
    try {
      await updateMe.mutateAsync({
        data: {
          name: form.name || undefined,
          bio: form.bio || null,
          gradeOrDept: form.gradeOrDept || null,
          timezone: form.timezone || null,
          websiteUrl: form.websiteUrl || null,
          subjects: form.subjects.length > 0 ? form.subjects : null,
        },
      });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title: 'Profile saved' });
      setEditing(false);
    } catch {
      toast({ title: 'Error', description: 'Could not save profile', variant: 'destructive' });
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      // Pass the File object directly — the generated client wraps it in FormData
      await uploadAvatar.mutateAsync({ data: { file } });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title: 'Avatar updated' });
    } catch {
      toast({ title: 'Error', description: 'Could not upload avatar', variant: 'destructive' });
    }
  }

  function addSubject(s: string) {
    const trimmed = s.trim();
    if (!trimmed || form.subjects.includes(trimmed)) return;
    setForm((prev) => ({ ...prev, subjects: [...prev.subjects, trimmed] }));
    setSubjectInput('');
  }

  function removeSubject(s: string) {
    setForm((prev) => ({ ...prev, subjects: prev.subjects.filter((x) => x !== s) }));
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!me) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <p className="text-muted-foreground">Could not load profile.</p>
      </div>
    );
  }

  const completeness = profileCompleteness(me);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">My Profile</h1>
        {!editing ? (
          <Button variant="outline" size="sm" onClick={startEditing}>
            <Pencil size={15} className="mr-2" />
            Edit Profile
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={cancelEditing}>
              <X size={15} className="mr-1" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={updateMe.isPending}>
              <Save size={15} className="mr-1" />
              {updateMe.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        )}
      </div>

      {/* Completeness indicator */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-medium text-foreground">Profile completeness</span>
            <span className="text-sm font-semibold text-primary">{completeness}%</span>
          </div>
          <Progress value={completeness} className="h-2" />
          {completeness < 100 && (
            <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
              <AlertCircle size={12} />
              Fill in all fields to complete your profile
            </p>
          )}
          {completeness === 100 && (
            <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1">
              <CheckCircle2 size={12} />
              Your profile is complete!
            </p>
          )}
        </CardContent>
      </Card>

      {/* Avatar + name */}
      <Card>
        <CardContent className="pt-6 pb-4">
          <div className="flex items-start gap-5">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden border-2 border-border">
                {me.avatarUrl ? (
                  <img src={me.avatarUrl} alt={me.name} className="w-full h-full object-cover" />
                ) : (
                  <User size={36} className="text-primary/60" />
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadAvatar.isPending}
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors shadow"
                title="Change avatar"
              >
                <Camera size={13} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>

            {/* Name + role */}
            <div className="flex-1 min-w-0">
              {editing ? (
                <div className="space-y-2">
                  <Label htmlFor="name">Display name</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Your name"
                    maxLength={100}
                  />
                </div>
              ) : (
                <>
                  <p className="text-xl font-semibold text-foreground truncate">{me.name}</p>
                  <p className="text-sm text-muted-foreground">{me.email}</p>
                </>
              )}
              <div className="mt-2">
                <Badge variant="secondary" className="capitalize">
                  {me.role}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bio */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <BookOpen size={15} className="text-muted-foreground" />
            Bio
          </CardTitle>
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="space-y-1.5">
              <Textarea
                value={form.bio}
                onChange={(e) => setForm((p) => ({ ...p, bio: e.target.value }))}
                placeholder="Tell others about yourself…"
                maxLength={300}
                rows={3}
              />
              <p className="text-xs text-muted-foreground text-right">{form.bio.length}/300</p>
            </div>
          ) : me.bio ? (
            <p className="text-sm text-foreground leading-relaxed">{me.bio}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">No bio yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Subjects / interests */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Tag size={15} className="text-muted-foreground" />
            Subjects &amp; Interests
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {editing ? (
            <>
              <div className="flex gap-2">
                <Input
                  value={subjectInput}
                  onChange={(e) => setSubjectInput(e.target.value)}
                  placeholder="Add a subject…"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addSubject(subjectInput);
                    }
                  }}
                  list="subject-suggestions"
                />
                <datalist id="subject-suggestions">
                  {SUBJECT_SUGGESTIONS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
                <Button type="button" variant="outline" size="sm" onClick={() => addSubject(subjectInput)}>
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {form.subjects.map((s) => (
                  <Badge key={s} variant="secondary" className="gap-1">
                    {s}
                    <button onClick={() => removeSubject(s)} className="ml-0.5 hover:text-destructive">
                      <X size={11} />
                    </button>
                  </Badge>
                ))}
              </div>
              {/* Quick-add suggestions */}
              <div className="flex flex-wrap gap-1.5">
                {SUBJECT_SUGGESTIONS.filter((s) => !form.subjects.includes(s)).slice(0, 8).map((s) => (
                  <button
                    key={s}
                    onClick={() => addSubject(s)}
                    className="text-xs px-2 py-0.5 rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            </>
          ) : me.subjects && me.subjects.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {me.subjects.map((s) => (
                <Badge key={s} variant="secondary">{s}</Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No subjects added yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Grade / Department + Timezone + Website */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <GraduationCap size={15} className="text-muted-foreground" />
            Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {editing ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="gradeOrDept">
                  {me.role === 'teacher' ? 'Department' : 'Grade level'}
                </Label>
                <Input
                  id="gradeOrDept"
                  value={form.gradeOrDept}
                  onChange={(e) => setForm((p) => ({ ...p, gradeOrDept: e.target.value }))}
                  placeholder={me.role === 'teacher' ? 'e.g. Science Department' : 'e.g. Grade 10'}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="timezone" className="flex items-center gap-1.5">
                  <Clock size={13} />
                  Timezone
                </Label>
                <select
                  id="timezone"
                  value={form.timezone}
                  onChange={(e) => setForm((p) => ({ ...p, timezone: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Select timezone…</option>
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="websiteUrl" className="flex items-center gap-1.5">
                  <Globe size={13} />
                  Website / Social link
                </Label>
                <Input
                  id="websiteUrl"
                  type="url"
                  value={form.websiteUrl}
                  onChange={(e) => setForm((p) => ({ ...p, websiteUrl: e.target.value }))}
                  placeholder="https://…"
                />
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <GraduationCap size={15} className="text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground w-28 shrink-0">
                  {me.role === 'teacher' ? 'Department' : 'Grade'}
                </span>
                <span className={cn('text-sm', me.gradeOrDept ? 'text-foreground' : 'text-muted-foreground italic')}>
                  {me.gradeOrDept || 'Not set'}
                </span>
              </div>
              <Separator />
              <div className="flex items-center gap-2">
                <Clock size={15} className="text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground w-28 shrink-0">Timezone</span>
                <span className={cn('text-sm', me.timezone ? 'text-foreground' : 'text-muted-foreground italic')}>
                  {me.timezone || 'Not set'}
                </span>
              </div>
              <Separator />
              <div className="flex items-center gap-2">
                <Globe size={15} className="text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground w-28 shrink-0">Website</span>
                {me.websiteUrl ? (
                  <a
                    href={me.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline truncate"
                  >
                    {me.websiteUrl}
                  </a>
                ) : (
                  <span className="text-sm text-muted-foreground italic">Not set</span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
