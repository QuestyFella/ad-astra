import React, { useContext } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SettingsScreenProps } from '../types/navigation';
import { ThemeContext } from '../navigation/AppNavigator';
import { getTheme } from '../theme/colors';

export function SettingsScreen({}: SettingsScreenProps) {
  const { theme, nightMode, setNightMode } = useContext(ThemeContext);
  const t = getTheme(theme);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: t.text }]}>SETTINGS</Text>
        </View>

        <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
          <View style={[styles.row, { borderBottomColor: t.cardBorder }]}>
            <Text style={[styles.label, { color: t.text }]}>Night mode</Text>
            <Switch
              value={nightMode}
              onValueChange={setNightMode}
              trackColor={{ false: t.cardBorder, true: t.accentDim }}
              thumbColor={nightMode ? t.accent : t.textMuted}
            />
          </View>
          <View style={[styles.row, { borderBottomColor: t.cardBorder }]}>
            <Text style={[styles.label, { color: t.text }]}>Show debug overlay</Text>
            <Switch
              value={false}
              trackColor={{ false: t.cardBorder, true: t.accentDim }}
              thumbColor={t.textMuted}
            />
          </View>
          <View style={[styles.row, { borderBottomColor: t.cardBorder }]}>
            <Text style={[styles.label, { color: t.text }]}>Save solve history</Text>
            <Switch
              value={true}
              trackColor={{ false: t.cardBorder, true: t.accentDim }}
              thumbColor={t.accent}
            />
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
          <View style={[styles.row, { borderBottomColor: t.cardBorder }]}>
            <Text style={[styles.label, { color: t.text }]}>Max solve time</Text>
            <Text style={[styles.value, { color: t.textMuted }]}>5.0 s</Text>
          </View>
          <View style={[styles.row, { borderBottomColor: t.cardBorder }]}>
            <Text style={[styles.label, { color: t.text }]}>Minimum stars</Text>
            <Text style={[styles.value, { color: t.textMuted }]}>10</Text>
          </View>
          <View style={[styles.row, { borderBottomColor: t.cardBorder }]}>
            <Text style={[styles.label, { color: t.text }]}>Default catalog</Text>
            <Text style={[styles.value, { color: t.textMuted }]}>Hipparcos ≤ 8.5</Text>
          </View>
          <View style={[styles.row, { borderBottomColor: t.cardBorder }]}>
            <Text style={[styles.label, { color: t.text }]}>Coordinate format</Text>
            <Text style={[styles.value, { color: t.textMuted }]}>Sexagesimal</Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
          <View style={[styles.row, { borderBottomColor: t.cardBorder }]}>
            <Text style={[styles.label, { color: t.text }]}>App version</Text>
            <Text style={[styles.value, { color: t.textMuted }]}>0.1.0</Text>
          </View>
          <View style={[styles.row, { borderBottomColor: t.cardBorder }]}>
            <Text style={[styles.label, { color: t.text }]}>Solver engine</Text>
            <Text style={[styles.value, { color: t.textMuted }]}>Mock v0.1</Text>
          </View>
          <View style={[styles.row, { borderBottomColor: t.cardBorder }]}>
            <Text style={[styles.label, { color: t.text }]}>Index format</Text>
            <Text style={[styles.value, { color: t.textMuted }]}>ASTR v1</Text>
          </View>
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
  card: {
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 15,
  },
  value: {
    fontSize: 14,
    fontFamily: 'Courier',
  },
});
