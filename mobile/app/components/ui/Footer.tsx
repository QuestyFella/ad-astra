import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '../../theme/tokens';
import type { Theme } from '../../theme/colors';

interface FooterProps {
  theme: Theme;
  children?: React.ReactNode;
}

/** `{component.footer}` — parchment background, fine-print typography. */
export function Footer({ theme, children }: FooterProps) {
  return (
    <View style={[styles.footer, { backgroundColor: theme.canvasSoft }]}>
      {children ?? (
        <Text style={[styles.legal, { color: theme.muted }]}>
          Ad Astra v0.1.0
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    width: '100%',
    paddingVertical: tokens.space.xxl,
    paddingHorizontal: tokens.space.lg,
    alignItems: 'center',
  },
  legal: {
    ...tokens.type.finePrint,
    color: tokens.color.inkMuted48,
  },
});
