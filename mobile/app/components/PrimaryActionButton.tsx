import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import type { ThemeMode } from '../theme/colors';
import { getTheme } from '../theme/colors';

interface PrimaryActionButtonProps {
  label: string;
  theme: ThemeMode;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
}

export function PrimaryActionButton({
  label,
  theme,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
}: PrimaryActionButtonProps) {
  const t = getTheme(theme);

  const bgColor =
    variant === 'primary'
      ? t.accent
      : variant === 'danger'
        ? t.danger
        : 'transparent';

  const textColor =
    variant === 'secondary' ? t.accent : '#FFFFFF';

  const borderColor = variant === 'secondary' ? t.accent : 'transparent';

  return (
    <TouchableOpacity
      style={[
        styles.button,
        {
          backgroundColor: disabled ? t.cardBorder : bgColor,
          borderColor: disabled ? t.cardBorder : borderColor,
          borderWidth: variant === 'secondary' ? 1.5 : 0,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
