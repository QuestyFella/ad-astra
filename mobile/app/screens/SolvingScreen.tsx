import React, { useEffect, useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SolvingScreenProps } from '../types/navigation';
import { ThemeContext } from '../navigation/AppNavigator';
import { getTheme } from '../theme/colors';
import { SolverStepper } from '../components/SolverStepper';
import { useSolver } from '../store/solver';

export function SolvingScreen({ navigation, route }: SolvingScreenProps) {
  const { imageUri } = route.params;
  const { theme } = useContext(ThemeContext);
  const t = getTheme(theme);
  const { state, currentStep, result, startSolve, cancel } = useSolver();

  useEffect(() => {
    startSolve(imageUri);
  }, []);

  useEffect(() => {
    if (state === 'solved' && result) {
      const timer = setTimeout(() => {
        navigation.replace('Result', { imageUri });
      }, 600);
      return () => clearTimeout(timer);
    }
    if (state === 'cancelled') {
      navigation.goBack();
    }
  }, [state, result]);

  const elapsed = result ? `${(result.solveTimeMs / 1000).toFixed(1)}s` : '…';
  const detectedCount = result?.detectedStars.length ?? '…';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text }]}>SOLVING</Text>
        <Text style={[styles.subtitle, { color: t.textMuted }]}>
          Matching star patterns against catalog
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
        <SolverStepper
          currentStep={currentStep}
          solverState={state}
          theme={theme}
        />
      </View>

      <View style={[styles.statsRow, { borderColor: t.cardBorder }]}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: t.text }]}>{detectedCount}</Text>
          <Text style={[styles.statLabel, { color: t.textMuted }]}>Stars detected</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: t.text }]}>{elapsed}</Text>
          <Text style={[styles.statLabel, { color: t.textMuted }]}>Elapsed</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.cancelButton, { borderColor: t.cardBorder }]}
        onPress={cancel}
      >
        <Text style={[styles.cancelText, { color: t.textMuted }]}>Cancel</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  header: {
    marginBottom: 28,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 6,
    fontFamily: 'Courier',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
    fontFamily: 'Courier',
  },
  card: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 28,
  },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 20,
    marginBottom: 28,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'Courier',
  },
  statLabel: {
    fontSize: 11,
    fontFamily: 'Courier',
    textTransform: 'uppercase',
    marginTop: 4,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 14,
    borderWidth: 1,
    borderRadius: 10,
  },
  cancelText: {
    fontSize: 14,
    fontFamily: 'Courier',
  },
});
