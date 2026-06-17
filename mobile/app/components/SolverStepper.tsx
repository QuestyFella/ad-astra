import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { SolverStep, SolverState } from '../types/solver';
import { STEP_ORDER, STEP_LABELS } from '../types/solver';
import type { ThemeMode } from '../theme/colors';
import { getTheme } from '../theme/colors';

interface SolverStepperProps {
  currentStep: SolverStep;
  solverState: SolverState;
  theme: ThemeMode;
}

export function SolverStepper({ currentStep, solverState, theme }: SolverStepperProps) {
  const t = getTheme(theme);
  const currentIdx = STEP_ORDER.indexOf(currentStep);

  return (
    <View style={styles.container}>
      {STEP_ORDER.map((step, idx) => {
        const isComplete =
          idx < currentIdx ||
          (solverState === 'solved' && idx <= currentIdx);
        const isActive = idx === currentIdx && !isComplete;
        const isPending = idx > currentIdx && solverState !== 'solved';

        let statusColor: string = t.textMuted;
        let icon = '○';
        if (isComplete) {
          statusColor = t.success;
          icon = '●';
        } else if (isActive) {
          statusColor = t.accent;
          icon = '◉';
        }

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
              <Text style={[styles.icon, { color: statusColor }]}>{icon}</Text>
            </View>
            <View style={styles.stepContent}>
              <Text
                style={[
                  styles.label,
                  {
                    color: isPending ? t.textMuted : t.text,
                    fontWeight: isActive ? '700' : '400',
                  },
                ]}
              >
                {STEP_LABELS[step]}
              </Text>
              {isActive && (
                <Text style={[styles.running, { color: t.accent }]}>running…</Text>
              )}
              {isComplete && (
                <Text style={[styles.done, { color: t.success }]}>done</Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  stepIndicator: {
    width: 32,
    alignItems: 'center',
  },
  connector: {
    width: 2,
    height: 12,
    marginBottom: 2,
  },
  icon: {
    fontSize: 18,
    fontFamily: 'Courier',
  },
  stepContent: {
    flex: 1,
    paddingTop: 1,
  },
  label: {
    fontSize: 15,
  },
  running: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
  },
  done: {
    fontSize: 12,
    marginTop: 2,
  },
});
