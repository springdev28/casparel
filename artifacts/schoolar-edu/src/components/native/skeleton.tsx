/**
 * @fileOverview Design-system role: implements or demonstrates Skeleton in the shared component/token package.
 * System connection: provides consistent visual, responsive, and accessibility behavior to the web application.
 */
// @ts-nocheck
// react-native is available when this shared component is bundled by Expo.
import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated } from "react-native";
import { useColors } from "../../hooks/use-colors";

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: object;
}

export function Skeleton({ width, height = 16, borderRadius, style }: SkeletonProps) {
  const colors = useColors();
  const [reduceMotion, setReduceMotion] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    // A skeleton still communicates loading with no animation. Stopping the
    // pulse here makes every existing loading screen respect the phone's
    // Reduce Motion setting without requiring each caller to remember it.
    if (reduceMotion) {
      opacity.stopAnimation();
      opacity.setValue(1);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity, reduceMotion]);

  return (
    <Animated.View
      style={[
        {
          backgroundColor: colors.muted,
          borderRadius: borderRadius ?? colors.radius / 2,
          height,
          width,
        },
        { opacity },
        style,
      ]}
    />
  );
}
