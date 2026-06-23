import React, { useEffect, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native';
import type { SolvingScreenProps } from '../types/navigation';
import { ThemeContext } from '../navigation/AppNavigator';
import { getTheme } from '../theme/colors';
import { tokens } from '../theme/tokens';
import { useSolver } from '../store/SolverProvider';
import { STEP_ORDER, STEP_LABELS } from '../types/solver';
import { useHideTabBar } from '../navigation/useHideTabBar';
import {
  ScreenShell,
  ScreenHeader,
  GroupedSection,
  ListGroup,
  ListRow,
} from '../components/ui';

export function SolvingScreen({ navigation, route }: SolvingScreenProps) {
  const { imageUri } = route.params;
  const { theme } = useContext(ThemeContext);
  const t = getTheme(theme);
  const { state, currentStep, result, startSolve, cancel } = useSolver();

  useHideTabBar(navigation, t);

  useEffect(() => {
    startSolve(imageUri);
  }, []);

  useEffect(() => {
    if (state === 'solved' && result) {
      const timer = setTimeout(() => {
        navigation.replace('Result', { imageUri });
      }, 500);
      return () => clearTimeout(timer);
    }
    if (state === 'cancelled') {
      navigation.goBack();
    }
  }, [state, result]);

  const elapsed = result ? `${(result.solveTimeMs / 1000).toFixed(1)}s` : '—';
  const detectedCount =
    result?.detectedStars.length != null
      ? String(result.detectedStars.length)
      : '—';

  const currentIdx = STEP_ORDER.indexOf(currentStep);
  const activeIdx = state === 'solved' ? STEP_ORDER.length : currentIdx;

  return (
    <ScreenShell theme={t} edges={['top', 'bottom']}>
      <ScreenHeader
        theme={t}
        title="Solving"
        subtitle="Matching star patterns against the catalog"
        compact
        rightAction={{ label: 'Cancel', onPress: cancel }}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.preview,
            { backgroundColor: t.surfaceDark, borderColor: t.hairline },
          ]}
        >
          <Image source={{ uri: imageUri }} style={styles.previewImage} />
        </View>

        <GroupedSection theme={t} title="Progress">
          {STEP_ORDER.map((step, idx) => {
            const isComplete = idx < activeIdx;
            const isActive = idx === activeIdx && state !== 'solved';

            return (
              <View
                key={step}
                style={[
                  styles.progressRow,
                  idx < STEP_ORDER.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: t.hairlineSoft,
                  },
                ]}
              >
                <View
                  style={[
                    styles.stepBadge,
                    {
                      backgroundColor:
                        isComplete || isActive ? t.primary : t.surfaceStrong,
                    },
                  ]}
                >
                  {isComplete ? (
                    <Text style={[styles.stepIcon, { color: t.onPrimary }]}>
                      ✓
                    </Text>
                  ) : isActive ? (
                    <ActivityIndicator size="small" color={t.onPrimary} />
                  ) : (
                    <Text style={[styles.stepIcon, { color: t.textMuted }]}>
                      {idx + 1}
                    </Text>
                  )}
                </View>
                <View style={styles.stepText}>
                  <Text
                    style={[
                      styles.stepLabel,
                      {
                        color: isComplete || isActive ? t.ink : t.textMuted,
                        fontWeight: isActive ? '600' : '400',
                      },
                    ]}
                  >
                    {STEP_LABELS[step]}
                  </Text>
                  {isActive && (
                    <Text style={[styles.stepHint, { color: t.textMuted }]}>
                      Working…
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </GroupedSection>

        <ListGroup theme={t} title="Live stats">
          <ListRow label="Stars found" value={detectedCount} />
          <ListRow label="Elapsed" value={elapsed} />
        </ListGroup>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: tokens.space.xxl,
  },
  preview: {
    height: 160,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
    marginBottom: tokens.space.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  previewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tokens.space.md,
    paddingHorizontal: tokens.space.lg,
    minHeight: 52,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: tokens.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: tokens.space.md,
  },
  stepIcon: {
    ...tokens.type.captionStrong,
  },
  stepText: {
    flex: 1,
  },
  stepLabel: {
    ...tokens.type.body,
  },
  stepHint: {
    ...tokens.type.caption,
    marginTop: 2,
  },
});
