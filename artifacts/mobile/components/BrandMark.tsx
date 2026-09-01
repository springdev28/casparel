/**
 * @fileOverview Brand UI role: renders Casparel's canonical geometric mark in native screens.
 * System connection: matches public/brand/casparel-mark.svg and the generated launcher assets.
 */
import React from 'react';
import { Image } from 'react-native';

export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={require('@/assets/images/brand-mark.png')}
      accessibilityLabel="Casparel"
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}
