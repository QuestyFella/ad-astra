import React, { useContext } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CatalogScreenProps } from '../types/navigation';
import { ThemeContext } from '../navigation/AppNavigator';
import { getTheme } from '../theme/colors';
import { CatalogCard } from '../components/CatalogCard';
import type { CatalogInfo } from '../types/solver';

const MOCK_CATALOGS: CatalogInfo[] = [
  {
    id: 'hipparcos-8.5',
    name: 'Hipparcos Bright',
    maxMag: 8.5,
    sizeMb: 3.8,
    installed: true,
    version: '1.0.0',
    starCount: 48230,
  },
  {
    id: 'hipparcos-10.0',
    name: 'Hipparcos Deep',
    maxMag: 10.0,
    sizeMb: 12.4,
    installed: false,
    version: '1.0.0',
    starCount: 118218,
  },
  {
    id: 'tycho-8.5',
    name: 'Tycho-2 Wide',
    maxMag: 8.5,
    sizeMb: 28.1,
    installed: false,
    version: '1.0.0',
    starCount: 340000,
  },
  {
    id: 'tycho-10.5',
    name: 'Tycho-2 Deep',
    maxMag: 10.5,
    sizeMb: 68.5,
    installed: false,
    version: '1.0.0',
    starCount: 2500000,
  },
];

export function CatalogScreen({}: CatalogScreenProps) {
  const { theme } = useContext(ThemeContext);
  const t = getTheme(theme);

  const installed = MOCK_CATALOGS.filter((c) => c.installed);
  const available = MOCK_CATALOGS.filter((c) => !c.installed);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: t.text }]}>OFFLINE CATALOGS</Text>
          <Text style={[styles.subtitle, { color: t.textMuted }]}>
            Star databases bundled for offline solving
          </Text>
        </View>

        {installed.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: t.textMuted }]}>INSTALLED</Text>
            {installed.map((cat) => (
              <CatalogCard key={cat.id} catalog={cat} theme={theme} />
            ))}
          </View>
        )}

        {available.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: t.textMuted }]}>AVAILABLE</Text>
            {available.map((cat) => (
              <CatalogCard key={cat.id} catalog={cat} theme={theme} />
            ))}
          </View>
        )}

        <View style={[styles.note, { borderColor: t.cardBorder }]}>
          <Text style={[styles.noteText, { color: t.textMuted }]}>
            Catalogs are built from Hipparcos and Tycho-2 data.
            Install larger catalogs for fainter stars and better coverage.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    padding: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 4,
    fontFamily: 'Courier',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
    fontFamily: 'Courier',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Courier',
    letterSpacing: 2,
    marginBottom: 12,
  },
  note: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
    marginTop: 8,
  },
  noteText: {
    fontSize: 13,
    lineHeight: 20,
  },
});
