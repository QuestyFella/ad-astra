import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { tokens } from '../../theme/tokens';
import type { Theme } from '../../theme/colors';

interface UtilityCardProps {
  theme: Theme;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** `{component.store-utility-card}` — hairline border, lg radius, no shadow. */
export function UtilityCard({ theme, children, style }: UtilityCardProps) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.hairline },
        style,
      ]}
    >
      {children}
    </View>
  );
}

interface UtilityCardHeaderProps {
  label: string;
  theme: Theme;
}

export function UtilityCardHeader({ label, theme }: UtilityCardHeaderProps) {
  return (
    <Text style={[styles.header, { color: theme.textMuted }]}>{label}</Text>
  );
}

interface UtilityRowProps {
  label: string;
  value: string;
  theme: Theme;
  last?: boolean;
}

export function UtilityRow({ label, value, theme, last }: UtilityRowProps) {
  return (
    <View
      style={[
        styles.row,
        !last && { borderBottomColor: theme.hairlineSoft, borderBottomWidth: 1 },
      ]}
    >
      <Text style={[styles.rowLabel, { color: theme.ink }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: theme.ink }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 520,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    padding: tokens.space.lg,
  },
  header: {
    ...tokens.type.captionStrong,
    marginBottom: tokens.space.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: tokens.space.sm,
  },
  rowLabel: {
    ...tokens.type.body,
  },
  rowValue: {
    ...tokens.type.body,
  },
});
