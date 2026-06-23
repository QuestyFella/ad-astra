import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '../../theme/tokens';
import type { Theme } from '../../theme/colors';

interface GroupedSectionProps {
  theme: Theme;
  title?: string;
  footer?: string;
  children: React.ReactNode;
}

/** iOS-style inset grouped container. */
export function GroupedSection({
  theme,
  title,
  footer,
  children,
}: GroupedSectionProps) {
  return (
    <View style={styles.section}>
      {title ? (
        <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>
          {title.toUpperCase()}
        </Text>
      ) : null}
      <View
        style={[
          styles.group,
          { backgroundColor: theme.card, borderColor: theme.hairline },
        ]}
      >
        {children}
      </View>
      {footer ? (
        <Text style={[styles.footer, { color: theme.textMuted }]}>{footer}</Text>
      ) : null}
    </View>
  );
}

interface ListGroupProps {
  theme: Theme;
  title?: string;
  children: React.ReactNode;
  footer?: string;
}

/** Grouped list built from ListRow children. */
export function ListGroup({ theme, title, children, footer }: ListGroupProps) {
  const items = React.Children.toArray(children);

  return (
    <GroupedSection theme={theme} title={title} footer={footer}>
      {items.map((child, i) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<ListRowInjected>, {
              theme,
              last: i === items.length - 1,
            })
          : child,
      )}
    </GroupedSection>
  );
}

interface ListRowInjected {
  theme?: Theme;
  last?: boolean;
}

interface ListRowProps extends ListRowInjected {
  label: string;
  value?: string;
  detail?: string;
  right?: React.ReactNode;
}

export function ListRow({
  label,
  value,
  detail,
  right,
  theme,
  last,
}: ListRowProps) {
  if (!theme) return null;

  return (
    <View
      style={[
        styles.row,
        !last && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.hairlineSoft,
        },
      ]}
    >
      <View style={styles.rowMain}>
        <Text style={[styles.label, { color: theme.ink }]}>{label}</Text>
        {detail ? (
          <Text style={[styles.detail, { color: theme.textMuted }]}>{detail}</Text>
        ) : null}
      </View>
      {right ?? (value ? (
        <Text style={[styles.value, { color: theme.textMuted }]}>{value}</Text>
      ) : null)}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: tokens.space.lg,
  },
  sectionTitle: {
    ...tokens.type.captionStrong,
    marginBottom: tokens.space.xs,
    marginLeft: tokens.space.xxs,
    letterSpacing: 0.4,
  },
  group: {
    borderRadius: tokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  footer: {
    ...tokens.type.caption,
    marginTop: tokens.space.xs,
    marginLeft: tokens.space.xxs,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: tokens.space.md,
    paddingHorizontal: tokens.space.lg,
    minHeight: 44,
  },
  rowMain: {
    flex: 1,
    paddingRight: tokens.space.sm,
  },
  label: {
    ...tokens.type.body,
  },
  detail: {
    ...tokens.type.caption,
    marginTop: 2,
  },
  value: {
    ...tokens.type.body,
  },
});
