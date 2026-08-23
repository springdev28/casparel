/**
 * @fileOverview Mobile UI role: provides the reusable Goal Progress component.
 * System connection: composed by Expo Router screens and aligned with shared API/auth/purchase state where required.
 */
/**
 * How far through a goal you are, as a bar and a fraction.
 *
 * Shared by the list and the detail screen so the two cannot disagree about
 * what "done" means -- which they would, because the arithmetic is one line
 * and one line is exactly the kind of thing that gets written twice and then
 * diverges when the rule changes.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import type { LearningGoal } from '@workspace/api-client-react';

/** Steps ticked off, and how many there are. */
export function goalProgress(goal: LearningGoal) {
  const steps = goal.pathSteps ?? [];
  return {
    done: steps.filter((step) => step.completed).length,
    total: steps.length,
  };
}

export function GoalProgress({ goal }: { goal: LearningGoal }) {
  const colors = useColors();
  const { done, total } = goalProgress(goal);
  // A goal with no path yet is not "0%" -- it is a goal without a path, and
  // an empty bar claims progress was measured when nothing was.
  if (total === 0) return null;

  const fraction = done / total;
  return (
    <View style={styles.row}>
      <View
        style={[styles.track, { backgroundColor: colors.border }]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: total, now: done }}
      >
        <View
          style={[
            styles.fill,
            {
              backgroundColor: done === total ? colors.successText : colors.primary,
              width: `${Math.round(fraction * 100)}%`,
            },
          ]}
        />
      </View>
      <Text
        style={[
          styles.label,
          { color: colors.mutedForeground, fontFamily: colors.fontFamily.sansMedium },
        ]}
      >
        {/* Two numbers and a slash: the same in every language this ships in. */}
        {`${done} / ${total}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  label: { fontSize: 12 },
});
