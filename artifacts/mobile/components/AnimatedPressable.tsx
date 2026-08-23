/**
 * @fileOverview Mobile UI role: provides consistent accessible scale feedback for tappable cards and controls.
 * System connection: consumes MotionContext and the safe haptic adapter, while preserving normal Pressable semantics.
 */
import React from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useMotion } from '@/contexts/MotionContext';
import { triggerHaptic, type HapticIntent } from '@/utils/haptics';

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

interface AnimatedPressableProps
  extends Omit<PressableProps, 'style' | 'onPressIn' | 'onPressOut'> {
  style?: StyleProp<ViewStyle>;
  /** Optional semantic feedback; mutation success haptics belong after server confirmation. */
  haptic?: HapticIntent;
  /** Cards use a subtle scale; set to 1 when only the shared timing behavior is wanted. */
  pressedScale?: number;
  onPressIn?: (event: GestureResponderEvent) => void;
  onPressOut?: (event: GestureResponderEvent) => void;
}
export function AnimatedPressable({
  accessibilityRole = 'button',
  disabled,
  haptic,
  onPress,
  onPressIn,
  onPressOut,
  pressedScale = 0.985,
  style,
  ...props
}: AnimatedPressableProps) {
  const { duration } = useMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = (event: GestureResponderEvent) => {
    scale.value = withTiming(pressedScale, { duration: duration('quick') });
    onPressIn?.(event);
  };

  const handlePressOut = (event: GestureResponderEvent) => {
    scale.value = withTiming(1, { duration: duration('quick') });
    onPressOut?.(event);
  };

  const handlePress = (event: GestureResponderEvent) => {
    if (haptic) void triggerHaptic(haptic);
    onPress?.(event);
  };

  return (
    <AnimatedPressableBase
      {...props}
      accessibilityRole={accessibilityRole}
      disabled={disabled}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, animatedStyle]}
    />
  );
}
