import React, { useContext } from 'react';
import { View, Text, StyleSheet, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ImagePreviewScreenProps } from '../types/navigation';
import { ThemeContext } from '../navigation/AppNavigator';
import { getTheme } from '../theme/colors';
import { PrimaryActionButton } from '../components/PrimaryActionButton';

export function ImagePreviewScreen({ navigation, route }: ImagePreviewScreenProps) {
  const { imageUri } = route.params;
  const { theme } = useContext(ThemeContext);
  const t = getTheme(theme);

  const isSample = imageUri === 'sample';

  const handleSolve = () => {
    navigation.navigate('Solving', { imageUri });
  };

  const handleRetake = () => {
    navigation.goBack();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]}>
      <View style={styles.imageContainer}>
        {isSample ? (
          <View style={[styles.placeholder, { backgroundColor: t.card }]}>
            <Text style={[styles.placeholderText, { color: t.text }]}>
              ★ Sample Star Field
            </Text>
            <Text style={[styles.placeholderSub, { color: t.textMuted }]}>
              Simulated sky image for testing
            </Text>
          </View>
        ) : (
          <Image
            source={{ uri: imageUri }}
            style={styles.image}
            resizeMode="contain"
          />
        )}
      </View>

      <View style={[styles.infoBar, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
        <Text style={[styles.infoLabel, { color: t.textMuted }]}>
          {isSample ? 'Synthetic test image' : 'Ready to solve'}
        </Text>
      </View>

      <View style={styles.actions}>
        <PrimaryActionButton label="Solve" theme={theme} onPress={handleSolve} />
        <View style={{ height: 12 }} />
        <PrimaryActionButton
          label="Retake"
          theme={theme}
          variant="secondary"
          onPress={handleRetake}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  imageContainer: {
    flex: 1,
    margin: 16,
    borderRadius: 10,
    overflow: 'hidden',
  },
  image: {
    flex: 1,
    width: '100%',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  placeholderText: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'Courier',
  },
  placeholderSub: {
    fontSize: 13,
    marginTop: 8,
  },
  infoBar: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  infoLabel: {
    fontSize: 13,
    fontFamily: 'Courier',
  },
  actions: {
    padding: 20,
  },
});
