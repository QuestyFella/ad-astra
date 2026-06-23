import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '../../theme/tokens';
import type { Theme } from '../../theme/colors';
import { TextLink } from './TextLink';

interface ScreenHeaderProps {
  theme: Theme;
  title: string;
  subtitle?: string;
  rightAction?: { label: string; onPress: () => void };
  compact?: boolean;
}

/** iOS-style large title header for tab roots; compact for stack screens. */
export function ScreenHeader({
  theme,
  title,
  subtitle,
  rightAction,
  compact,
}: ScreenHeaderProps) {
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={styles.textCol}>
        <Text style={[compact ? styles.titleCompact : styles.title, { color: theme.ink }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>{subtitle}</Text>
        ) : null}
      </View>
      {rightAction ? (
        <TextLink
          label={rightAction.label}
          onPress={rightAction.onPress}
          theme={theme}
          style={styles.rightAction}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: tokens.space.sm,
    paddingBottom: tokens.space.lg,
  },
  wrapCompact: {
    paddingTop: tokens.space.xs,
    paddingBottom: tokens.space.md,
  },
  textCol: {
    flex: 1,
    paddingRight: tokens.space.sm,
  },
  title: {
    ...tokens.type.displayMd,
  },
  titleCompact: {
    ...tokens.type.tagline,
    fontSize: 21,
  },
  subtitle: {
    ...tokens.type.body,
    marginTop: tokens.space.xxs,
  },
  rightAction: {
    alignSelf: 'center',
  },
});
