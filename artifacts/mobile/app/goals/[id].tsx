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
 * Finishing one asks how it went. Three answers -- the same three the web
 * dashboard has always asked -- and skipping is one of them: somebody ticking
 * a box on a bus should not have to say, and a number recorded on their behalf
 * would reach a teacher's dashboard as something they said. What comes back is
 * the completion screen: what was recorded, where the goal stands, and the next
 * step.
 *
 * Unticking is still one tap and asks nothing.
 *
 * The write moves one step rather than sending the whole path back. This
 * screen used to PATCH the entire pathSteps array, which is a lost update
 * waiting to happen: a tick here and a resource attached on the laptop, and
 * whichever landed second erased the other.
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
  useCompleteGoalStep,
  useListLearningEvidence,
  useListLearningGoals,
} from '@workspace/api-client-react';
import type { LearningGoal, LearningPathStep } from '@workspace/api-client-react';
import { ErrorState } from '@/components/ErrorState';
import { StepCheckInSheet, type StepOutcome } from '@/components/StepCheckInSheet';
import { describeApiFailure } from '@/utils/api-failure';
import { useLanguage } from '@/contexts/LanguageContext';
import { useMotion } from '@/contexts/MotionContext';
import { GoalProgress, goalProgress } from '@/components/GoalProgress';
import { goalStatusLabel, levelLabel } from '@/utils/labels';

function Step({
  step,
  busy,
  checkedIn,
  onToggle,
  onOpenResource,
}: {
  step: LearningPathStep;
  busy: boolean;
  checkedIn: boolean;
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
          {step.resourceId || checkedIn ? (
            <Text style={[styles.stepMeta, { color: colors.mutedForeground }]}>
              {[step.resourceId ? t('Saved resource') : null, checkedIn ? t('Checked in') : null]
                .filter(Boolean)
                .join(' · ')}
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
  const { selection, success, warning } = useMotion();
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
  /*
   * Which steps carry a check-in, so a learner coming back sees what they
   * said rather than only what they ticked. One request for the goal's own
   * evidence; a failure here leaves the marks off and the screen alone.
   */
  const evidence = useListLearningEvidence();
  const checkedInSteps = React.useMemo(
    () =>
      new Set(
        (evidence.data ?? [])
          .filter((row) => row.learningGoalId === goalId && row.pathStepId)
          .map((row) => row.pathStepId as string),
      ),
    [evidence.data, goalId],
  );
  const [checkingIn, setCheckingIn] = React.useState<LearningPathStep | null>(null);
  const [outcome, setOutcome] = React.useState<StepOutcome | null>(null);
  const [checkInFailure, setCheckInFailure] = React.useState<string | null>(null);
  const complete = useCompleteGoalStep();

  /**
   * Mark one step done or not done.
   *
   * Optimistic in the cache and reconciled from what the server returns. The
   * check-in, when there is one, rides along with the same write: the sheet is
   * the only place it is asked for, so a failed answer is a failed tick and
   * both go back together.
   */
  async function setCompleted(
    step: LearningPathStep,
    completed: boolean,
    checkIn: { confidence: number; understanding: number; reflection: string } | null,
  ) {
    if (!goal || busyStep) return;
    setBusyStep(step.id);
    setWriteError(null);
    setCheckInFailure(null);
    const key = getListLearningGoalsQueryKey();
    const previous = queryClient.getQueryData<LearningGoal[]>(key);

    // Move the tick now; put it back if the server disagrees.
    queryClient.setQueryData<LearningGoal[]>(key, (current) =>
      (current ?? []).map((candidate) =>
        candidate.id === goal.id
          ? {
              ...candidate,
              pathSteps: candidate.pathSteps.map((one) =>
                one.id === step.id ? { ...one, completed } : one,
              ),
            }
          : candidate,
      ),
    );

    try {
      const result = await complete.mutateAsync({
        id: goal.id,
        stepId: step.id,
        data: { completed, ...(checkIn ?? {}) },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: key }),
        // A check-in has just been written, so the marks are out of date.
        evidence.refetch(),
      ]);
      if (completed) {
        const total = result.goal.pathSteps.length;
        const done = result.goal.pathSteps.filter((one) => one.completed).length;
        setOutcome({
          recorded: result.evidence !== null,
          nextStep: result.nextStep ?? null,
          done,
          total,
        });
        // The one moment on this screen worth a flourish, and only this one.
        if (done === total) success();
        else selection();
      }
    } catch (failure) {
      if (previous) queryClient.setQueryData(key, previous);
      warning();
      const said = describeApiFailure(failure, t('That step could not be saved.'), t);
      if (completed) setCheckInFailure(said);
      else setWriteError(said);
    } finally {
      setBusyStep(null);
    }
  }

  /** Unticking asks nothing; finishing opens the check-in. */
  function toggle(step: LearningPathStep) {
    if (step.completed) {
      void setCompleted(step, false, null);
      return;
    }
    setOutcome(null);
    setCheckInFailure(null);
    setCheckingIn(step);
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

      {/* Where the path came from, when it came from somewhere. The id is
          nulled when the list is deleted, so this disappears with it rather
          than offering a link to nothing. */}
      {goal.sourceListId ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Open the list this path came from')}
          onPress={() => router.push(`/lists/${goal.sourceListId}`)}
          style={({ pressed }) => [styles.provenance, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Feather name="bookmark" size={14} color={colors.primary} />
          <Text
            style={[
              styles.provenanceText,
              { color: colors.primary, fontFamily: colors.fontFamily.sansSemiBold },
            ]}
          >
            {t('Built from a learning list')}
          </Text>
        </Pressable>
      ) : null}

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
              checkedIn={checkedInSteps.has(step.id)}
              onToggle={() => {
                toggle(step);
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

      <StepCheckInSheet
        visible={checkingIn !== null}
        step={checkingIn}
        outcome={outcome}
        saving={busyStep !== null}
        failure={checkInFailure}
        onAnswer={(answer) => {
          if (checkingIn) void setCompleted(checkingIn, true, answer);
        }}
        onOpenNext={(next) => {
          setCheckingIn(null);
          setOutcome(null);
          if (next.resourceId) router.push(`/resource/${next.resourceId}`);
        }}
        onClose={() => {
          setCheckingIn(null);
          setOutcome(null);
        }}
      />

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
  provenance: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
  provenanceText: { fontSize: 13 },
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
