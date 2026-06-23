import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { DetectedStar, MatchedStar } from '../types/solver';
import { tokens } from '../theme/tokens';

interface StarMarkerLayerProps {
  imageWidth: number;
  imageHeight: number;
  displayWidth: number;
  displayHeight: number;
  detectedStars: DetectedStar[];
  matchedStars: MatchedStar[];
  showAllDetections?: boolean;
}

export function StarMarkerLayer({
  imageWidth,
  imageHeight,
  displayWidth,
  displayHeight,
  detectedStars,
  matchedStars,
  showAllDetections = true,
}: StarMarkerLayerProps) {
  const scaleX = displayWidth / imageWidth;
  const scaleY = displayHeight / imageHeight;

  const matchedSet = new Set(
    matchedStars.map((m) => `${m.imageX.toFixed(0)},${m.imageY.toFixed(0)}`),
  );

  return (
    <View
      style={[
        styles.container,
        { width: displayWidth, height: displayHeight },
      ]}
      pointerEvents="none"
    >
      {showAllDetections &&
        detectedStars
          .filter((s) => !matchedSet.has(`${s.x.toFixed(0)},${s.y.toFixed(0)}`))
          .map((star, i) => (
            <View
              key={`d-${i}`}
              style={[
                styles.detectedDot,
                {
                  left: star.x * scaleX - 3,
                  top: star.y * scaleY - 3,
                },
              ]}
            />
          ))}
      {matchedStars.map((star, i) => (
        <View
          key={`m-${i}`}
          style={[
            styles.matchedRing,
            {
              left: star.imageX * scaleX - 7,
              top: star.imageY * scaleY - 7,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  detectedDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.color.ink,
    opacity: 0.5,
  },
  matchedRing: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: tokens.color.primary,
    backgroundColor: 'rgba(0, 102, 204, 0.12)',
  },
});
