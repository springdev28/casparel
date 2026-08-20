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
} from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { ErrorState } from '@/components/ErrorState';
import { DueWork } from '@/components/DueWork';
import { StudySets } from '@/components/StudySets';
import { MessagesButton } from '@/components/MessagesButton';
import type { ActivityItem } from '@workspace/api-client-react';
import { TAB_BAR_CLEARANCE } from '@/utils/tab-bar';
import { useLanguage } from '@/contexts/LanguageContext';

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
  const { intlLocale } = useLanguage();
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
  const timeStr = date.toLocaleDateString(intlLocale, { month: 'short', day: 'numeric' });

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
  const { t, intlLocale } = useLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
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

  // A query that failed with nothing cached must not keep rendering skeletons
  // (stats) or an "empty" state (activity) — both read as "you have no data"
  // rather than "we could not load your data".
  const summaryFailed = summaryIsError && summary === undefined;
  const activityFailed = activityIsError && activity === undefined;

  const displayUser = me ?? authUser;
  const isTeacher = displayUser?.role === 'teacher';

  const [refreshing, setRefreshing] = React.useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchSummary(), refetchActivity()]);
    setRefreshing(false);
  };

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + webTopPad + 16,
          // Nothing reserved space for the floating tab bar here at all, so
          // the last rows of Recent Activity sat under it.
          paddingBottom: insets.bottom + TAB_BAR_CLEARANCE,
        },
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
              {/* Greeting and name, kept apart: "Hi, Ada" as one string can
                  never be a dictionary key, and the greeting is the half that
                  needs translating. */}
              {displayUser
                ? `${t('Hi')}, ${displayUser.name.split(' ')[0]}`
                : t('Dashboard')}
            </Text>
          )}
          <Text
            style={[
              styles.greetingSub,
              { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
            ]}
          >
            {isTeacher ? t("Here's your classroom overview") : t("Here's your learning overview")}
          </Text>
        </View>
        <MessagesButton />
      </View>

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
          label={t('Classes')}
          value={summary?.classCount}
          icon="users"
          color={colors.primary}
          isLoading={summaryLoading}
          isFailed={summaryFailed}
        />
        <StatCard
          label={t('Resources')}
          value={summary?.resourceCount}
          icon="book-open"
          color={colors.accent}
          isLoading={summaryLoading}
          isFailed={summaryFailed}
        />
        <StatCard
          label={t('Schedule')}
          value={summary?.scheduleBlockCount}
          icon="calendar"
          color={colors.chart3}
          isLoading={summaryLoading}
          isFailed={summaryFailed}
        />
        <StatCard
          label={isTeacher ? t('Students') : t('Reviews')}
          value={isTeacher ? summary?.studentCount : summary?.reviewCount}
          icon={isTeacher ? 'user-check' : 'star'}
          color={colors.chart4}
          isLoading={summaryLoading}
          isFailed={summaryFailed}
        />
      </View>

      {/* What somebody else set, before what you set yourself */}
      <DueWork />

      {/* Study sets, one tap from studying them */}
      <StudySets />

      {/* Recent Activity */}
      <View style={styles.section}>
        <Text
          style={[
            styles.sectionTitle,
            { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold },
          ]}
        >
          {t('Recent Activity')}
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
            title={t('No activity yet')}
            description={t("Your recent actions will appear here")}
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
