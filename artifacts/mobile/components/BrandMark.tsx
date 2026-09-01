/**
 * @fileOverview Brand UI role: renders Casparel's canonical geometric mark in native screens.
 * System connection: matches public/brand/casparel-mark.svg and the generated launcher assets.
 */
import React from 'react';
import Svg, { Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';

export function BrandMark({ size = 40 }: { size?: number }) {
  const colors = useColors();
  return (
    <Svg width={size} height={size} viewBox="0 0 320 320" accessibilityLabel="Casparel">
      <Defs>
        <LinearGradient id="casparel-mark-native" x1="64.442" y1="46.8392" x2="287.522" y2="235.218" gradientUnits="userSpaceOnUse">
          <Stop stopColor={colors.primary} />
          <Stop offset="1" stopColor={colors.accent} />
        </LinearGradient>
      </Defs>
      <G fill="url(#casparel-mark-native)">
        <Path d="M295.111 0H96L24.8889 71.1111H224L295.111 0Z" />
        <Path d="M38.8663 259.105L88.0321 308.271L157.982 277.654L69.4832 189.156L38.8663 259.105Z" />
        <Path d="M88.032 11.133L38.8663 60.2987L69.4832 130.248L157.981 41.7498L88.032 11.133Z" />
        <Path d="M24.8889 71.1111V248.889L96 320V0L24.8889 71.1111Z" />
        <Path d="M96 320H295.111L224 248.889H24.8889L96 320Z" />
      </G>
      <Rect x="221.156" y="123.733" width="73.3867" height="73.3867" rx="20.5483" fill={colors.primary} />
    </Svg>
  );
}
