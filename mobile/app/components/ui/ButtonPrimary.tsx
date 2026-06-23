import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { PressableScale } from './PressableScale';
import { tokens } from '../../theme/tokens';

interface ButtonPrimaryProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  large?: boolean;
  fullWidth?: boolean;
}

/** `{component.button-primary}` / `{component.button-store-hero}`. */
export function ButtonPrimary({
  label,
  onPress,
  disabled,
  large,
  fullWidth,
}: ButtonPrimaryProps) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      style={[styles.base, large && styles.large, fullWidth && styles.fullWidth]}
    >
      <Text style={[styles.label, large && styles.labelLarge]}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: tokens.color.primary,
    borderRadius: tokens.radius.pill,
    paddingVertical: 11,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  large: {
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  fullWidth: {
    width: '100%',
  },
  label: {
    ...tokens.type.body,
    color: tokens.color.onPrimary,
  },
  labelLarge: {
    ...tokens.type.buttonLarge,
    color: tokens.color.onPrimary,
  },
});
