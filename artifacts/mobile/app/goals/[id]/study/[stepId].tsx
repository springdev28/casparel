/**
 * @fileOverview Mobile workflow role: runs a focused path-step timer and captures durable learning evidence.
 * System connection: reads the generated goal collection, writes idempotent evidence, completes the matching path step, and returns to resumable progress.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Button } from '@workspace/edu-ds/components/native/button';
import { Empty } from '@workspace/edu-ds/components/native/empty';
import { Skeleton } from '@workspace/edu-ds/components/native/skeleton';
import {
  getListLearningEvidenceQueryKey,
  getListLearningGoalsQueryKey,
  useCreateLearningEvidence,
  useListLearningGoals,
  useUpdateLearningGoal,
  type LearningGoal,
} from '@workspace/api-client-react';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { ErrorState } from '@/components/ErrorState';
import { ProgressTransition } from '@/components/ProgressTransition';
import {
  FOCUS_DURATION_PRESETS,
  createEvidenceSubmissionId,
  elapsedStudySeconds,
  formatStudyTime,
  remainingStudySeconds,
} from '@/utils/focus-session';
import { triggerHaptic } from '@/utils/haptics';
import { nextIncompleteStep } from '@/utils/learning-path';

type FocusPhase = 'ready' | 'running' | 'paused' | 'reflecting' | 'saved';

function Choice({
  label,
  onPress,
  selected,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const colors = useColors();
  return (
    <AnimatedPressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      haptic="selection"
      onPress={onPress}
      pressedScale={0.97}
      style={[
        styles.choice,
        {
          backgroundColor: selected ? colors.primary + '14' : colors.card,
          borderColor: selected ? colors.primary : colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      <Text
        style={{
          color: selected ? colors.primary : colors.foreground,
          fontFamily: selected ? colors.fontFamily.sansSemiBold : colors.fontFamily.sans,
        }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

export default function FocusedPathStudyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id: string; stepId: string }>();
  const goalId = Number(params.id);
  const stepId = params.stepId;
  const validGoalId = Number.isSafeInteger(goalId) && goalId > 0;
  const validStepId = typeof stepId === 'string' && stepId.length > 0 && stepId.length <= 100;
  const goalsQuery = useListLearningGoals();
  const updateGoal = useUpdateLearningGoal();
  const createEvidence = useCreateLearningEvidence();
  const goal = goalsQuery.data?.find((item) => item.id === goalId) ?? null;
  const step = goal?.pathSteps.find((item) => item.id === stepId) ?? null;
  const failed = goalsQuery.isError && goalsQuery.data === undefined;

  const [phase, setPhase] = React.useState<FocusPhase>('ready');
  const [durationSeconds, setDurationSeconds] = React.useState<number>(25 * 60);
  const [accumulatedSeconds, setAccumulatedSeconds] = React.useState(0);
  const [startedAtMs, setStartedAtMs] = React.useState<number | null>(null);
  const [clockMs, setClockMs] = React.useState(() => Date.now());
  const [confidence, setConfidence] = React.useState<number | null>(null);
  const [understanding, setUnderstanding] = React.useState<number | null>(null);
  const [reflection, setReflection] = React.useState('');
  const [misconception, setMisconception] = React.useState('');
  const [writeError, setWriteError] = React.useState('');
  const [savedGoal, setSavedGoal] = React.useState<LearningGoal | null>(null);
  const submissionId = React.useRef(createEvidenceSubmissionId()).current;

  // The interval refreshes the display only. elapsedStudySeconds uses the
  // absolute start timestamp, so background throttling cannot slow the clock.
  React.useEffect(() => {
    if (phase !== 'running') return;
    const tick = () => setClockMs(Date.now());
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [phase]);

  const elapsedSeconds = elapsedStudySeconds(accumulatedSeconds, startedAtMs, clockMs);
  const remainingSeconds = remainingStudySeconds(durationSeconds, elapsedSeconds);

  React.useEffect(() => {
    if (phase !== 'running' || remainingSeconds > 0) return;
    setAccumulatedSeconds(durationSeconds);
    setStartedAtMs(null);
    setPhase('reflecting');
    void triggerHaptic('success');
  }, [durationSeconds, phase, remainingSeconds]);

  function startFocus() {
    setClockMs(Date.now());
    setStartedAtMs(Date.now());
    setPhase('running');
    setWriteError('');
  }

  function pauseFocus() {
    const now = Date.now();
    setAccumulatedSeconds(elapsedStudySeconds(accumulatedSeconds, startedAtMs, now));
    setStartedAtMs(null);
    setClockMs(now);
    setPhase('paused');
  }

  function resumeFocus() {
    const now = Date.now();
    setStartedAtMs(now);
    setClockMs(now);
    setPhase('running');
  }

  function finishAndReflect() {
    const now = Date.now();
    setAccumulatedSeconds(
      Math.min(durationSeconds, elapsedStudySeconds(accumulatedSeconds, startedAtMs, now)),
    );
    setStartedAtMs(null);
    setClockMs(now);
    setPhase('reflecting');
  }

  async function saveEvidence(currentGoal: LearningGoal) {
    if (!step || confidence === null || understanding === null) {
      setWriteError('Choose confidence and understanding before saving.');
      return;
    }
    if (reflection.trim().length < 3) {
      setWriteError('Add a short reflection about what you understood.');
      return;
    }

    setWriteError('');
    let evidencePersisted = false;
    try {
      await createEvidence.mutateAsync({
        data: {
          learningGoalId: currentGoal.id,
          resourceId: step.resourceId ?? null,
          pathStepId: step.id,
          studyDurationSeconds: Math.min(28_800, elapsedSeconds),
          clientSubmissionId: submissionId,
          concept: step.title,
          confidence,
          understanding,
          reflection: reflection.trim(),
          misconception: misconception.trim() || null,
        },
      });
      evidencePersisted = true;

      let updated = currentGoal;
      if (!step.completed) {
        const nextSteps = currentGoal.pathSteps.map((item) =>
          item.id === step.id ? { ...item, completed: true } : item,
        );
        updated = await updateGoal.mutateAsync({
          id: currentGoal.id,
          data: {
            pathSteps: nextSteps,
            status: nextSteps.every((item) => item.completed) ? 'completed' : 'active',
          },
        });
        queryClient.setQueryData<LearningGoal[]>(getListLearningGoalsQueryKey(), (goals) =>
          goals?.map((item) => (item.id === updated.id ? updated : item)),
        );
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListLearningEvidenceQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListLearningGoalsQueryKey() }),
      ]);
      setSavedGoal(updated);
      setPhase('saved');
      await triggerHaptic('success');
    } catch (error) {
      const detail = error instanceof Error && error.message ? error.message : 'Please try again.';
      setWriteError(
        evidencePersisted
          ? `Your reflection was saved, but path progress was not updated. Retry safely to finish. ${detail}`
          : `Your reflection could not be saved. ${detail}`,
      );
      void triggerHaptic('error');
    }
  }

  if (!validGoalId || !validStepId) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Empty icon="alert-circle" title="Invalid focused-study link" />
      </View>
    );
  }

  if (goalsQuery.isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <Skeleton width="70%" height={28} />
        <Skeleton width="100%" height={180} borderRadius={8} />
      </View>
    );
  }

  if (failed) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ErrorState
          error={goalsQuery.error}
          retrying={goalsQuery.isFetching}
          onRetry={() => {
            void goalsQuery.refetch();
          }}
        />
      </View>
    );
  }

  if (!goal || !step) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Empty icon="alert-circle" title="Learning-path step not found" />
      </View>
    );
  }

  const nextStep = savedGoal ? nextIncompleteStep(savedGoal) : null;
  const inputStyle = [
    styles.input,
    {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: colors.radius,
      color: colors.foreground,
      fontFamily: colors.fontFamily.sans,
    },
  ];

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={{ backgroundColor: colors.background }}
    >
      <View style={styles.header}>
        <Text style={{ color: colors.primary, fontFamily: colors.fontFamily.sansSemiBold }}>
          Focused study · {goal.title}
        </Text>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: colors.fontFamily.sansBold }]}>
          {step.title}
        </Text>
      </View>

      {phase === 'saved' ? (
        <View
          accessibilityRole="alert"
          style={[
            styles.success,
            { backgroundColor: colors.primary + '12', borderColor: colors.primary, borderRadius: colors.radius },
          ]}
        >
          <Feather name="check-circle" color={colors.primary} size={28} />
          <Text style={[styles.successTitle, { color: colors.foreground, fontFamily: colors.fontFamily.sansBold }]}>
            Evidence saved
          </Text>
          <Text style={{ color: colors.mutedForeground, textAlign: 'center', fontFamily: colors.fontFamily.sans }}>
            Your reflection, {formatStudyTime(elapsedSeconds)} of focused time, and path progress are now durable.
          </Text>
          {nextStep ? (
            <Button
              onPress={() => router.replace(`/goals/${goal.id}/study/${encodeURIComponent(nextStep.id)}`)}
              size="lg"
            >
              Study next step
            </Button>
          ) : null}
          <Button onPress={() => router.replace(`/goals/${goal.id}`)} size="lg" variant="outline">
            Back to learning path
          </Button>
        </View>
      ) : (
        <>
          <View
            style={[
              styles.timerCard,
              { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
            ]}
          >
            <Text
              accessibilityLabel={`${Math.ceil(remainingSeconds / 60)} minutes remaining`}
              style={[styles.timer, { color: colors.foreground, fontFamily: colors.fontFamily.sansBold }]}
            >
              {formatStudyTime(remainingSeconds)}
            </Text>
            <ProgressTransition value={durationSeconds ? elapsedSeconds / durationSeconds : 0} />
            <Text style={{ color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }}>
              {phase === 'ready'
                ? 'Choose a focus length, then begin.'
                : phase === 'reflecting'
                  ? 'Capture what changed before leaving this step.'
                  : `${formatStudyTime(elapsedSeconds)} focused`}
            </Text>

            {phase === 'ready' ? (
              <View accessibilityRole="radiogroup" style={styles.choicesRow}>
                {FOCUS_DURATION_PRESETS.map((seconds) => (
                  <Choice
                    key={seconds}
                    label={`${seconds / 60} min`}
                    onPress={() => setDurationSeconds(seconds)}
                    selected={durationSeconds === seconds}
                  />
                ))}
              </View>
            ) : null}

            <View style={styles.actions}>
              {phase === 'ready' ? (
                <Button onPress={startFocus} size="lg">Start focus</Button>
              ) : phase === 'running' ? (
                <>
                  <View style={styles.action}><Button onPress={pauseFocus} variant="outline">Pause</Button></View>
                  <View style={styles.action}><Button onPress={finishAndReflect}>Finish and reflect</Button></View>
                </>
              ) : phase === 'paused' ? (
                <>
                  <View style={styles.action}><Button onPress={resumeFocus}>Resume</Button></View>
                  <View style={styles.action}><Button onPress={finishAndReflect} variant="outline">Reflect now</Button></View>
                </>
              ) : null}
            </View>
          </View>

          {step.resourceId ? (
            <Button onPress={() => router.push(`/resource/${step.resourceId}`)} variant="outline">
              Open study resource
            </Button>
          ) : null}

          {phase === 'reflecting' ? (
            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }]}>
                  How confident are you now?
                </Text>
                <View accessibilityRole="radiogroup" style={styles.choicesRow}>
                  {['Not yet', 'Almost', 'Confident'].map((label, index) => (
                    <Choice key={label} label={label} onPress={() => setConfidence(index + 1)} selected={confidence === index + 1} />
                  ))}
                </View>
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }]}>
                  What can you do with this idea?
                </Text>
                <View accessibilityRole="radiogroup" style={styles.understandingChoices}>
                  {['Need help', 'Recognize it', 'Explain some', 'Explain clearly', 'Apply it'].map((label, index) => (
                    <Choice key={label} label={label} onPress={() => setUnderstanding(index)} selected={understanding === index} />
                  ))}
                </View>
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }]}>
                  What did you understand? *
                </Text>
                <TextInput
                  multiline
                  maxLength={2000}
                  onChangeText={setReflection}
                  placeholder="Explain the idea in your own words or name what became clearer."
                  placeholderTextColor={colors.mutedForeground}
                  style={[inputStyle, styles.reflectionInput]}
                  textAlignVertical="top"
                  value={reflection}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }]}>
                  What is still confusing? (optional)
                </Text>
                <TextInput
                  maxLength={500}
                  onChangeText={setMisconception}
                  placeholder="A question, misconception, or part to revisit"
                  placeholderTextColor={colors.mutedForeground}
                  style={inputStyle}
                  value={misconception}
                />
              </View>

              {writeError ? (
                <View
                  accessibilityRole="alert"
                  style={[
                    styles.writeError,
                    { backgroundColor: colors.destructive + '12', borderColor: colors.destructive, borderRadius: colors.radius },
                  ]}
                >
                  <Feather name="alert-circle" color={colors.destructiveText} size={16} />
                  <Text style={{ color: colors.destructiveText, flex: 1, fontFamily: colors.fontFamily.sans }}>
                    {writeError}
                  </Text>
                </View>
              ) : null}

              <Button
                loading={createEvidence.isPending || updateGoal.isPending}
                onPress={() => {
                  void saveEvidence(goal);
                }}
                size="lg"
              >
                Save evidence and complete step
              </Button>
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center' },
  loading: { flex: 1, gap: 14, padding: 16 },
  content: { gap: 18, padding: 16 },
  header: { gap: 6 },
  title: { fontSize: 24, letterSpacing: -0.4, lineHeight: 30 },
  timerCard: { alignItems: 'center', borderWidth: 1, gap: 14, padding: 18 },
  timer: { fontSize: 52, fontVariant: ['tabular-nums'], letterSpacing: -1 },
  choicesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  understandingChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { alignItems: 'center', borderWidth: 1, flexGrow: 1, minWidth: 86, paddingHorizontal: 12, paddingVertical: 10 },
  actions: { alignSelf: 'stretch', flexDirection: 'row', gap: 8 },
  action: { flex: 1 },
  form: { gap: 18 },
  field: { gap: 8 },
  label: { fontSize: 15 },
  input: { borderWidth: 1, minHeight: 46, paddingHorizontal: 12, paddingVertical: 10 },
  reflectionInput: { minHeight: 112 },
  writeError: { alignItems: 'flex-start', borderWidth: 1, flexDirection: 'row', gap: 8, padding: 10 },
  success: { alignItems: 'center', borderWidth: 1, gap: 14, padding: 20 },
  successTitle: { fontSize: 22 },
});
