/**
 * @fileOverview Mobile UI role: provides the reusable Goals Summary component.
 * System connection: composed by Expo Router screens and aligned with shared API/auth/purchase state where required.
 */
/**
 * The goals you are part-way through, on the first screen after sign-in.
 *
 * A section rather than a sixth tab, for the same reason study sets are one:
 * iOS collapses a tab bar of six into five and a "More" list, which buries
 * whatever loses. This is more prominent on the dashboard than it would be
 * behind "More" anyway.
 *
 * Only what is unfinished, and only the two nearest to done. A goals list is
 * the whole point of the goals screen; what belongs on a dashboard is the
 * nudge -- the thing with two steps left that you could finish today. The
 * "See all" row goes to the rest.
 *
 * A failure here is deliberately quiet. The dashboard is a composition of
 * panels and this one is not the reason anybody opened it, so a section that
 * cannot load says so in its own box and leaves the rest of the screen alone.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Skeleton } from '@workspace/edu-ds/components/native/skeleton';
import { useListLearningGoals } from '@workspace/api-client-react';
import type { LearningGoal } from '@workspace/api-client-react';
import { ErrorState } from '@/components/ErrorState';
import { useLanguage } from '@/contexts/LanguageContext';
import { GoalProgress, goalProgress } from '@/components/GoalProgress';

/** How many the dashboard shows before it points at the full list. */
const SHOWN = 2;

/**
 * Unfinished, nearest to done first.
 *
 * "Nearest to done" is the fraction, not the count: two steps left out of
 * three is closer than two out of twenty, and the one you can finish today is
 * the one worth putting in front of somebody.
 */
function nearestToDone(goals: LearningGoal[]) {
  return goals
    .filter((goal) => {
      if (goal.status !== 'active') return false;
      const { done, total } = goalProgress(goal);
      return total > 0 && done < total;
    })
    .sort((a, b) => {
      const left = goalProgress(a);
      const right = goalProgress(b);
      return right.done / right.total - left.done / left.total;
    });
}

export function GoalsSummary() {
  const colors = useColors();
  const router = useRouter();
  const { t } = useLanguage();
  const { data, isLoading, isError, error, isFetching, refetch } =
    useListLearningGoals();

  const inFlight = React.useMemo(() => nearestToDone(data ?? []), [data]);

  // Nothing part-way through is not an empty state worth a box on the
  // dashboard: somebody with no goals, or with every goal finished, is better
  // served by the space going to the panels that do have something to say.
  if (!isLoading && !isError && inFlight.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text
          style={[
            styles.sectionTitle,
            { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold },
          ]}
        >
          {t('Keep going')}
        </Text>
        <Pressable
          onPress={() => router.push('/goals')}
          accessibilityRole="button"
          accessibilityLabel={t('See all learning goals')}
          hitSlop={8}
        >
          <Text
            style={[
              styles.seeAll,
              { color: colors.primary, fontFamily: colors.fontFamily.sansMedium },
            ]}
          >
            {t('See all')}
          </Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.stack}>
          {[1, 2].map((i) => (
            <Skeleton key={i} width="100%" height={64} borderRadius={12} />
          ))}
        </View>
      ) : isError && data === undefined ? (
        <ErrorState
          error={error}
          retrying={isFetching}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : (
        <View style={styles.stack}>
          {inFlight.slice(0, SHOWN).map((goal) => {
            const { done, total } = goalProgress(goal);
            return (
              <Pressable
                key={goal.id}
                onPress={() => router.push(`/goals/${goal.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`${goal.title}, ${done} / ${total} ${t('steps done')}`}
                style={({ pressed }) => [
                  styles.card,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    borderRadius: colors.radius,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <View style={styles.cardHead}>
                  <Feather name="target" size={15} color={colors.primary} />
                  <Text
                    style={[
                      styles.cardTitle,
                      {
                        color: colors.foreground,
                        fontFamily: colors.fontFamily.sansMedium,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {goal.title}
                  </Text>
                </View>
                <GoalProgress goal={goal} />
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 17, letterSpacing: -0.2 },
  seeAll: { fontSize: 13 },
  stack: { gap: 8 },
  card: { borderWidth: 1, padding: 12, gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontSize: 15 },
});
