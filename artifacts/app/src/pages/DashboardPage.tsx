/**
 * @fileOverview Web screen role: renders the Dashboard Page route and coordinates its page-level data and interactions.
 * System connection: mounted from App.tsx; composes generated API hooks, local helpers, and reusable UI components.
 */
import { formatDistanceToNow } from 'date-fns';
import { useDateLocale } from "@/lib/date-locale";
import {
  BookOpen,
  Users,
  List,
  Star,
  Calendar,
  GraduationCap,
  MessageSquare,
  Layers,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/edu-ds/components/ui/card';
import { Skeleton } from '@workspace/edu-ds/components/ui/skeleton';
import { Badge } from '@workspace/edu-ds/components/ui/badge';
import { useGetDashboardSummary, useGetRecentActivity } from '@workspace/api-client-react';
import { ActivityItemType } from '@workspace/api-client-react';

function StatCard({
  title,
  value,
  icon: Icon,
  loading,
}: {
  title: string;
  value?: number;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon size={18} className="text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <p className="text-3xl font-bold text-foreground">{value ?? 0}</p>
        )}
      </CardContent>
    </Card>
  );
}

function activityIcon(type: string) {
  switch (type) {
    case ActivityItemType.review: return <Star size={14} className="text-warning-text" />;
    case ActivityItemType.resource: return <BookOpen size={14} className="text-primary-text" />;
    case ActivityItemType.list: return <List size={14} className="text-accent" />;
    case ActivityItemType.schedule: return <Calendar size={14} className="text-purple-500" />;
    case ActivityItemType.class: return <GraduationCap size={14} className="text-success-text" />;
    default: return <MessageSquare size={14} className="text-muted-foreground" />;
  }
}

/**
 * The name a reader sees for an activity's kind.
 *
 * `type` is a database enum and this printed it with a `capitalize` class over
 * the top, which reads as a word in English and as a column value everywhere
 * else -- the bridge matches whole strings, and nobody wrote a translation for
 * "schedule". The same fix as the resource format and the goal level before
 * it.
 *
 * An unknown kind falls back to itself rather than to a catch-all: a type this
 * table has not heard of is better shown than silently relabelled.
 */
const ACTIVITY_TYPE_NAME: Record<string, string> = {
  review: "Review",
  resource: "Resource",
  list: "List",
  schedule: "Schedule",
  class: "Class",
};

function activityBadgeVariant(type: string): 'default' | 'secondary' | 'outline' {
  switch (type) {
    case ActivityItemType.review: return 'default';
    case ActivityItemType.resource: return 'secondary';
    default: return 'outline';
  }
}

export default function DashboardPage() {
  const locale = useDateLocale();
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: activity, isLoading: activityLoading } = useGetRecentActivity();

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Welcome back! Here&apos;s your overview.</p>
      </div>

      {/* Stats */}
      <section aria-label="Summary statistics">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard title="Classes" value={summary?.classCount} icon={GraduationCap} loading={summaryLoading} />
          <StatCard title="Resources" value={summary?.resourceCount} icon={BookOpen} loading={summaryLoading} />
          <StatCard title="Lists" value={summary?.listCount} icon={List} loading={summaryLoading} />
          <StatCard title="Reviews" value={summary?.reviewCount} icon={Star} loading={summaryLoading} />
          <StatCard title="Students" value={summary?.studentCount} icon={Users} loading={summaryLoading} />
          <StatCard title="Blocks" value={summary?.scheduleBlockCount} icon={Calendar} loading={summaryLoading} />
        </div>
      </section>

      {/* Recent Activity */}
      <section aria-label="Recent activity">
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Layers size={18} className="text-muted-foreground" />
          Recent Activity
        </h2>

        {activityLoading ? (
          <Card>
            <CardContent className="py-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="h-6 w-6 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : !activity || activity.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Layers size={32} className="mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No recent activity yet. Start exploring!</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-2 divide-y divide-border">
              {activity.map((item) => (
                <div key={item.id} className="flex items-start gap-3 py-3" data-testid="activity-item">
                  <div className="mt-0.5 shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-muted">
                    {activityIcon(item.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* Server-composed and English -- "You were removed from <class name>."
                        -- so the bridge could not translate it in any case, and
                        translate="no" keeps it from rewriting the class or person
                        named inside. */}
                    <p translate="no" className="text-sm text-foreground">{item.message}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={activityBadgeVariant(item.type)} className="text-xs px-1.5 py-0">
                        {ACTIVITY_TYPE_NAME[item.type] ?? item.type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
