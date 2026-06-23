import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '../../theme/tokens';
import type { Theme } from '../../theme/colors';

interface SubNavProps {
  title: string;
  theme: Theme;
  right?: React.ReactNode;
}

/** `{component.sub-nav-frosted}` — parchment strip with tagline typography. */
export function SubNav({ title, theme, right }: SubNavProps) {
  return (
    <View style={[styles.bar, { backgroundColor: theme.canvasSoft }]}>
      <Text style={[styles.title, { color: theme.ink }]}>{title}</Text>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.08)',
  },
  title: {
    ...tokens.type.tagline,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.sm,
  },
});
