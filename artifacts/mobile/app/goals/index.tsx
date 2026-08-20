/**
 * What you are trying to learn, and how far along you are.
 *
 * A goal in Casparel is not a to-do: it carries a subject, a level, and a
 * path of ordered steps you tick off as you go. That is the product's account
 * of somebody's progress, and until now it lived only on the web -- so the
 * device people actually study on could show them a class, a resource and a
 * study set, but not the thing all three were for.
 *
 * The endpoints were already described (`/learning-goals`), so this is a
 * screen rather than an integration.
 *
 * Ordered active first, then paused, then completed, and within each by how
 * recently they moved. A finished goal is worth keeping -- it is the evidence
 * you finished something -- but it is not what you opened this screen to see.
 */
import React from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Skeleton } from '@workspace/edu-ds/components/native/skeleton';
import { Empty } from '@workspace/edu-ds/components/native/empty';
import { useListLearningGoals } from '@workspace/api-client-react';
import type { LearningGoal } from '@workspace/api-client-react';
import { ErrorState } from '@/components/ErrorState';
import { useLanguage } from '@/contexts/LanguageContext';
import { GoalProgress, goalProgress } from '@/components/GoalProgress';
import { goalStatusLabel } from '@/utils/labels';

/** Active before paused before completed; newest movement first inside each. */
const STATUS_ORDER: Record<string, number> = {
  active: 0,
  paused: 1,
  completed: 2,
};

function byUrgency(a: LearningGoal, b: LearningGoal) {
  const byStatus =
    (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
  if (byStatus !== 0) return byStatus;
  return String(b.updatedAt).localeCompare(String(a.updatedAt));
}

function GoalRow({ goal, onPress }: { goal: LearningGoal; onPress: () => void }) {
  const colors = useColors();
  const { t } = useLanguage();
  const { done, total } = goalProgress(goal);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      /*
       * Named by the goal, then how far through it is. A list of these
       * announced as "button" four times tells a screen-reader reader nothing
       * about which one they are on, and the fraction is the one fact worth
       * hearing without opening it. The title is the reader's own words, so
       * only the surrounding phrase is translated.
       */
      accessibilityLabel={`${goal.title}, ${done} / ${total} ${t('steps done')}`}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <View style={styles.rowHead}>
        <Text
          style={[
            styles.rowTitle,
            { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold },
          ]}
          numberOfLines={2}
        >
          {goal.title}
        </Text>
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      </View>

      <Text
        style={[
          styles.rowMeta,
          { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
        ]}
        numberOfLines={1}
      >
        {/* Subject is the reader's own text; the status beside it is ours. */}
        {goal.subject}
        {'  ·  '}
        {goalStatusLabel(goal.status, t)}
      </Text>

      <GoalProgress goal={goal} />
    </Pressable>
  );
}

export default function GoalsScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { data, isLoading, isError, error, isFetching, refetch } =
    useListLearningGoals();

  const goals = React.useMemo(
    () => [...(data ?? [])].sort(byUrgency),
    [data],
  );

  if (isLoading) {
    return (
      <View style={[styles.flex, styles.padded, { backgroundColor: colors.background }]}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} width="100%" height={96} borderRadius={12} />
        ))}
      </View>
    );
  }

  if (isError && data === undefined) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <ErrorState
          error={error}
          retrying={isFetching}
          onRetry={() => {
            void refetch();
          }}
          style={{ paddingTop: 24 }}
        />
      </View>
    );
  }

  return (
    <FlatList
      style={[styles.flex, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.padded,
        { paddingBottom: insets.bottom + 24 },
      ]}
      data={goals}
      keyExtractor={(goal) => String(goal.id)}
      renderItem={({ item }) => (
        <GoalRow goal={item} onPress={() => router.push(`/goals/${item.id}`)} />
      )}
      refreshControl={
        <RefreshControl
          refreshing={isFetching && !isLoading}
          onRefresh={() => {
            void refetch();
          }}
          tintColor={colors.mutedForeground}
        />
      }
      ListEmptyComponent={
        <Empty
          icon="target"
          title={t('No learning goals yet')}
          description={t('Set a goal on the web and track it from here.')}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  padded: { padding: 16, gap: 12 },
  row: { borderWidth: 1, padding: 14, gap: 8 },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  rowTitle: { flex: 1, fontSize: 16, letterSpacing: -0.2 },
  rowMeta: { fontSize: 12 },
});
