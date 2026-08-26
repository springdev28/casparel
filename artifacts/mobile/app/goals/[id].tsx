/**
 * @fileOverview Mobile screen role: defines the Expo Router Id screen or route layout.
 * System connection: composed by Expo Router and backed by auth, onboarding, purchases, secure storage, and the shared API.
 */
/**
 * One goal, and the path through it.
 *
 * Ticking a step off is the only thing this screen writes, and it is the
 * thing worth having on a phone: you finish a chapter on the bus and you mark
 * it there, rather than remembering to do it next time you open a laptop.
 * Everything else about a goal -- renaming it, adding steps, changing the
 * target date -- stays on the web, where there is room for it.
 *
 * A step can carry the resource it is about, attached from the save sheet. That
 * step gets a second control, because the two things somebody wants from it are
 * different actions: open what I am meant to study, and say that I have. The id
 * is a plain number in a jsonb document rather than a foreign key, so the
 * resource behind it may have gone; the resource screen answers that case, and
 * this screen does not pretend to know in advance.
 *
 * The write is optimistic. A checkbox that waits for a round-trip before it
 * moves feels broken on a slow connection, and the failure is recoverable:
 * the tick goes back and the screen says so. The PATCH sends the whole
 * pathSteps array because that is what the endpoint takes, so the array sent
 * is built from the list the server last gave us rather than from anything
 * this screen has been holding.
 */
import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Badge } from '@workspace/edu-ds/components/native/badge';
import { Skeleton } from '@workspace/edu-ds/components/native/skeleton';
import { Empty } from '@workspace/edu-ds/components/native/empty';
import {
  getListLearningGoalsQueryKey,
  useListLearningGoals,
  useUpdateLearningGoal,
} from '@workspace/api-client-react';
import type { LearningGoal, LearningPathStep } from '@workspace/api-client-react';
import { ErrorState } from '@/components/ErrorState';
import { describeApiFailure } from '@/utils/api-failure';
import { useLanguage } from '@/contexts/LanguageContext';
import { GoalProgress, goalProgress } from '@/components/GoalProgress';
import { goalStatusLabel, levelLabel } from '@/utils/labels';

