import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PressableScale } from './PressableScale';
import { tokens } from '../../theme/tokens';
import type { Theme } from '../../theme/colors';

interface CaptureCardProps {
  theme: Theme;
  onPress: () => void;
}

/** Tap-to-capture hero card for the home screen. */
export function CaptureCard({ theme, onPress }: CaptureCardProps) {
  return (
    <PressableScale onPress={onPress} style={styles.hit}>
      <View style={[styles.card, { backgroundColor: theme.surfaceDark }]}>
        <View style={styles.starField}>
          {PREVIEW_STARS.map((dot, i) => (
            <View
              key={i}
              style={[
                styles.star,
                {
                  top: dot.y,
                  left: dot.x,
                  opacity: dot.b,
                },
              ]}
            />
          ))}
        </View>
        <View style={[styles.reticle, { borderColor: theme.primary }]} />
        <View style={styles.labelWrap}>
          <Text style={[styles.label, { color: theme.onDark }]}>Tap to capture</Text>
          <Text style={[styles.hint, { color: theme.onDarkSoft }]}>
            Point at a star field
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}

const PREVIEW_STARS: { x: number; y: number; b: number }[] = [
  { x: 28, y: 28, b: 0.9 },
  { x: 72, y: 18, b: 0.6 },
  { x: 118, y: 38, b: 0.85 },
  { x: 168, y: 24, b: 0.7 },
  { x: 210, y: 52, b: 0.55 },
  { x: 52, y: 72, b: 0.75 },
  { x: 132, y: 78, b: 0.65 },
  { x: 188, y: 88, b: 0.5 },
  { x: 88, y: 108, b: 0.8 },
  { x: 156, y: 118, b: 0.6 },
];

const styles = StyleSheet.create({
  hit: {
    marginBottom: tokens.space.lg,
  },
  card: {
    height: 220,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  starField: {
    ...StyleSheet.absoluteFillObject,
  },
  star: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: tokens.color.onDark,
  },
  reticle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5,
    opacity: 0.65,
  },
  labelWrap: {
    position: 'absolute',
    bottom: tokens.space.lg,
    alignItems: 'center',
  },
  label: {
    ...tokens.type.bodyStrong,
  },
  hint: {
    ...tokens.type.caption,
    marginTop: 2,
  },
});
