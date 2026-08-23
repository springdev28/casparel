/**
 * @fileOverview Mobile screen role: defines the Expo Router Index screen or route layout.
 * System connection: composed by Expo Router and backed by auth, onboarding, purchases, secure storage, and the shared API.
 */
import React from 'react';
import {
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Skeleton } from '@workspace/edu-ds/components/native/skeleton';
import { Empty } from '@workspace/edu-ds/components/native/empty';
import {
  useGetDashboardSummary,
  useGetMe,
  useGetRecentActivity,
  useListLearningGoals,
} from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Button } from '@workspace/edu-ds/components/native/button';
import { useAuth } from '@/contexts/AuthContext';
import { ErrorState } from '@/components/ErrorState';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { ProgressTransition } from '@/components/ProgressTransition';
import { nextIncompleteStep, selectResumableGoal } from '@/utils/learning-path';
import { progressPercent } from '@/utils/progress';
import type { ActivityItem } from '@workspace/api-client-react';

function StatCard({
  label,
  value,
  icon,
  color,
  isLoading,
  isFailed,
}: {
  label: string;
  value: number | undefined;
  icon: string;
  color: string;
  isLoading: boolean;
  isFailed: boolean;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.statCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      <View style={[styles.statIcon, { backgroundColor: color + '1A', borderRadius: colors.radius - 2 }]}>
        <Feather name={icon as never} size={20} color={color} />
      </View>
      {isLoading ? (
        <Skeleton width={40} height={28} style={{ marginTop: 8 }} />
      ) : isFailed ? (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}
        >
          <Feather name="alert-circle" size={16} color={colors.destructiveText} />
          <Text
            style={[
              styles.statValue,
              {
                fontSize: 20,
                letterSpacing: 0,
                color: colors.destructiveText,
                fontFamily: colors.fontFamily.sansBold,
              },
            ]}
          >
            —
          </Text>
        </View>
      ) : (
        <Text
          style={[
            styles.statValue,
            { color: colors.foreground, fontFamily: colors.fontFamily.sansBold },
          ]}
        >
          {value ?? 0}
        </Text>
      )}
      <Text
        style={[
          styles.statLabel,
          { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const colors = useColors();
  const iconMap: Record<string, string> = {
    review: 'star',
    resource: 'book',
    list: 'list',
    schedule: 'calendar',
    class: 'users',
  };
  const colorMap: Record<string, string> = {
    review: colors.accent,
    resource: colors.primary,
    list: colors.chart3,
    schedule: colors.chart4,
    class: colors.chart5,
  };
  const icon = iconMap[item.type] ?? 'activity';
  const iconColor = colorMap[item.type] ?? colors.mutedForeground;
  const date = new Date(item.createdAt);
  const timeStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <View style={[styles.activityRow, { borderBottomColor: colors.border }]}>
      <View
        style={[
          styles.activityIcon,
          { backgroundColor: iconColor + '1A', borderRadius: 20 },
        ]}
      >
        <Feather name={icon as never} size={14} color={iconColor} />
      </View>
      <Text
        style={[
          styles.activityMsg,
          { color: colors.foreground, fontFamily: colors.fontFamily.sans },
        ]}
        numberOfLines={2}
      >
        {item.message}
      </Text>
      <Text
        style={[
          styles.activityTime,
          { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
        ]}
      >
        {timeStr}
      </Text>
    </View>
  );
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user: authUser } = useAuth();

  const { data: me } = useGetMe();
  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryIsError,
    error: summaryError,
    isFetching: summaryFetching,
    refetch: refetchSummary,
  } = useGetDashboardSummary();
  const {
    data: activity,
    isLoading: activityLoading,
    isError: activityIsError,
    error: activityError,
    isFetching: activityFetching,
    refetch: refetchActivity,
  } = useGetRecentActivity();
  const goalsQuery = useListLearningGoals();

  // A query that failed with nothing cached must not keep rendering skeletons
  // (stats) or an "empty" state (activity) — both read as "you have no data"
  // rather than "we could not load your data".
  const summaryFailed = summaryIsError && summary === undefined;
  const activityFailed = activityIsError && activity === undefined;
  const goalsFailed = goalsQuery.isError && goalsQuery.data === undefined;
  const resumableGoal = selectResumableGoal(goalsQuery.data ?? []);
  const nextStep = resumableGoal ? nextIncompleteStep(resumableGoal) : null;

  const displayUser = me ?? authUser;
  const isTeacher = displayUser?.role === 'teacher';

  const [refreshing, setRefreshing] = React.useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchSummary(), refetchActivity(), goalsQuery.refetch()]);
    setRefreshing(false);
  };

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + webTopPad + 16 },
      ]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {summaryLoading ? (
            <Skeleton width={180} height={28} />
          ) : (
            <Text
              style={[
                styles.greeting,
                { color: colors.foreground, fontFamily: colors.fontFamily.sansBold },
              ]}
              numberOfLines={1}
            >
              {displayUser ? `Hi, ${displayUser.name.split(' ')[0]}` : 'Dashboard'}
            </Text>
          )}
          <Text
            style={[
              styles.greetingSub,
              { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
            ]}
          >
            {isTeacher ? "Here's your classroom overview" : "Here's your learning overview"}
          </Text>
        </View>
      </View>

      {/* The dashboard begins the canonical resource-to-learning journey. These
          actions point to persistent screens rather than one-off local state. */}
      <View
        style={[
          styles.workflowCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderRadius: colors.radius,
          },
        ]}
      >
        <View style={styles.workflowHeading}>
          <View
            style={[
              styles.workflowIcon,
              { backgroundColor: colors.primary + '14', borderRadius: colors.radius },
            ]}
          >
            <Feather name="compass" color={colors.primary} size={20} />
          </View>
          <View style={styles.workflowText}>
            <Text
              style={{ color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }}
            >
              Build your next learning path
            </Text>
            <Text
              style={{ color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }}
            >
              Find a source, check it, then save it in a focused list.
            </Text>
          </View>
        </View>
        <View style={styles.workflowActions}>
          <View style={styles.workflowAction}>
            <Button onPress={() => router.push('/resources')} size="sm">
              Find resources
            </Button>
          </View>
          <View style={styles.workflowAction}>
            <Button onPress={() => router.push('/lists')} size="sm" variant="outline">
              Learning lists
            </Button>
          </View>
          <View style={styles.workflowAction}>
            <Button onPress={() => router.push('/goals')} size="sm" variant="outline">
              Learning paths
            </Button>
          </View>
        </View>
      </View>

      {/* The persistent goal collection closes the loop back to Home. Only a
          goal with unfinished work receives this high-value resume slot. */}
      {goalsQuery.isLoading ? (
        <Skeleton width="100%" height={126} borderRadius={8} />
      ) : goalsFailed ? (
        <ErrorState
          variant="banner"
          error={goalsQuery.error}
          retrying={goalsQuery.isFetching}
          onRetry={() => {
            void goalsQuery.refetch();
          }}
        />
      ) : resumableGoal && nextStep ? (
        <AnimatedPressable
          accessibilityLabel={`Resume ${resumableGoal.title}. Next step: ${nextStep.title}`}
          haptic="selection"
          onPress={() => router.push(`/goals/${resumableGoal.id}`)}
          style={[
            styles.continuationCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.primary,
              borderRadius: colors.radius,
            },
          ]}
        >
          <View style={styles.continuationHeading}>
            <View style={styles.continuationText}>
              <Text style={{ color: colors.primary, fontFamily: colors.fontFamily.sansSemiBold }}>
                Continue learning
              </Text>
              <Text
                numberOfLines={2}
                style={[styles.continuationTitle, { color: colors.foreground, fontFamily: colors.fontFamily.sansBold }]}
              >
                {resumableGoal.title}
              </Text>
            </View>
            <Feather name="arrow-right" color={colors.primary} size={21} />
          </View>
          <Text style={{ color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }}>
            Next: {nextStep.title}
          </Text>
          <ProgressTransition
            value={
              resumableGoal.pathSteps.filter((step) => step.completed).length /
              resumableGoal.pathSteps.length
            }
          />
          <Text style={{ color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }}>
            {progressPercent(
              resumableGoal.pathSteps.filter((step) => step.completed).length /
                resumableGoal.pathSteps.length,
            )}% complete
          </Text>
        </AnimatedPressable>
      ) : null}

      {/* Stat Cards */}
      {summaryFailed ? (
        <ErrorState
          variant="banner"
          error={summaryError}
          retrying={summaryFetching}
          onRetry={() => {
            void refetchSummary();
          }}
          style={{ marginVertical: 8 }}
        />
      ) : null}
      <View style={styles.statsGrid}>
        <StatCard
          label="Classes"
          value={summary?.classCount}
          icon="users"
          color={colors.primary}
          isLoading={summaryLoading}
          isFailed={summaryFailed}
        />
        <StatCard
          label="Resources"
          value={summary?.resourceCount}
          icon="book-open"
          color={colors.accent}
          isLoading={summaryLoading}
          isFailed={summaryFailed}
        />
        <StatCard
          label="Schedule"
          value={summary?.scheduleBlockCount}
          icon="calendar"
          color={colors.chart3}
          isLoading={summaryLoading}
          isFailed={summaryFailed}
        />
        <StatCard
          label={isTeacher ? 'Students' : 'Reviews'}
          value={isTeacher ? summary?.studentCount : summary?.reviewCount}
          icon={isTeacher ? 'user-check' : 'star'}
          color={colors.chart4}
          isLoading={summaryLoading}
          isFailed={summaryFailed}
        />
      </View>

      {/* Recent Activity */}
      <View style={styles.section}>
        <Text
          style={[
            styles.sectionTitle,
            { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold },
          ]}
        >
          Recent Activity
        </Text>

        {activityLoading ? (
          <View style={styles.skeletonStack}>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} width="100%" height={52} style={{ marginBottom: 2 }} />
            ))}
          </View>
        ) : activityFailed ? (
          <ErrorState
            error={activityError}
            retrying={activityFetching}
            onRetry={() => {
              void refetchActivity();
            }}
          />
        ) : !activity?.length ? (
          <Empty
            icon="activity"
            title="No activity yet"
            description="Your recent actions will appear here"
          />
        ) : (
          <View
            style={[
              styles.activityList,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: colors.radius,
              },
            ]}
          >
            {activity.slice(0, 10).map((item) => (
              <ActivityRow key={item.id} item={item} />
            ))}
          </View>
        )}
      </View>

      <View style={{ height: insets.bottom + 80 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 8 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerLeft: { flex: 1, gap: 2 },
  workflowCard: { borderWidth: 1, gap: 14, marginVertical: 8, padding: 14 },
  workflowHeading: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  workflowIcon: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  workflowText: { flex: 1, gap: 3 },
  workflowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  workflowAction: { flexBasis: '47%', flexGrow: 1 },
  continuationCard: { borderWidth: 1, gap: 10, marginVertical: 8, padding: 14 },
  continuationHeading: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  continuationText: { flex: 1, gap: 3 },
  continuationTitle: { fontSize: 18, lineHeight: 23 },
  greeting: { fontSize: 26, letterSpacing: -0.5 },
  greetingSub: { fontSize: 13 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginVertical: 8,
  },
  statCard: {
    width: '47.5%',
    borderWidth: 1,
    padding: 16,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  statIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: { fontSize: 28, letterSpacing: -1 },
  statLabel: { fontSize: 12 },
  section: { marginTop: 8 },
  sectionTitle: { fontSize: 16, marginBottom: 10 },
  skeletonStack: { gap: 2 },
  activityList: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  activityIcon: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  activityMsg: { flex: 1, fontSize: 13, lineHeight: 18 },
  activityTime: { fontSize: 11, flexShrink: 0 },
});
