import React, { useContext, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Share,
  Dimensions,
} from 'react-native';
import type { ResultScreenProps } from '../types/navigation';
import { ThemeContext } from '../navigation/AppNavigator';
import { getTheme } from '../theme/colors';
import { tokens } from '../theme/tokens';
import { CoordinateReadout } from '../components/CoordinateReadout';
import { StarMarkerLayer } from '../components/StarMarkerLayer';
import { useSolver } from '../store/SolverProvider';
import { useHideTabBar } from '../navigation/useHideTabBar';
import {
  ScreenShell,
  ScreenHeader,
  GroupedSection,
  BottomActionBar,
  ButtonPrimary,
  ButtonSecondaryPill,
  PressableScale,
} from '../components/ui';

const IMAGE_WIDTH = Dimensions.get('window').width - tokens.space.lg * 2;
const IMAGE_HEIGHT = 240;

export function ResultScreen({ navigation, route }: ResultScreenProps) {
  const { imageUri } = route.params;
  const { theme } = useContext(ThemeContext);
  const t = getTheme(theme);
  const { result, reset } = useSolver();
  const [showOverlay, setShowOverlay] = useState(true);

  useHideTabBar(navigation, t);

  const isSample = imageUri === 'sample';

  const handleShare = async () => {
    if (!result) return;
    const ra = result.raDeg?.toFixed(4) ?? '—';
    const dec = result.decDeg?.toFixed(4) ?? '—';
    await Share.share({
      message: `Ad Astra result\nRA: ${ra}°\nDec: ${dec}°\nFOV: ${result.fovXDeg?.toFixed(1)}° × ${result.fovYDeg?.toFixed(1)}°`,
    });
  };

  const handleNewPhoto = () => {
    reset();
    navigation.popToTop();
  };

  if (!result) {
    return (
      <ScreenShell theme={t} edges={['top', 'bottom']}>
        <ScreenHeader theme={t} title="Result" compact />
        <Text style={[styles.emptyText, { color: t.textMuted }]}>
          No result available
        </Text>
      </ScreenShell>
    );
  }

  const success = result.success;

  return (
    <ScreenShell theme={t} edges={['top']} padded={false}>
      <View style={styles.body}>
        <View style={styles.pad}>
          <ScreenHeader
            theme={t}
            title={success ? 'Solved' : 'No match'}
            subtitle={
              success
                ? `${result.matchedStars} stars matched · ${(result.solveTimeMs / 1000).toFixed(1)}s`
                : 'Try a darker sky with more visible stars.'
            }
            compact
          />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.pad}>
            <View
              style={[
                styles.imageFrame,
                { backgroundColor: t.surfaceDark, borderColor: t.hairline },
              ]}
            >
              {isSample ? (
                <View
                  style={[
                    styles.placeholder,
                    { backgroundColor: tokens.color.surfaceTile3 },
                  ]}
                >
                  <Text style={[styles.placeholderText, { color: t.onDarkSoft }]}>
                    Sample
                  </Text>
                </View>
              ) : (
                <View style={styles.imageWrap}>
                  <Image
                    source={{ uri: imageUri }}
                    style={styles.image}
                    resizeMode="contain"
                  />
                  {showOverlay && success && (
                    <StarMarkerLayer
                      imageWidth={result.imageWidth}
                      imageHeight={result.imageHeight}
                      displayWidth={IMAGE_WIDTH}
                      displayHeight={IMAGE_HEIGHT}
                      detectedStars={result.detectedStars}
                      matchedStars={result.matchedStarPositions}
                    />
                  )}
                </View>
              )}

              {success && (
                <PressableScale
                  onPress={() => setShowOverlay(!showOverlay)}
                  style={[
                    styles.overlayToggle,
                    { backgroundColor: tokens.color.surfaceChipTranslucent },
                  ]}
                >
                  <Text style={[styles.overlayToggleText, { color: t.ink }]}>
                    {showOverlay ? 'Hide overlay' : 'Show overlay'}
                  </Text>
                </PressableScale>
              )}
            </View>

            {success ? (
              <GroupedSection theme={t} title="Coordinates">
                <View style={styles.coordsPad}>
                  <CoordinateReadout result={result} theme={t} />
                </View>
              </GroupedSection>
            ) : (
              <GroupedSection theme={t} title="Details">
                <View style={styles.coordsPad}>
                  <Text style={[styles.failedText, { color: t.textMuted }]}>
                    {result.log.length > 0
                      ? result.log[result.log.length - 1]
                      : 'Could not identify this star field.'}
                  </Text>
                </View>
              </GroupedSection>
            )}
          </View>
        </ScrollView>
      </View>

      <BottomActionBar theme={t}>
        <ButtonPrimary label="New Photo" onPress={handleNewPhoto} fullWidth />
        <ButtonSecondaryPill
          label="Share Result"
          onPress={handleShare}
          disabled={!success}
          fullWidth
        />
      </BottomActionBar>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  pad: {
    paddingHorizontal: tokens.space.lg,
  },
  scroll: {
    paddingBottom: tokens.space.lg,
  },
  emptyText: {
    ...tokens.type.body,
    textAlign: 'center',
    marginTop: tokens.space.xxl,
  },
  imageFrame: {
    height: IMAGE_HEIGHT + 24,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
    marginBottom: tokens.space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    position: 'relative',
  },
  imageWrap: {
    flex: 1,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: IMAGE_HEIGHT,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    ...tokens.type.bodyStrong,
  },
  overlayToggle: {
    position: 'absolute',
    bottom: tokens.space.sm,
    right: tokens.space.sm,
    borderRadius: tokens.radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
    minHeight: 32,
    justifyContent: 'center',
  },
  overlayToggleText: {
    ...tokens.type.caption,
  },
  coordsPad: {
    paddingHorizontal: tokens.space.lg,
    paddingBottom: tokens.space.xs,
  },
  failedText: {
    ...tokens.type.body,
    paddingVertical: tokens.space.md,
  },
});
