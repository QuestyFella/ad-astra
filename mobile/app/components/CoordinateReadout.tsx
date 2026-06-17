import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { SolveResult } from '../types/solver';
import type { ThemeMode } from '../theme/colors';
import { getTheme } from '../theme/colors';

interface CoordinateReadoutProps {
  result: SolveResult;
  theme: ThemeMode;
}

function degToRA(deg: number): string {
  const totalHours = deg / 15;
  const h = Math.floor(totalHours);
  const m = Math.floor((totalHours - h) * 60);
  const s = ((totalHours - h) * 60 - m) * 60;
  return h + 'h ' + String(m).padStart(2, '0') + 'm ' + s.toFixed(1).padStart(4, '0') + 's';
}

function degToDec(deg: number): string {
  const sign = deg >= 0 ? '+' : '-';
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  const s = ((abs - d) * 60 - m) * 60;
  return sign + String(d).padStart(2, '0') + 'd ' + String(m).padStart(2, '0') + "' " + s.toFixed(1).padStart(4, '0') + '"';
}

export function CoordinateReadout({ result, theme }: CoordinateReadoutProps) {
  const t = getTheme(theme);

  if (!result.success || result.raDeg === null || result.decDeg === null) {
    return null;
  }

  const rows = [
    { label: 'Center RA', value: degToRA(result.raDeg), sub: result.raDeg.toFixed(4) + ' deg' },
    { label: 'Center Dec', value: degToDec(result.decDeg), sub: result.decDeg.toFixed(4) + ' deg' },
    {
      label: 'FOV',
      value: result.fovXDeg && result.fovYDeg
        ? result.fovXDeg.toFixed(1) + ' x ' + result.fovYDeg.toFixed(1) + ' deg'
        : '--',
    },
    {
      label: 'Rotation',
      value: result.rotationDeg !== null ? result.rotationDeg.toFixed(1) + ' deg' : '--',
    },
    { label: 'Confidence', value: result.confidence.toUpperCase() },
    { label: 'Matched stars', value: String(result.matchedStars) },
    { label: 'RMS error', value: result.rmsErrorPx.toFixed(1) + ' px' },
    { label: 'Solve time', value: (result.solveTimeMs / 1000).toFixed(2) + 's' },
  ];

  return (
    <View style={styles.container}>
      {rows.map((row) => (
        <View key={row.label} style={[styles.row, { borderBottomColor: t.cardBorder }]}>
          <Text style={[styles.label, { color: t.textMuted }]}>{row.label}</Text>
          <View style={styles.valueCol}>
            <Text style={[styles.value, { color: t.text }]}>{row.value}</Text>
            {row.sub ? (
              <Text style={[styles.sub, { color: t.textMuted }]}>{row.sub}</Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 12,
    fontFamily: 'Courier',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  valueCol: {
    alignItems: 'flex-end',
  },
  value: {
    fontSize: 16,
    fontFamily: 'Courier',
    fontWeight: '600',
  },
  sub: {
    fontSize: 11,
    fontFamily: 'Courier',
    marginTop: 2,
  },
});
