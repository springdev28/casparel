/**
 * @fileOverview Mobile workflow role: resumes a learning path and persists step completion.
 * System connection: reads and updates generated learning-goal state, opens linked resources, and drives accessible progress feedback.
 */
import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Button } from '@workspace/edu-ds/components/native/button';
import { Empty } from '@workspace/edu-ds/components/native/empty';
import { Skeleton } from '@workspace/edu-ds/components/native/skeleton';
import {
  getListLearningGoalsQueryKey,
  useListLearningEvidence,
  useListLearningGoals,
  useUpdateLearningGoal,
  type LearningGoal,
  type LearningPathStep,
} from '@workspace/api-client-react';
import { ErrorState } from '@/components/ErrorState';
import { ProgressTransition } from '@/components/ProgressTransition';
import { triggerHaptic } from '@/utils/haptics';
import { progressPercent } from '@/utils/progress';

function StepCard({
  busy,
  evidenceCount,
  onOpen,
  onStudy,
  onToggle,
  position,
  step,
}: {
  busy: boolean;
  evidenceCount: number;
  onOpen: (() => void) | null;
  onStudy: () => void;
  onToggle: () => void;
  position: number;
  step: LearningPathStep;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.step,
        {
          backgroundColor: step.completed ? colors.primary + '0D' : colors.card,
          borderColor: step.completed ? colors.primary : colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      <View style={styles.stepHeading}>
        <View
          style={[
            styles.stepNumber,
            { backgroundColor: step.completed ? colors.primary : colors.muted, borderRadius: 999 },
          ]}
        >
          {step.completed ? (
            <Feather name="check" color={colors.primaryForeground} size={17} />
          ) : (
            <Text style={{ color: colors.foreground, fontFamily: colors.fontFamily.sansBold }}>
              {position}
            </Text>
          )}
        </View>
        <View style={styles.stepText}>
          <Text
            style={[
              styles.stepTitle,
              { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold },
            ]}
          >
            {step.title}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }}>
            {step.completed ? 'Completed' : 'Ready to study'}
          </Text>
          {evidenceCount > 0 ? (
            <Text style={{ color: colors.primary, fontFamily: colors.fontFamily.sansSemiBold }}>
              {evidenceCount} {evidenceCount === 1 ? 'evidence check-in' : 'evidence check-ins'}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.stepActions}>
        {/* Focused study is the evidence-producing primary action. Direct
            completion remains available for work completed elsewhere. */}
        <View style={styles.stepAction}>
          <Button disabled={busy} onPress={onStudy} size="sm">
            Study this step
          </Button>
        </View>
        {onOpen ? (
          <View style={styles.stepAction}>
            <Button disabled={busy} onPress={onOpen} size="sm" variant="outline">
              Open resource
            </Button>
          </View>
        ) : null}
        <View style={styles.stepAction}>
          <Button loading={busy} onPress={onToggle} size="sm" variant="outline">
            {step.completed ? 'Mark unfinished' : 'Mark complete'}
          </Button>
        </View>
      </View>
    </View>
  );
}