function Step({
  step,
  busy,
  onToggle,
  onOpenResource,
}: {
  step: LearningPathStep;
  busy: boolean;
  onToggle: () => void;
  onOpenResource: () => void;
}) {
  const colors = useColors();
  const { t } = useLanguage();
  return (
    <View
      style={[
        styles.step,
        {
          backgroundColor: colors.card,
          borderColor: step.completed ? colors.successText : colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      {/*
        The tick and the open control are siblings rather than one inside the
        other. A Pressable is an accessibility container, and a control nested
        in one is not reliably reachable by VoiceOver -- so the button that
        opens the resource would have been invisible to exactly the readers who
        most need it named.
      */}
      <Pressable
        onPress={onToggle}
        disabled={busy}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: step.completed, disabled: busy }}
        // The step's own words are the label; whether it is done is the state,
        // which is what accessibilityState is for. Saying "Completed: …" in the
        // label would announce it twice and disagree with itself mid-write.
        accessibilityLabel={step.title}
        accessibilityHint={step.completed ? t('Mark as not done') : t('Mark as done')}
        style={({ pressed }) => [styles.stepMain, { opacity: pressed || busy ? 0.7 : 1 }]}
      >
        <View
          style={[
            styles.box,
            {
              borderColor: step.completed ? colors.successText : colors.border,
              backgroundColor: step.completed ? colors.successText : 'transparent',
              borderRadius: 6,
            },
          ]}
        >
          {step.completed ? (
            <Feather name="check" size={14} color={colors.background} />
          ) : null}
        </View>
        <View style={styles.stepText}>
          <Text
            style={[
              styles.stepTitle,
              {
                color: step.completed ? colors.mutedForeground : colors.foreground,
                fontFamily: colors.fontFamily.sans,
                textDecorationLine: step.completed ? 'line-through' : 'none',
              },
            ]}
          >
            {step.title}
          </Text>
          {step.resourceId ? (
            <Text style={[styles.stepMeta, { color: colors.mutedForeground }]}>
              {t('Saved resource')}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {busy ? <ActivityIndicator size="small" color={colors.mutedForeground} /> : null}
      {step.resourceId ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('Open')} ${step.title}`}
          onPress={onOpenResource}
          hitSlop={8}
          style={({ pressed }) => [
            styles.openResource,
            {
              borderColor: colors.border,
              backgroundColor: pressed ? colors.muted : 'transparent',
              borderRadius: colors.radius,
            },
          ]}
        >
          <Feather name="external-link" size={16} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export default function GoalScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const goalId = Number(id);

  /*
   * The list, not a by-id endpoint: there isn't one. It also means opening a
   * goal that belongs to another account is "not found" here rather than a
   * 403 from somewhere deeper.
   */
  const { data, isLoading, isError, error, isFetching, refetch } =
    useListLearningGoals();
  const goal: LearningGoal | undefined = (data ?? []).find(
    (candidate) => candidate.id === goalId,
  );

  const [busyStep, setBusyStep] = React.useState<string | null>(null);
  const [writeError, setWriteError] = React.useState<string | null>(null);
  const update = useUpdateLearningGoal();

  async function toggle(step: LearningPathStep) {
    if (!goal || busyStep) return;
    setBusyStep(step.id);
    setWriteError(null);
    const key = getListLearningGoalsQueryKey();
    const previous = queryClient.getQueryData<LearningGoal[]>(key);
    const pathSteps = goal.pathSteps.map((candidate) =>
      candidate.id === step.id
        ? { ...candidate, completed: !candidate.completed }
        : candidate,
    );

    // Move the tick now; put it back if the server disagrees.
    queryClient.setQueryData<LearningGoal[]>(key, (current) =>
      (current ?? []).map((candidate) =>
        candidate.id === goal.id ? { ...candidate, pathSteps } : candidate,
      ),
    );

    try {
      await update.mutateAsync({ id: goal.id, data: { pathSteps } });
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (failure) {
      if (previous) queryClient.setQueryData(key, previous);
      setWriteError(
        describeApiFailure(failure, t('That step could not be saved.'), t),
      );
    } finally {
      setBusyStep(null);
    }
  }

  if (isLoading) {
    return (
      <View style={[styles.flex, styles.padded, { backgroundColor: colors.background }]}>
        <Skeleton width="70%" height={24} />
        <Skeleton width="40%" height={16} />
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} width="100%" height={52} borderRadius={12} />
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

  if (!goal) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <Empty
          icon="target"
          title={t('Goal not found')}
          description={t('It may have been deleted, or it belongs to another account.')}
        />
      </View>
    );
  }

  const { done, total } = goalProgress(goal);

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.padded,
        {
          paddingBottom: insets.bottom + 24,
          ...(Platform.OS === 'web' ? { paddingTop: 16 } : {}),
        },
      ]}
    >
      <Text
        style={[
          styles.title,
          { color: colors.foreground, fontFamily: colors.fontFamily.sansBold },
        ]}
      >
        {goal.title}
      </Text>

      <View style={styles.badges}>
        <Badge variant="secondary">{goal.subject}</Badge>
        <Badge variant="outline">{levelLabel(goal.level, t)}</Badge>
        <Badge variant="outline">{goalStatusLabel(goal.status, t)}</Badge>
      </View>

      {goal.description ? (
        <Text
          style={[
            styles.description,
            { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
          ]}
        >
          {goal.description}
        </Text>
      ) : null}

      <GoalProgress goal={goal} />

      {total === 0 ? (
        <Empty
          icon="list"
          title={t('This goal has no steps yet')}
          description={t('Build a path for it on the web and tick the steps off here.')}
        />
      ) : (
        <View style={styles.steps}>
          {goal.pathSteps.map((step) => (
            <Step
              key={step.id}
              step={step}
              busy={busyStep === step.id}
              onToggle={() => {
                void toggle(step);
              }}
              onOpenResource={() => {
                if (step.resourceId) router.push(`/resource/${step.resourceId}`);
              }}
            />
          ))}
        </View>
      )}

      {done === total && total > 0 ? (
        <Text
          style={[
            styles.note,
            { color: colors.successText, fontFamily: colors.fontFamily.sansMedium },
          ]}
        >
          {t('Every step is done.')}
        </Text>
      ) : null}

      {writeError ? (
        <Text
          style={[
            styles.note,
            { color: colors.destructiveText, fontFamily: colors.fontFamily.sans },
          ]}
        >
          {writeError}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  padded: { padding: 16, gap: 14 },
  title: { fontSize: 22, letterSpacing: -0.3 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  description: { fontSize: 14, lineHeight: 20 },
  steps: { gap: 8 },
  step: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    // Above the 44pt touch target both stores ask for.
    minHeight: 52,
    paddingVertical: 10,
  },
  stepMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  box: {
    width: 22,
    height: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { flex: 1, gap: 2 },
  stepTitle: { fontSize: 15, lineHeight: 20 },
  stepMeta: { fontSize: 12 },
  openResource: {
    // Small beside the step, and still the 44pt both stores ask for once the
    // hit slop above is counted.
    width: 32,
    height: 32,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { fontSize: 13, textAlign: 'center' },
});
