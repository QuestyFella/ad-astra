import React, { useContext } from 'react';
import { View, Text, StyleSheet, Switch, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { AboutScreenProps } from '../types/navigation';
import { ThemeContext } from '../navigation/AppNavigator';
import { getTheme } from '../theme/colors';
import { isSolverReady, getDatabaseSize } from '../utils/solver';

export function AboutScreen({}: AboutScreenProps) {
  const { theme, nightMode, setNightMode } = useContext(ThemeContext);
  const t = getTheme(theme);

  const dbReady = isSolverReady();
  const dbSize = getDatabaseSize();
  const dbSizeLabel = dbSize ? `${(dbSize / 1024 / 1024).toFixed(1)} MB` : '—';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['bottom']}>
      <StatusBar style={t.statusBar} />
      <View style={styles.header}>
        <Text style={[styles.appName, { color: t.text }]}>Ad Astra</Text>
        <Text style={[styles.tagline, { color: t.textMuted }]}>
          Offline star identification
        </Text>
      </View>

      <View style={styles.section}>
        <View style={[styles.row, { borderBottomColor: t.cardBorder }]}>
          <Text style={[styles.rowLabel, { color: t.text }]}>Night mode</Text>
          <Switch
            value={nightMode}
            onValueChange={setNightMode}
            trackColor={{ false: t.cardBorder, true: t.accentDim }}
            thumbColor={nightMode ? t.accent : t.textMuted}
          />
        </View>
        <View style={[styles.row, { borderBottomColor: t.cardBorder }]}>
          <Text style={[styles.rowLabel, { color: t.text }]}>Star catalog</Text>
          <Text style={[styles.rowValue, { color: dbReady ? t.success : t.textMuted }]}>
            {dbReady ? 'Loaded' : 'Not loaded'}
          </Text>
        </View>
        <View style={[styles.row, { borderBottomColor: t.cardBorder }]}>
          <Text style={[styles.rowLabel, { color: t.text }]}>Catalog size</Text>
          <Text style={[styles.rowValue, { color: t.textMuted }]}>
            {dbSizeLabel}
          </Text>
        </View>
        <View style={[styles.row, { borderBottomColor: t.cardBorder }]}>
          <Text style={[styles.rowLabel, { color: t.text }]}>Solver</Text>
          <Text style={[styles.rowValue, { color: dbReady ? t.success : t.textMuted }]}>
            {dbReady ? 'Ready' : 'Offline'}
          </Text>
        </View>
      </View>

      <View style={styles.aboutSection}>
        <Text style={[styles.aboutText, { color: t.textMuted }]}>
          Ad Astra identifies celestial coordinates from a single sky photo —
          no internet required.{'\n\n'}
          Built on the Hipparcos / Tycho-2 star catalogs and a custom Rust
          plate-solving engine.
        </Text>
        <Text
          style={[styles.link, { color: t.accent }]}
          onPress={() => Linking.openURL('https://github.com/esa/tetra3')}
        >
          Learn more ↗
        </Text>
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: t.textMuted }]}>Version 0.1.0</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  header: {
    marginTop: 24,
    marginBottom: 32,
    alignItems: 'center',
  },
  appName: {
    fontSize: 30,
    fontWeight: '700',
  },
  tagline: {
    fontSize: 15,
    marginTop: 4,
  },
  section: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: {
    fontSize: 17,
  },
  rowValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  aboutSection: {
    marginTop: 32,
    paddingHorizontal: 8,
  },
  aboutText: {
    fontSize: 15,
    lineHeight: 24,
  },
  link: {
    fontSize: 15,
    marginTop: 16,
    fontWeight: '600',
  },
  footer: {
    marginTop: 'auto',
    marginBottom: 16,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
  },
});
