import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ThemeMode } from '../theme/colors';
import { getTheme } from '../theme/colors';

interface StatusCardProps {
  title: string;
  value: string;
  status: 'ready' | 'warning' | 'error';
  theme: ThemeMode;
}

export function StatusCard({ title, value, status, theme }: StatusCardProps) {
  const t = getTheme(theme);
  const dotColor =
    status === 'ready'
      ? t.success
      : status === 'warning'
        ? t.warning
        : t.danger;

  return (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <Text style={[styles.title, { color: t.textMuted }]}>{title}</Text>
      </View>
      <Text style={[styles.value, { color: t.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  title: {
    fontSize: 12,
    fontFamily: 'Courier',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  value: {
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 16,
  },
});
