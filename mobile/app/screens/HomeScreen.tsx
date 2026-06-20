import React, { useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { HomeScreenProps } from '../types/navigation';
import { ThemeContext } from '../navigation/AppNavigator';
import { getTheme } from '../theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function HomeScreen({ navigation }: HomeScreenProps) {
  const { theme, nightMode, setNightMode } = useContext(ThemeContext);
  const t = getTheme(theme);

  const goToSolving = (uri: string) => {
    navigation.navigate('Solving', { imageUri: uri });
  };

  const importImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      goToSolving(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Camera needed',
        'Allow camera access to photograph the sky.',
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      goToSolving(result.assets[0].uri);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['bottom']}>
      <StatusBar style={t.statusBar} />
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: t.text }]}>Ad Astra</Text>
          <Text style={[styles.subtitle, { color: t.textMuted }]}>
            Point at the sky. Get coordinates.
          </Text>
        </View>

        <View style={styles.ctaArea}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: t.accent }]}
            onPress={takePhoto}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryIcon}>📷</Text>
            <Text style={styles.primaryLabel}>Take Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: t.cardBorder }]}
            onPress={importImage}
            activeOpacity={0.7}
          >
            <Text style={[styles.secondaryLabel, { color: t.text }]}>
              Choose from Library
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={styles.modePill}
        onPress={() => setNightMode(!nightMode)}
        activeOpacity={0.6}
      >
        <Text style={[styles.modePillText, { color: t.textMuted }]}>
          {nightMode ? '🌙 Night' : '☀ Day'}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const BTN_WIDTH = SCREEN_WIDTH - 64;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    marginTop: 8,
  },
  ctaArea: {
    width: BTN_WIDTH,
    alignItems: 'stretch',
  },
  primaryBtn: {
    height: 88,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryIcon: {
    fontSize: 28,
    marginBottom: 4,
  },
  primaryLabel: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryBtn: {
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    borderWidth: 1.5,
  },
  secondaryLabel: {
    fontSize: 17,
    fontWeight: '600',
  },
  modePill: {
    position: 'absolute',
    top: 16,
    right: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  modePillText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
