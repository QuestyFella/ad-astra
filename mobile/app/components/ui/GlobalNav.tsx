import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '../../theme/tokens';

interface GlobalNavProps {
  title?: string;
  right?: React.ReactNode;
}

/** `{component.global-nav}` — 44px black bar, nav-link typography. */
export function GlobalNav({ title = 'Ad Astra', right }: GlobalNavProps) {
  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.bar}>
        <Text style={styles.title}>{title}</Text>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: tokens.color.surfaceBlack,
  },
  bar: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.space.lg,
    backgroundColor: tokens.color.surfaceBlack,
  },
  title: {
    ...tokens.type.navLink,
    color: tokens.color.onDark,
  },
  right: {
    position: 'absolute',
    right: tokens.space.lg,
  },
});
