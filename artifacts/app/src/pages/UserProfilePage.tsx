import { useParams } from 'wouter';
import { User, Globe, Tag, GraduationCap } from 'lucide-react';
import { Badge } from '@workspace/edu-ds/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/edu-ds/components/ui/card';
import { Skeleton } from '@workspace/edu-ds/components/ui/skeleton';
import { Separator } from '@workspace/edu-ds/components/ui/separator';
import { useGetPublicProfile, getGetPublicProfileQueryKey } from '@workspace/api-client-react';

export default function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const id = Number(userId);
  const { data: profile, isLoading, isError } = useGetPublicProfile(id, {
    query: { enabled: !isNaN(id), queryKey: getGetPublicProfileQueryKey(id) },
  });

  if (isLoading) {
    return (
      <div className="max-w-xl mx-auto p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  if (isError || !profile) {
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
                <User size={36} className="text-primary/60" />
              )}
            </div>
            {/* Name + role */}
            <div className="flex-1 min-w-0 pt-1">
              <p className="text-xl font-semibold text-foreground truncate">{profile.name}</p>
              <div className="mt-2">
                <Badge variant="secondary" className="capitalize">
                  {profile.role}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bio */}
      {profile.bio && (
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-sm text-foreground leading-relaxed">{profile.bio}</p>
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
                <Badge key={s} variant="secondary">{s}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Details */}
      {(profile.gradeOrDept) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <GraduationCap size={15} className="text-muted-foreground" />
              Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <GraduationCap size={15} className="text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground w-28 shrink-0">
                {profile.role === 'teacher' ? 'Department' : 'Grade'}
              </span>
              <span className="text-sm text-foreground">{profile.gradeOrDept}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
