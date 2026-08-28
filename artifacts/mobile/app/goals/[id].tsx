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
  TextInput,
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
  getGetGoalListDriftQueryKey,
  getGetStepActivityQueryKey,
  getListLearningEvidenceQueryKey,
  getListLearningGoalsQueryKey,
  useAddGoalStep,
  useAddStepsFromList,
  useCompleteGoalStep,
  useDeleteGoalStep,
  useRenameGoalStep,
  useReorderGoalSteps,
  useGetGoalListDrift,
  useGetStepActivity,
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
import { describeActivity } from '@/utils/step-activity';
import { moveItem } from '@/utils/reorder';

function Step({
  step,
  index,
  total,
  busy,
  checkedIn,
  editing,
  onToggle,
  onOpenResource,
  onRename,
  onMove,
  onRemove,
}: {
  step: LearningPathStep;
  index: number;
  total: number;
  busy: boolean;
  checkedIn: boolean;
  editing: boolean;
  onToggle: () => void;
  onOpenResource: () => void;
  onRename: (title: string) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const colors = useColors();
  const { t } = useLanguage();

  /*
   * Editing is a mode rather than a control on every row. Studying is what
   * this screen is for, and a tick, an open, a rename field and three
   * rearranging buttons on every step is a screen somebody has to read past
   * to find the one thing they came to do.
   */
  if (editing) {
    return (
      <View
        style={[
          styles.step,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderRadius: colors.radius,
            opacity: busy ? 0.6 : 1,
          },
        ]}
      >
        <TextInput
          // Keyed on the title so a rename made elsewhere reaches the field:
          // defaultValue is read once, and without this the box would keep
          // showing what it was opened with.
          key={`${step.id}:${step.title}`}
          defaultValue={step.title}
          editable={!busy}
          accessibilityLabel={`${t('Rename')}: ${step.title}`}
          // onEndEditing rather than onBlur: React Native's blur event carries
          // no text, and reading the field would mean holding a draft in state
          // that a rename arriving from another device could not correct.
          onEndEditing={(event) => {
            const title = event.nativeEvent.text.trim();
            if (title && title !== step.title) onRename(title);
          }}
          style={[
            styles.stepInput,
            {
              color: colors.foreground,
              borderColor: colors.border,
              borderRadius: colors.radius,
              fontFamily: colors.fontFamily.sans,
            },
          ]}
        />
        <View style={styles.stepControls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('Move up')}: ${step.title}`}
            accessibilityState={{ disabled: busy || index === 0 }}
            disabled={busy || index === 0}
            hitSlop={6}
            onPress={() => onMove(-1)}
            style={({ pressed }) => [
              styles.control,
              {
                borderColor: colors.border,
                borderRadius: colors.radius,
                backgroundColor: pressed ? colors.muted : 'transparent',
                opacity: index === 0 ? 0.35 : 1,
              },
            ]}
          >
            <Feather name="arrow-up" size={15} color={colors.foreground} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('Move down')}: ${step.title}`}
            accessibilityState={{ disabled: busy || index === total - 1 }}
            disabled={busy || index === total - 1}
            hitSlop={6}
            onPress={() => onMove(1)}
            style={({ pressed }) => [
              styles.control,
              {
                borderColor: colors.border,
                borderRadius: colors.radius,
                backgroundColor: pressed ? colors.muted : 'transparent',
                opacity: index === total - 1 ? 0.35 : 1,
              },
            ]}
          >
            <Feather name="arrow-down" size={15} color={colors.foreground} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('Remove')}: ${step.title}`}
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            hitSlop={6}
            onPress={onRemove}
            style={({ pressed }) => [
              styles.control,
              {
                borderColor: colors.border,
                borderRadius: colors.radius,
                backgroundColor: pressed ? colors.muted : 'transparent',
              },
            ]}
          >
            <Feather name="trash-2" size={15} color={colors.destructiveText} />
          </Pressable>
        </View>
      </View>
    );
  }

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
   * said rather than only what they ticked.
   *
   * This goal's evidence, asked for by goal. It used to ask for all of it and
   * filter here, which meant reading every check-in the learner had ever
   * recorded -- a row per finished step, for as long as they have been using
   * the app, uncapped by any plan -- in order to mark three steps, over
   * whatever connection the phone was on. A failure here leaves the marks off
   * and the screen alone.
   */
  const evidence = useListLearningEvidence(
    { goalId },
    { query: { queryKey: getListLearningEvidenceQueryKey({ goalId }) } },
  );
  const checkedInSteps = React.useMemo(
    () =>
      new Set(
        (evidence.data ?? [])
          .filter((row) => row.pathStepId)
          .map((row) => row.pathStepId as string),
      ),
    [evidence.data],
  );
  /*
   * The step somebody is on: the first one still outstanding, in the path's
   * own order. Not a recommendation -- just the next one -- and what to do
   * with it comes from the server, which knows the material's format and the
   * role the learner gave it.
   */
  const nextStep = goal?.pathSteps.find((step) => !step.completed) ?? null;
  const activity = useGetStepActivity(goalId, nextStep?.id ?? '', {
    query: {
      queryKey: getGetStepActivityQueryKey(goalId, nextStep?.id ?? ''),
      enabled: Boolean(goal && nextStep),
    },
  });
  const suggestion = activity.data ?? null;
  const described = suggestion ? describeActivity(suggestion, t) : null;
  /*
   * A path is a snapshot of the list it came from, and the list keeps moving.
   * The server compares the two and reports only what the list has gained, so
   * this asks once per visit and stays quiet when there is nothing to say.
   */
  const drift = useGetGoalListDrift(goalId, {
    query: {
      queryKey: getGetGoalListDriftQueryKey(goalId),
      enabled: Boolean(goal?.sourceListId),
    },
  });
  const behindBy = drift.data?.added.length ?? 0;
  const catchUp = useAddStepsFromList();
  const [catchUpFailure, setCatchUpFailure] = React.useState<string | null>(null);

  /** Append the list's new resources to this path, keeping every step it has. */
  async function bringListForward() {
    if (!goal || catchUp.isPending) return;
    setCatchUpFailure(null);
    try {
      await catchUp.mutateAsync({ id: goal.id });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListLearningGoalsQueryKey() }),
        drift.refetch(),
      ]);
      selection();
    } catch (failure) {
      warning();
      setCatchUpFailure(
        describeApiFailure(failure, t('Those steps could not be added.'), t),
      );
    }
  }

  /*
   * Editing the path itself, which the web has had and the phone has not.
   * Every write names the one step it is about -- the whole path used to be
   * sent back with one thing changed, which is how a rename here undid a tick
   * made on the laptop.
   */
  const [editingSteps, setEditingSteps] = React.useState(false);
  const [newStepTitle, setNewStepTitle] = React.useState('');
  const [editFailure, setEditFailure] = React.useState<string | null>(null);
  const addStep = useAddGoalStep();
  const renameStep = useRenameGoalStep();
  const removeStep = useDeleteGoalStep();
  const reorderSteps = useReorderGoalSteps();

  /**
   * Run one path edit and put the screen back in step with the server.
   *
   * No optimistic update: unlike a tick, none of these is a control somebody
   * taps repeatedly, and a refused reorder is exactly the case where guessing
   * would leave the screen showing an order that was never saved.
   */
  async function editPath(stepId: string | null, write: () => Promise<unknown>) {
    if (!goal || busyStep) return;
    setBusyStep(stepId ?? 'path');
    setEditFailure(null);
    try {
      await write();
      await queryClient.invalidateQueries({ queryKey: getListLearningGoalsQueryKey() });
      selection();
    } catch (failure) {
      warning();
      setEditFailure(
        describeApiFailure(failure, t('That change could not be saved.'), t),
      );
    } finally {
      setBusyStep(null);
    }
  }

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

      {/*
        The list moved on. Shown only when there is something to act on, and
        it says how many rather than "this path is out of date", because a
        number is the difference between a warning and an instruction. Adding
        appends: nothing already on the path changes, so a finished step stays
        finished.
      */}
      {behindBy > 0 ? (
        <View
          style={[
            styles.drift,
            { borderColor: colors.border, borderRadius: colors.radius },
          ]}
        >
          <Text style={[styles.driftText, { color: colors.foreground }]}>
            {behindBy === 1
              ? t('This list has 1 resource that is not on this path.')
              : t('This list has {count} resources that are not on this path.').replace(
                  '{count}',
                  String(behindBy),
                )}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Add to this path')}
            accessibilityState={{ disabled: catchUp.isPending }}
            disabled={catchUp.isPending}
            onPress={bringListForward}
            style={({ pressed }) => [
              styles.driftButton,
              { opacity: pressed || catchUp.isPending ? 0.6 : 1 },
            ]}
          >
            <Feather name="plus-circle" size={15} color={colors.primary} />
            <Text
              style={[
                styles.driftButtonText,
                { color: colors.primary, fontFamily: colors.fontFamily.sansSemiBold },
              ]}
            >
              {catchUp.isPending ? t('Adding…') : t('Add to this path')}
            </Text>
          </Pressable>
          {catchUpFailure ? (
            <Text style={[styles.driftText, { color: colors.destructiveText }]}>
              {catchUpFailure}
            </Text>
          ) : null}
        </View>
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

      {/*
        The one step somebody is on, and what it asks of them. The
        specification's study session is a screen of its own; this is the part
        of it that belongs on the goal -- the next step, what to do with it,
        and one way in.
      */}
      {nextStep ? (
        <View
          style={[
            styles.next,
            { borderColor: colors.primary, borderRadius: colors.radius },
          ]}
        >
          <Text style={[styles.nextLabel, { color: colors.mutedForeground }]}>
            {t('Next')}
          </Text>
          <Text
            numberOfLines={2}
            style={[
              styles.nextTitle,
              { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold },
            ]}
          >
            {nextStep.title}
          </Text>
          {described ? (
            <>
              <Text style={[styles.nextAction, { color: colors.foreground }]}>
                {described.action}
              </Text>
              {described.note ? (
                <Text style={[styles.nextNote, { color: colors.mutedForeground }]}>
                  {described.note}
                </Text>
              ) : null}
              <View style={styles.nextActions}>
                {/*
                  Both buttons navigate with the id the payload itself carried.
                  Reading the resource id off the step instead would let the
                  button draw from one source and move from another, and a
                  button that draws and does nothing is worse than no button.
                */}
                {suggestion?.resource ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t('Open')} ${suggestion.resource.title}`}
                    onPress={() => router.push(`/resource/${suggestion.resource!.id}`)}
                    style={({ pressed }) => [styles.nextButton, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Feather name="external-link" size={15} color={colors.primary} />
                    <Text style={[styles.nextButtonText, { color: colors.primary }]}>
                      {t('Open')}
                    </Text>
                  </Pressable>
                ) : null}
                {suggestion?.recallActivity ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t('Revise with')} ${suggestion.recallActivity.title}`}
                    onPress={() => router.push(`/study/${suggestion.recallActivity!.id}`)}
                    style={({ pressed }) => [styles.nextButton, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Feather name="layers" size={15} color={colors.primary} />
                    <Text style={[styles.nextButtonText, { color: colors.primary }]}>
                      {t('Revise')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          ) : null}
        </View>
      ) : null}

      {/*
        The path is the learner's own, so it is theirs to arrange. Behind a
        mode rather than on every row: studying is what this screen is for,
        and the controls for changing a path are not the controls for working
        through one.
      */}
      <View style={styles.editBar}>
        <Pressable
          // Named for the audit, which clicks it: the label it would otherwise
          // have to find is translated, and there is no other way for a check
          // that renders screens to reach a mode nobody has tapped into.
          testID="edit-steps"
          accessibilityRole="button"
          accessibilityLabel={editingSteps ? t('Finish editing') : t('Edit steps')}
          accessibilityState={{ expanded: editingSteps }}
          onPress={() => {
            setEditingSteps((current) => !current);
            setEditFailure(null);
            selection();
          }}
          style={({ pressed }) => [styles.editToggle, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Feather
            name={editingSteps ? 'check' : 'edit-2'}
            size={14}
            color={colors.primary}
          />
          <Text
            style={[
              styles.editToggleText,
              { color: colors.primary, fontFamily: colors.fontFamily.sansSemiBold },
            ]}
          >
            {editingSteps ? t('Finish editing') : t('Edit steps')}
          </Text>
        </Pressable>
      </View>

      {total === 0 && !editingSteps ? (
        <Empty
          icon="list"
          title={t('This goal has no steps yet')}
          description={t('Add one below, or build a path from a learning list.')}
        />
      ) : (
        <View style={styles.steps}>
          {goal.pathSteps.map((step, index) => (
            <Step
              key={step.id}
              step={step}
              index={index}
              total={total}
              busy={busyStep === step.id || busyStep === 'path'}
              checkedIn={checkedInSteps.has(step.id)}
              editing={editingSteps}
              onToggle={() => {
                toggle(step);
              }}
              onOpenResource={() => {
                if (step.resourceId) router.push(`/resource/${step.resourceId}`);
              }}
              onRename={(title) => {
                void editPath(step.id, () =>
                  renameStep.mutateAsync({ id: goal.id, stepId: step.id, data: { title } }),
                );
              }}
              onMove={(delta) => {
                /*
                 * Ids, not steps. Reordering has no business carrying a title
                 * or a tick, and the server puts a step this screen has not
                 * seen after the ones it arranged rather than losing it.
                 */
                const stepIds = moveItem(
                  goal.pathSteps.map((one) => one.id),
                  index,
                  delta,
                );
                void editPath(step.id, () =>
                  reorderSteps.mutateAsync({ id: goal.id, data: { stepIds } }),
                );
              }}
              onRemove={() => {
                void editPath(step.id, () =>
                  removeStep.mutateAsync({ id: goal.id, stepId: step.id }),
                );
              }}
            />
          ))}
        </View>
      )}

      {editingSteps ? (
        <View style={styles.addStep}>
          <TextInput
            value={newStepTitle}
            onChangeText={setNewStepTitle}
            placeholder={t('Add a step')}
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel={t('Add a step')}
            editable={busyStep === null}
            onSubmitEditing={() => {
              const title = newStepTitle.trim();
              if (!title) return;
              void editPath(null, async () => {
                await addStep.mutateAsync({ id: goal.id, data: { title } });
                setNewStepTitle('');
              });
            }}
            returnKeyType="done"
            style={[
              styles.stepInput,
              {
                color: colors.foreground,
                borderColor: colors.border,
                borderRadius: colors.radius,
                fontFamily: colors.fontFamily.sans,
              },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Add a step')}
            accessibilityState={{ disabled: !newStepTitle.trim() || busyStep !== null }}
            disabled={!newStepTitle.trim() || busyStep !== null}
            onPress={() => {
              const title = newStepTitle.trim();
              if (!title) return;
              void editPath(null, async () => {
                await addStep.mutateAsync({ id: goal.id, data: { title } });
                setNewStepTitle('');
              });
            }}
            style={({ pressed }) => [
              styles.control,
              {
                borderColor: colors.border,
                borderRadius: colors.radius,
                backgroundColor: pressed ? colors.muted : 'transparent',
                opacity: newStepTitle.trim() && busyStep === null ? 1 : 0.35,
              },
            ]}
          >
            <Feather name="plus" size={16} color={colors.primary} />
          </Pressable>
        </View>
      ) : null}

      {editFailure ? (
        <Text
          style={[
            styles.note,
            { color: colors.destructiveText, fontFamily: colors.fontFamily.sans },
          ]}
        >
          {editFailure}
        </Text>
      ) : null}

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
  stepInput: {
    flex: 1,
    borderWidth: 1,
    fontSize: 14,
    paddingHorizontal: 10,
    // Above the 44pt touch target both stores ask for.
    minHeight: 44,
    paddingVertical: 8,
  },
  stepControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  control: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
  },
  // The count is already on the progress bar above; the bar is the toggle.
  editBar: { flexDirection: 'row', justifyContent: 'flex-end' },
  editToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 },
  editToggleText: { fontSize: 14 },
  addStep: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  drift: { borderWidth: 1, padding: 14, gap: 8 },
  driftText: { fontSize: 13, lineHeight: 18 },
  driftButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 },
  driftButtonText: { fontSize: 14 },
  next: { borderWidth: 1, padding: 14, gap: 4 },
  nextLabel: { fontSize: 12 },
  nextTitle: { fontSize: 16, lineHeight: 21 },
  nextAction: { fontSize: 14, marginTop: 2 },
  nextNote: { fontSize: 12, lineHeight: 16 },
  nextActions: { flexDirection: 'row', gap: 16, marginTop: 6 },
  nextButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 },
  nextButtonText: { fontSize: 14, fontWeight: '600' },
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
