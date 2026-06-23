import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { PressableScale } from './PressableScale';
import { tokens } from '../../theme/tokens';

interface ButtonSecondaryPillProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
}

/** `{component.button-secondary-pill}` — ghost pill with primary border. */
export function ButtonSecondaryPill({
  label,
  onPress,
  disabled,
  fullWidth,
}: ButtonSecondaryPillProps) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.base,
        disabled && styles.baseDisabled,
        fullWidth && styles.fullWidth,
      ]}
    >
      <Text style={[styles.label, disabled && styles.labelDisabled]}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: tokens.color.canvas,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.primary,
    paddingVertical: 11,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  baseDisabled: {
    borderColor: tokens.color.hairline,
  },
  fullWidth: {
    width: '100%',
  },
  label: {
    ...tokens.type.body,
    color: tokens.color.primary,
  },
  labelDisabled: {
    color: tokens.color.inkMuted48,
  },
});
