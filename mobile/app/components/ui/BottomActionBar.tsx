import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Theme } from '../../theme/colors';
import { tokens } from '../../theme/tokens';

interface BottomActionBarProps {
  theme: Theme;
  children: React.ReactNode;
}

/** Sticky bottom action area for primary screen CTAs. */
export function BottomActionBar({ theme, children }: BottomActionBarProps) {
  return (
    <SafeAreaView
      edges={['bottom']}
      style={[
        styles.bar,
        {
          backgroundColor: theme.canvasSoft,
          borderTopColor: theme.hairlineSoft,
        },
      ]}
    >
      <View style={styles.actions}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.sm,
  },
  actions: {
    gap: tokens.space.sm,
  },
});
