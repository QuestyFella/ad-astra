import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { SolveResult } from '../types/solver';
import type { Theme } from '../theme/colors';
import { tokens } from '../theme/tokens';

interface CoordinateReadoutProps {
  result: SolveResult;
  theme?: Theme;
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
  return `${sign}${String(d).padStart(2, '0')}° ${String(m).padStart(2, '0')}′ ${s.toFixed(1).padStart(4, '0')}″`;
}

function rowColor(t: Theme, which: 'label' | 'value') {
  return which === 'label' ? t.textMuted : t.ink;
}

export function CoordinateReadout({ result, theme }: CoordinateReadoutProps) {
  if (!result.success || result.raDeg === null || result.decDeg === null) {
    return null;
  }

  const t = theme!;

  return (
    <View>
      <Row label="Right Ascension" value={degToRA(result.raDeg)} t={t} />
      <Row label="Declination" value={degToDec(result.decDeg)} t={t} top />
      <Row
        label="Field of View"
        value={
          result.fovXDeg != null && result.fovYDeg != null
            ? `${result.fovXDeg.toFixed(2)}° × ${result.fovYDeg.toFixed(2)}°`
            : '—'
        }
        t={t}
        top
      />
      <Row
        label="Rotation"
        value={result.rotationDeg != null ? `${result.rotationDeg.toFixed(2)}°` : '—'}
        t={t}
        top
      />
    </View>
  );
}

function Row({
  label,
  value,
  t,
  top,
}: {
  label: string;
  value: string;
  t: Theme;
  top?: boolean;
}) {
  return (
    <View
      style={[
        styles.row,
        { borderTopColor: t.hairline, borderTopWidth: top ? 1 : 0 },
      ]}
    >
      <Text style={[styles.label, { color: rowColor(t, 'label') }]}>
        {label}
      </Text>
      <Text style={[styles.value, { color: rowColor(t, 'value') }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: tokens.space.md,
  },
  label: {
    ...tokens.type.caption,
  },
  value: {
    ...tokens.type.bodyStrong,
    fontFamily: tokens.font.mono,
  },
});
