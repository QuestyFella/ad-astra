import React, { useEffect, useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SolvingScreenProps } from '../types/navigation';
import { ThemeContext } from '../navigation/AppNavigator';
import { getTheme } from '../theme/colors';
import { useSolver } from '../store/solver';
import { STEP_ORDER, STEP_LABELS } from '../types/solver';

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

  const currentIdx = STEP_ORDER.indexOf(currentStep);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]}>
      <View style={styles.header}>
        <ActivityIndicator size="large" color={t.accent} />
        <Text style={[styles.title, { color: t.text }]}>Solving…</Text>
        <Text style={[styles.subtitle, { color: t.textMuted }]}>
          Matching star patterns
        </Text>
      </View>

      <View style={styles.steps}>
        {STEP_ORDER.map((step, idx) => {
          const isComplete = idx < currentIdx || (state === 'solved' && idx <= currentIdx);
          const isActive = idx === currentIdx && state !== 'solved';

          return (
            <View key={step} style={styles.stepRow}>
              <View style={styles.stepIndicator}>
                {idx > 0 && (
                  <View
                    style={[
                      styles.connector,
                      { backgroundColor: isComplete ? t.success : t.cardBorder },
                    ]}
                  />
                )}
                {isComplete ? (
                  <View style={[styles.dot, { backgroundColor: t.success }]} />
                ) : isActive ? (
                  <View style={[styles.dot, { backgroundColor: t.accent }]}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  </View>
                ) : (
                  <View style={[styles.dot, { backgroundColor: t.cardBorder }]} />
                )}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  {
                    color: isComplete ? t.text : isActive ? t.text : t.textMuted,
                    fontWeight: isActive ? '700' : '500',
                  },
                ]}
              >
                {STEP_LABELS[step]}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={[styles.statsRow, { borderColor: t.cardBorder }]}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: t.text }]}>{detectedCount}</Text>
          <Text style={[styles.statLabel, { color: t.textMuted }]}>Stars found</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: t.cardBorder }]} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: t.text }]}>{elapsed}</Text>
          <Text style={[styles.statLabel, { color: t.textMuted }]}>Elapsed</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.cancelBtn, { borderColor: t.cardBorder }]}
        onPress={cancel}
        activeOpacity={0.7}
      >
        <Text style={[styles.cancelText, { color: t.textMuted }]}>Cancel</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 15,
    marginTop: 4,
  },
  steps: {
    marginBottom: 48,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
  },
  stepIndicator: {
    width: 40,
    alignItems: 'center',
    marginRight: 12,
  },
  connector: {
    width: 2,
    height: 16,
    marginBottom: 4,
  },
  dot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: {
    fontSize: 17,
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingVertical: 24,
    marginBottom: 24,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 36,
  },
  statValue: {
    fontSize: 32,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 13,
    marginTop: 4,
  },
  cancelBtn: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
