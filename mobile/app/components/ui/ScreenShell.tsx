import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { Theme } from '../../theme/colors';
import { tokens } from '../../theme/tokens';

interface ScreenShellProps {
  theme: Theme;
  children: React.ReactNode;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}

/** Standard mobile screen container with safe area and theme background. */
export function ScreenShell({
  theme,
  children,
  edges = ['top'],
  style,
  padded = true,
}: ScreenShellProps) {
  return (
    <SafeAreaView
      edges={edges}
      style={[styles.root, { backgroundColor: theme.canvasSoft }, style]}
    >
      <StatusBar style={theme.statusBar} />
      <View style={[styles.inner, padded && styles.padded]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  inner: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: tokens.space.lg,
  },
});
