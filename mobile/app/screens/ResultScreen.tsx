import React, { useContext, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Dimensions,
  Alert,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ResultScreenProps } from '../types/navigation';
import { ThemeContext } from '../navigation/AppNavigator';
import { getTheme } from '../theme/colors';
import { CoordinateReadout } from '../components/CoordinateReadout';
import { StarMarkerLayer } from '../components/StarMarkerLayer';
import { PrimaryActionButton } from '../components/PrimaryActionButton';
import { useSolver } from '../store/solver';

const SCREEN_WIDTH = Dimensions.get('window').width;

export function ResultScreen({ navigation, route }: ResultScreenProps) {
  const { imageUri } = route.params;
  const { theme } = useContext(ThemeContext);
  const t = getTheme(theme);
  const { result, reset } = useSolver();
  const [showOverlay, setShowOverlay] = useState(true);

  const isSample = imageUri === 'sample';

  const handleCopy = () => {
    if (!result) return;
    const ra = result.raDeg?.toFixed(4) ?? '—';
    const dec = result.decDeg?.toFixed(4) ?? '—';
    const text = `RA ${ra}°  Dec ${dec}°  FOV ${result.fovXDeg?.toFixed(1)}°×${result.fovYDeg?.toFixed(1)}°  Rot ${result.rotationDeg?.toFixed(1)}°`;
    Alert.alert('Copied', text);
  };

  const handleShare = async () => {
    if (!result) return;
    const ra = result.raDeg?.toFixed(4) ?? '—';
    const dec = result.decDeg?.toFixed(4) ?? '—';
    await Share.share({
      message: `Plate solve result:\nRA: ${ra}°  Dec: ${dec}°\nFOV: ${result.fovXDeg?.toFixed(1)}° × ${result.fovYDeg?.toFixed(1)}°\nConfidence: ${result.confidence}`,
    });
  };

  const handleSolveAnother = () => {
    reset();
    navigation.popToTop();
  };

  if (!result) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]}>
        <Text style={[styles.noResult, { color: t.text }]}>No result available</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]}>
      <ScrollView>
        <View style={[styles.confidenceBar, { backgroundColor: result.success ? t.successDim : t.danger }]}>
          <Text style={[styles.confidenceText, { color: result.success ? t.success : t.danger }]}>
            {result.success ? `SOLVED — ${result.confidence.toUpperCase()}` : 'FAILED'}
          </Text>
        </View>

        <View style={styles.imageContainer}>
          {isSample ? (
            <View style={[styles.placeholder, { backgroundColor: t.card }]}>
              <Text style={[styles.placeholderText, { color: t.text }]}>★ Sample Result</Text>
            </View>
          ) : (
            <Image
              source={{ uri: imageUri }}
              style={styles.image}
              resizeMode="contain"
            />
          )}
          {showOverlay && result.success && (
            <StarMarkerLayer
              imageWidth={1200}
              imageHeight={1600}
              displayWidth={SCREEN_WIDTH - 32}
              displayHeight={250}
              detectedStars={result.detectedStars}
              matchedStars={result.matchedStarPositions}
            />
          )}
        </View>

        <View style={styles.toggleRow}>
          <PrimaryActionButton
            label={showOverlay ? 'Hide Stars' : 'Show Stars'}
            theme={theme}
            variant="secondary"
            onPress={() => setShowOverlay(!showOverlay)}
          />
        </View>

        <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
          <CoordinateReadout result={result} theme={theme} />
        </View>

        <View style={[styles.logCard, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
          <Text style={[styles.logTitle, { color: t.textMuted }]}>SOLVER LOG</Text>
          {result.log.map((line, i) => (
            <Text key={i} style={[styles.logLine, { color: t.text }]}>
              {line}
            </Text>
          ))}
        </View>

        <View style={styles.actions}>
          <PrimaryActionButton label="Copy Coordinates" theme={theme} onPress={handleCopy} />
          <View style={{ height: 10 }} />
          <PrimaryActionButton label="Share Result" theme={theme} variant="secondary" onPress={handleShare} />
          <View style={{ height: 10 }} />
          <PrimaryActionButton label="Solve Another" theme={theme} variant="secondary" onPress={handleSolveAnother} />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  noResult: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 16,
  },
  confidenceBar: {
    paddingVertical: 10,
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
  },
  confidenceText: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'Courier',
    letterSpacing: 2,
  },
  imageContainer: {
    margin: 16,
    height: 250,
    borderRadius: 10,
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
    fontFamily: 'Courier',
  },
  toggleRow: {
    paddingHorizontal: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
    overflow: 'hidden',
  },
  logCard: {
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 20,
  },
  logTitle: {
    fontSize: 11,
    fontFamily: 'Courier',
    letterSpacing: 1,
    marginBottom: 8,
  },
  logLine: {
    fontSize: 12,
    fontFamily: 'Courier',
    lineHeight: 18,
  },
  actions: {
    paddingHorizontal: 16,
  },
});
