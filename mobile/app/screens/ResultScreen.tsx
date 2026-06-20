import React, { useContext, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Dimensions,
  Share,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ResultScreenProps } from '../types/navigation';
import { ThemeContext } from '../navigation/AppNavigator';
import { getTheme } from '../theme/colors';
import { CoordinateReadout } from '../components/CoordinateReadout';
import { StarMarkerLayer } from '../components/StarMarkerLayer';
import { useSolver } from '../store/solver';

const SCREEN_WIDTH = Dimensions.get('window').width;

export function ResultScreen({ navigation, route }: ResultScreenProps) {
  const { imageUri } = route.params;
  const { theme } = useContext(ThemeContext);
  const t = getTheme(theme);
  const { result, reset } = useSolver();
  const [showOverlay, setShowOverlay] = useState(true);

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
      <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]}>
        <Text style={[styles.emptyText, { color: t.textMuted }]}>
          No result available
        </Text>
      </SafeAreaView>
    );
  }

  const success = result.success;
  const bannerColor = success ? t.successDim : t.danger;
  const bannerText = success ? 'Solved' : 'No match found';
  const accentColor = success ? t.success : t.danger;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Status banner */}
        <View style={[styles.banner, { backgroundColor: bannerColor }]}>
          <Text style={[styles.bannerText, { color: accentColor }]}>
            {success ? '✓' : '✕'} {bannerText}
          </Text>
          {success && (
            <Text style={[styles.bannerSub, { color: accentColor }]}>
              {result.matchedStars} stars matched
            </Text>
          )}
        </View>

        {/* Image with star overlay */}
        <View style={styles.imageContainer}>
          {isSample ? (
            <View style={[styles.placeholder, { backgroundColor: t.card }]}>
              <Text style={[styles.placeholderText, { color: t.text }]}>
                ★ Sample Result
              </Text>
            </View>
          ) : (
            <Image
              source={{ uri: imageUri }}
              style={styles.image}
              resizeMode="contain"
            />
          )}
          {showOverlay && success && (
            <StarMarkerLayer
              imageWidth={result.imageWidth}
              imageHeight={result.imageHeight}
              displayWidth={SCREEN_WIDTH - 32}
              displayHeight={240}
              detectedStars={result.detectedStars}
              matchedStars={result.matchedStarPositions}
            />
          )}
          {success && (
            <TouchableOpacity
              style={styles.togglePill}
              onPress={() => setShowOverlay(!showOverlay)}
              activeOpacity={0.7}
            >
              <Text style={styles.toggleText}>
                {showOverlay ? 'Hide stars' : 'Show stars'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Coordinates (only if solved) */}
        {success && (
          <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
            <CoordinateReadout result={result} theme={t} />
          </View>
        )}

        {/* If failed, show a friendly message */}
        {!success && (
          <View style={styles.failedCard}>
            <Text style={[styles.failedText, { color: t.textMuted }]}>
              {result.log.length > 0
                ? result.log[result.log.length - 1]
                : 'Could not identify this star field. Try a darker sky with more visible stars.'}
            </Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.primaryAction, { backgroundColor: t.accent }]}
            onPress={handleNewPhoto}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryActionText}>New Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryAction, { borderColor: t.cardBorder }]}
            onPress={handleShare}
            activeOpacity={0.7}
            disabled={!success}
          >
            <Text style={[styles.secondaryActionText, { color: success ? t.text : t.textMuted }]}>
              Share Result
            </Text>
          </TouchableOpacity>
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
    paddingBottom: 32,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 60,
    fontSize: 16,
  },
  banner: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    paddingVertical: 20,
    alignItems: 'center',
  },
  bannerText: {
    fontSize: 24,
    fontWeight: '700',
  },
  bannerSub: {
    fontSize: 15,
    marginTop: 6,
    fontWeight: '600',
  },
  imageContainer: {
    margin: 16,
    height: 240,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    flex: 1,
    width: '100%',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 18,
    fontWeight: '700',
  },
  togglePill: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  toggleText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 8,
  },
  failedCard: {
    marginHorizontal: 16,
    marginTop: 0,
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  failedText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  actions: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  primaryAction: {
    height: 60,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryAction: {
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    borderWidth: 1.5,
  },
  secondaryActionText: {
    fontSize: 17,
    fontWeight: '600',
  },
});
