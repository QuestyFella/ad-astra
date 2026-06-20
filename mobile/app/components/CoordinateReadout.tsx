import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { SolveResult } from '../types/solver';
import type { Theme } from '../theme/colors';

interface CoordinateReadoutProps {
  result: SolveResult;
  theme: Theme;
}

function degToRA(deg: number): string {
  const totalHours = deg / 15;
  const h = Math.floor(totalHours);
  const m = Math.floor((totalHours - h) * 60);
  const s = ((totalHours - h) * 60 - m) * 60;
  return `${h}h ${String(m).padStart(2, '0')}m ${s.toFixed(1).padStart(4, '0')}s`;
}

function degToDec(deg: number): string {
  const sign = deg >= 0 ? '+' : '−';
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  const s = ((abs - d) * 60 - m) * 60;
  return `${sign}${String(d).padStart(2, '0')}° ${String(m).padStart(2, '0')}' ${s.toFixed(1).padStart(4, '0')}"`;
}

export function CoordinateReadout({ result, theme }: CoordinateReadoutProps) {
  if (!result.success || result.raDeg === null || result.decDeg === null) {
    return null;
  }

  const t = theme;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={[styles.label, { color: t.textMuted }]}>Right Ascension</Text>
        <Text style={[styles.value, { color: t.text }]}>{degToRA(result.raDeg)}</Text>
      </View>
      <View style={[styles.row, { borderTopColor: t.cardBorder }]}>
        <Text style={[styles.label, { color: t.textMuted }]}>Declination</Text>
        <Text style={[styles.value, { color: t.text }]}>{degToDec(result.decDeg)}</Text>
      </View>
      <View style={[styles.row, { borderTopColor: t.cardBorder }]}>
        <Text style={[styles.label, { color: t.textMuted }]}>Field of View</Text>
        <Text style={[styles.value, { color: t.text }]}>
          {result.fovXDeg != null && result.fovYDeg != null
            ? `${result.fovXDeg.toFixed(1)}° × ${result.fovYDeg.toFixed(1)}°`
            : '—'}
        </Text>
      </View>
      <View style={[styles.row, { borderTopColor: t.cardBorder }]}>
        <Text style={[styles.label, { color: t.textMuted }]}>Rotation</Text>
        <Text style={[styles.value, { color: t.text }]}>
          {result.rotationDeg != null ? `${result.rotationDeg.toFixed(1)}°` : '—'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  row: {
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  value: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
