import React from 'react';
import { Switch, View, Text, StyleSheet } from 'react-native';
import type { ThemeMode } from '../theme/colors';
import { getTheme } from '../theme/colors';

interface NightModeToggleProps {
  value: boolean;
  theme: ThemeMode;
  onChange: (nightMode: boolean) => void;
}

export function NightModeToggle({ value, theme, onChange }: NightModeToggleProps) {
  const t = getTheme(theme);

  return (
    <View style={[styles.row, { borderBottomColor: t.cardBorder }]}>
      <Text style={[styles.label, { color: t.text }]}>Night mode</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: t.cardBorder, true: t.accentDim }}
        thumbColor={value ? t.accent : t.textMuted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 15,
  },
});
