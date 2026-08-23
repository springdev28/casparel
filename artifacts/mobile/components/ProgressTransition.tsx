/**
 * @fileOverview Mobile UI role: animates bounded learning progress while exposing an exact accessibility value.
 * System connection: consumes MotionContext and pure progress helpers on path cards and detail screens.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { useMotion } from '@/contexts/MotionContext';
import { clampProgress, progressPercent } from '@/utils/progress';

export function ProgressTransition({ value }: { value: number }) {
  const colors = useColors();
  const { duration, reduceMotion } = useMotion();
  const normalized = clampProgress(value);
  // In reduced-motion mode the first frame already has the final width. Other
  // users get one short transition that communicates change without looping.
  const progress = useSharedValue(reduceMotion ? normalized : 0);

  useEffect(() => {
    progress.value = withTiming(normalized, { duration: duration('standard') });
  }, [duration, normalized, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: progressPercent(normalized) }}
      style={[styles.track, { backgroundColor: colors.muted }]}
    >
      <Animated.View
        style={[styles.fill, { backgroundColor: colors.primary }, animatedStyle]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { borderRadius: 999, height: 8, overflow: 'hidden', width: '100%' },
  fill: { borderRadius: 999, height: '100%' },
});
