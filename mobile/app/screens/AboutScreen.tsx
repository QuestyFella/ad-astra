import React, { useContext } from 'react';
import { Text, StyleSheet, Switch, Linking, ScrollView } from 'react-native';
import type { AboutScreenProps } from '../types/navigation';
import { ThemeContext } from '../navigation/AppNavigator';
import { getTheme } from '../theme/colors';
import { tokens } from '../theme/tokens';
import { isSolverReady, getDatabaseSize } from '../utils/solver';
import {
  ScreenShell,
  ScreenHeader,
  ListGroup,
  ListRow,
  TextLink,
} from '../components/ui';

export function AboutScreen({}: AboutScreenProps) {
  const { theme, nightMode, setNightMode } = useContext(ThemeContext);
  const t = getTheme(theme);

  const dbReady = isSolverReady();
  const dbSize = getDatabaseSize();
  const dbSizeLabel = dbSize ? `${(dbSize / 1024 / 1024).toFixed(1)} MB` : '—';

  return (
    <ScreenShell theme={t} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          theme={t}
          title="About"
          subtitle="Offline plate solving on your device."
        />

        <ListGroup theme={t} title="Appearance">
          <ListRow
            label="Dark mode"
            right={
              <Switch
                value={nightMode}
                onValueChange={setNightMode}
                trackColor={{ false: t.hairline, true: t.primary }}
                thumbColor={tokens.color.canvas}
              />
            }
          />
        </ListGroup>

        <ListGroup
          theme={t}
          title="Solver"
          footer="Requires the .adb star catalog on device."
        >
          <ListRow
            label="Star catalog"
            value={dbReady ? 'Loaded' : 'Not loaded'}
          />
          <ListRow label="Catalog size" value={dbSizeLabel} />
          <ListRow label="Engine" value={dbReady ? 'Ready' : 'Offline'} />
        </ListGroup>

        <ListGroup theme={t} title="Credits">
          <ListRow
            label="Ad Astra"
            detail="Hipparcos / Tycho-2 catalogs with a custom Rust solver."
          />
        </ListGroup>

        <TextLink
          label="Tetra3 reference ↗"
          onPress={() => Linking.openURL('https://github.com/esa/tetra3')}
          theme={t}
          style={styles.link}
        />

        <Text style={[styles.version, { color: t.textMuted }]}>
          Ad Astra v0.1.0
        </Text>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingBottom: tokens.space.xxl,
  },
  link: {
    marginTop: tokens.space.xs,
    marginLeft: tokens.space.xxs,
  },
  version: {
    ...tokens.type.finePrint,
    textAlign: 'center',
    marginTop: tokens.space.xl,
  },
});
