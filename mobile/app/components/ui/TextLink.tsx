import React from 'react';
import { Text, StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { PressableScale } from './PressableScale';
import { tokens } from '../../theme/tokens';
import type { Theme } from '../../theme/colors';

interface TextLinkProps {
  label: string;
  onPress: () => void;
  theme: Theme;
  onDark?: boolean;
  style?: StyleProp<TextStyle>;
}

/** `{component.text-link}` / `{component.text-link-on-dark}`. */
export function TextLink({ label, onPress, theme, onDark, style }: TextLinkProps) {
  const color = onDark ? theme.linkBright : theme.primary;

  return (
    <PressableScale onPress={onPress} style={styles.hit}>
      <Text style={[styles.label, { color }, style]}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  hit: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  label: {
    ...tokens.type.body,
  },
});
