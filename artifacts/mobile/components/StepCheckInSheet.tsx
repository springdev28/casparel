/**
 * @fileOverview Mobile UI role: asks how a finished path step went, and shows what happened when it is done.
 * System connection: opened by the goal screen and backed by the generated step-completion hook.
 */
/**
 * The moment a step is finished.
 *
 * Three answers, and they are the same three the web dashboard has asked since
 * check-ins existed -- "Not yet", "Almost", "I can" -- so a teacher's class
 * signals aggregate across both surfaces instead of describing two different
 * scales.
 *
 * Skipping is a first-class answer, not a nag dismissed. Somebody ticking a box
 * on a bus should not have to say how it went, and a middling number recorded
 * on their behalf would end up in a teacher's dashboard as something they said.
 *
 * After the write this becomes the completion screen the specification asks
 * for: what was recorded, where the goal now stands, and the next step. It
 * stays open to say so rather than vanishing, because a sheet that closes
 * itself takes the answer with it.
 */
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Button } from '@workspace/edu-ds/components/native/button';
import type { LearningPathStep } from '@workspace/api-client-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useMotion } from '@/contexts/MotionContext';

/**
 * The three answers, and the numbers they mean.
 *
 * The mapping is the web's: confidence 1..3 alongside understanding 1, 2 and 4.
 * Kept here as data rather than in the buttons so the two surfaces can be
 * compared by reading one line.
 */
export const CHECK_IN_ANSWERS = [
  { label: 'Not yet', confidence: 1, understanding: 1 },
  { label: 'Almost', confidence: 2, understanding: 2 },
  { label: 'I can', confidence: 3, understanding: 4 },
] as const;

export type StepOutcome = {
  recorded: boolean;
  nextStep: LearningPathStep | null;
  done: number;
  total: number;
};

type StepCheckInSheetProps = {
  visible: boolean;
  step: LearningPathStep | null;
  outcome: StepOutcome | null;
  saving: boolean;
  failure: string | null;
  onAnswer: (answer: { confidence: number; understanding: number; reflection: string } | null) => void;
  onOpenNext: (step: LearningPathStep) => void;
  onClose: () => void;
};

export function StepCheckInSheet({
  visible,
  step,
  outcome,
  saving,
  failure,
  onAnswer,
  onOpenNext,
  onClose,
}: StepCheckInSheetProps) {
  const { t } = useLanguage();
  const colors = useColors();
  const { reduceMotion } = useMotion();
  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    if (!visible) setAnswered(false);
  }, [visible]);

  const finished = outcome !== null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'fade' : 'slide'}
      onRequestClose={saving ? () => {} : onClose}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Close')}
          disabled={saving}
          style={styles.backdrop}
          onPress={onClose}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderTopLeftRadius: colors.radius * 2,
              borderTopRightRadius: colors.radius * 2,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <Text
            numberOfLines={2}
            style={[
              styles.title,
              { color: colors.foreground, fontFamily: colors.fontFamily.sansBold },
            ]}
          >
            {step?.title ?? ''}
          </Text>

          {finished ? (
            <>
              <View style={styles.doneRow}>
                <Feather name="check-circle" size={18} color={colors.successText} />
                <Text
                  style={[
                    styles.doneText,
                    { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold },
                  ]}
                >
                  {outcome.done === outcome.total
                    ? t('Every step is done.')
                    : `${outcome.done}/${outcome.total} ${t('steps done')}`}
                </Text>
              </View>

              <Text style={[styles.note, { color: colors.mutedForeground }]}>
                {outcome.recorded
                  ? t('Your answer was saved as evidence.')
                  : t('Marked done. Nothing was recorded about how it went.')}
              </Text>

              {outcome.nextStep ? (
                <View style={styles.nextBlock}>
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
                    {outcome.nextStep.title}
                  </Text>
                </View>
              ) : null}

              <View style={styles.footerRow}>
                {outcome.nextStep?.resourceId ? (
                  <Button
                    variant="outline"
                    onPress={() => {
                      if (outcome.nextStep) onOpenNext(outcome.nextStep);
                    }}
                  >
                    {t('Open the next one')}
                  </Button>
                ) : null}
                <Button onPress={onClose}>{t('Done')}</Button>
              </View>
            </>
          ) : (
            <>
              <Text
                style={[
                  styles.question,
                  { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
                ]}
              >
                {t('How did that go?')}
              </Text>

              <View style={styles.answers}>
                {CHECK_IN_ANSWERS.map((answer) => (
                  <Pressable
                    key={answer.label}
                    accessibilityRole="button"
                    accessibilityLabel={t(answer.label)}
                    disabled={saving || answered}
                    onPress={() => {
                      setAnswered(true);
                      onAnswer({
                        confidence: answer.confidence,
                        understanding: answer.understanding,
                        reflection: answer.label,
                      });
                    }}
                    style={({ pressed }) => [
                      styles.answer,
                      {
                        borderColor: colors.border,
                        borderRadius: colors.radius,
                        backgroundColor: pressed ? colors.muted : colors.background,
                        opacity: saving || answered ? 0.6 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.answerText,
                        { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold },
                      ]}
                    >
                      {t(answer.label)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {failure ? (
                <View
                  accessibilityRole="alert"
                  style={[
                    styles.notice,
                    {
                      backgroundColor: colors.destructive + '12',
                      borderColor: colors.destructive,
                      borderRadius: colors.radius,
                    },
                  ]}
                >
                  <Feather name="alert-circle" size={16} color={colors.destructiveText} />
                  <Text style={[styles.noticeText, { color: colors.foreground }]}>{failure}</Text>
                </View>
              ) : null}

              {/* Skipping is an answer, not a dismissal: the step is done and
                  nothing is claimed about how it went. */}
              <View style={styles.footerRow}>
                <Button variant="ghost" onPress={onClose} disabled={saving}>
                  {t('Cancel')}
                </Button>
                <Button
                  variant="outline"
                  loading={saving && answered === false}
                  disabled={saving || answered}
                  onPress={() => {
                    setAnswered(true);
                    onAnswer(null);
                  }}
                >
                  {t('Just mark it done')}
                </Button>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  sheet: {
    borderWidth: 1,
    padding: 18,
    paddingBottom: 28,
    gap: 12,
  },
  handle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 2,
  },
  title: { fontSize: 17, lineHeight: 22 },
  question: { fontSize: 14 },
  answers: { flexDirection: 'row', gap: 8 },
  answer: {
    flex: 1,
    borderWidth: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  answerText: { fontSize: 14, textAlign: 'center' },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  doneText: { fontSize: 15 },
  note: { fontSize: 13, lineHeight: 18 },
  nextBlock: { gap: 2 },
  nextLabel: { fontSize: 12 },
  nextTitle: { fontSize: 15, lineHeight: 20 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    padding: 10,
  },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 17 },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
});
