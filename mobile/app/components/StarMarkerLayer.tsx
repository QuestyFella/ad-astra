import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { DetectedStar, MatchedStar } from '../types/solver';
import { colors } from '../theme/colors';

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

  const matchedSet = new Set(matchedStars.map((m) => `${m.imageX.toFixed(0)},${m.imageY.toFixed(0)}`));

  return (
    <View style={[styles.container, { width: displayWidth, height: displayHeight }]}>
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
              left: star.imageX * scaleX - 6,
              top: star.imageY * scaleY - 6,
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
    backgroundColor: 'rgba(58, 232, 122, 0.6)',
  },
  matchedRing: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.nightAccent,
    backgroundColor: 'rgba(232, 93, 58, 0.25)',
  },
});