export default function LearningPathDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const goalId = Number(id);
  const validGoalId = Number.isSafeInteger(goalId) && goalId > 0;
  const query = useListLearningGoals();
  const evidenceQuery = useListLearningEvidence();
  const updateGoal = useUpdateLearningGoal();
  const goal = query.data?.find((item) => item.id === goalId) ?? null;
  const failed = query.isError && query.data === undefined;
  const [refreshing, setRefreshing] = React.useState(false);
  const [updatingStepId, setUpdatingStepId] = React.useState<string | null>(null);
  const [writeError, setWriteError] = React.useState('');

  async function refresh() {
    setRefreshing(true);
    await Promise.all([query.refetch(), evidenceQuery.refetch()]);
    setRefreshing(false);
  }

  async function toggleStep(currentGoal: LearningGoal, stepId: string) {
    const nextSteps = currentGoal.pathSteps.map((step) =>
      step.id === stepId ? { ...step, completed: !step.completed } : step,
    );
    const completed = nextSteps.every((step) => step.completed);
    setUpdatingStepId(stepId);
    setWriteError('');
    try {
      const updated = await updateGoal.mutateAsync({
        id: currentGoal.id,
        data: { pathSteps: nextSteps, status: completed ? 'completed' : 'active' },
      });
      // Update immediately for continuity, then reconcile with the server.
      queryClient.setQueryData<LearningGoal[]>(getListLearningGoalsQueryKey(), (goals) =>
        goals?.map((item) => (item.id === updated.id ? updated : item)),
      );
      await queryClient.invalidateQueries({ queryKey: getListLearningGoalsQueryKey() });
      await triggerHaptic(completed ? 'success' : 'selection');
    } catch (error) {
      setWriteError(
        error instanceof Error && error.message
          ? error.message
          : 'Progress could not be saved. Please try again.',
      );
      void triggerHaptic('error');
    } finally {
      setUpdatingStepId(null);
    }
  }

  if (!validGoalId) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Empty icon="alert-circle" title="Invalid learning-path link" />
      </View>
    );
  }

  if (query.isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <Skeleton width="74%" height={28} />
        <Skeleton width="100%" height={8} borderRadius={999} />
        <Skeleton width="100%" height={126} borderRadius={8} />
      </View>
    );
  }

  if (failed) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ErrorState
          error={query.error}
          retrying={query.isFetching}
          onRetry={() => {
            void query.refetch();
          }}
        />
      </View>
    );
  }

  if (!goal) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Empty icon="alert-circle" title="Learning path not found" />
      </View>
    );
  }

  const completedSteps = goal.pathSteps.filter((step) => step.completed).length;
  const progress = goal.pathSteps.length ? completedSteps / goal.pathSteps.length : 0;

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      showsVerticalScrollIndicator={false}
      style={{ backgroundColor: colors.background }}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: colors.fontFamily.sansBold }]}>
          {goal.title}
        </Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }}>
          {goal.subject} · {goal.level}
        </Text>
        <ProgressTransition value={progress} />
        <Text style={{ color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }}>
          {completedSteps} of {goal.pathSteps.length} steps · {progressPercent(progress)}%
        </Text>
      </View>

      {writeError ? (
        <View
          accessibilityRole="alert"
          style={[
            styles.writeError,
            {
              backgroundColor: colors.destructive + '12',
              borderColor: colors.destructive,
              borderRadius: colors.radius,
            },
          ]}
        >
          <Feather name="alert-circle" color={colors.destructiveText} size={16} />
          <Text style={{ color: colors.destructiveText, flex: 1, fontFamily: colors.fontFamily.sans }}>
            {writeError}
          </Text>
        </View>
      ) : null}

      {evidenceQuery.isError && evidenceQuery.data === undefined ? (
        <ErrorState
          variant="banner"
          error={evidenceQuery.error}
          retrying={evidenceQuery.isFetching}
          onRetry={() => {
            void evidenceQuery.refetch();
          }}
        />
      ) : null}

      {goal.pathSteps.length === 0 ? (
        <Empty icon="map" title="This path has no steps" />
      ) : (
        <View style={styles.steps}>
          {goal.pathSteps.map((step, index) => (
            <StepCard
              busy={updateGoal.isPending && updatingStepId === step.id}
              evidenceCount={(evidenceQuery.data ?? []).filter(
                (item) => item.learningGoalId === goal.id && item.pathStepId === step.id,
              ).length}
              key={step.id}
              onOpen={step.resourceId ? () => router.push(`/resource/${step.resourceId}`) : null}
              onStudy={() => router.push(`/goals/${goal.id}/study/${encodeURIComponent(step.id)}`)}
              onToggle={() => {
                void toggleStep(goal, step.id);
              }}
              position={index + 1}
              step={step}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center' },
  loading: { flex: 1, gap: 14, padding: 16 },
  content: { gap: 18, padding: 16 },
  header: { gap: 8 },
  title: { fontSize: 24, letterSpacing: -0.4 },
  steps: { gap: 10 },
  step: { borderWidth: 1, gap: 13, padding: 14 },
  stepHeading: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  stepNumber: { alignItems: 'center', height: 34, justifyContent: 'center', width: 34 },
  stepText: { flex: 1, gap: 3 },
  stepTitle: { fontSize: 15, lineHeight: 20 },
  stepActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stepAction: { flexBasis: '46%', flexGrow: 1 },
  writeError: { alignItems: 'flex-start', borderWidth: 1, flexDirection: 'row', gap: 8, padding: 10 },
});
