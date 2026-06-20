import React, { useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { HomeScreenProps } from '../types/navigation';
import { ThemeContext } from '../navigation/AppNavigator';
import { getTheme } from '../theme/colors';
import { StatusCard } from '../components/StatusCard';
import { PrimaryActionButton } from '../components/PrimaryActionButton';

export function HomeScreen({ navigation }: HomeScreenProps) {
  const { theme, nightMode, setNightMode } = useContext(ThemeContext);
  const t = getTheme(theme);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      navigation.navigate('ImagePreview', { imageUri: result.assets[0].uri });
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to capture sky images.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      navigation.navigate('ImagePreview', { imageUri: result.assets[0].uri });
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['bottom']}>
      <StatusBar style={t.statusBar} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: t.text }]}>AD ASTRA</Text>
          <Text style={[styles.subtitle, { color: t.textMuted }]}>
            Offline Plate Solver
          </Text>
          <TouchableOpacity
            style={[styles.nightToggle, { borderColor: t.cardBorder }]}
            onPress={() => setNightMode(!nightMode)}
          >
            <Text style={[styles.nightToggleText, { color: t.textMuted }]}>
              {nightMode ? '☀ DAY' : '☾ NIGHT'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statusGrid}>
          <StatusCard
            title="Catalog"
            value="Hipparcos ≤ 8.5"
            status="ready"
            theme={theme}
          />
          <StatusCard
            title="Index size"
            value="3.8 MB"
            status="ready"
            theme={theme}
          />
          <StatusCard
            title="Solver"
            value="Available offline"
            status="ready"
            theme={theme}
          />
        </View>

        <View style={styles.actions}>
          <PrimaryActionButton
            label="📷  Capture Sky Image"
            theme={theme}
            onPress={takePhoto}
          />
          <View style={{ height: 12 }} />
          <PrimaryActionButton
            label="🖼  Import Image"
            theme={theme}
            variant="secondary"
            onPress={pickImage}
          />
          <View style={{ height: 12 }} />
          <PrimaryActionButton
            label="★  Use Sample Image"
            theme={theme}
            variant="secondary"
            onPress={() => navigation.navigate('ImagePreview', { imageUri: 'sample' })}
          />
        </View>

        <View style={[styles.tipBox, { borderColor: t.cardBorder }]}>
          <Text style={[styles.tipTitle, { color: t.text }]}>Tips for best results</Text>
          <Text style={[styles.tipText, { color: t.textMuted }]}>
            • Use images with at least 15 visible stars{'\n'}
            • Avoid heavy light pollution or clouds{'\n'}
            • Wider fields solve faster than narrow ones{'\n'}
            • Works fully offline — no network needed
          </Text>
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
    padding: 20,
  },
  header: {
    marginBottom: 28,
    position: 'relative',
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 6,
    fontFamily: 'Courier',
  },
  subtitle: {
    fontSize: 14,
    letterSpacing: 2,
    marginTop: 4,
    fontFamily: 'Courier',
  },
  nightToggle: {
    position: 'absolute',
    top: 0,
    right: 0,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  nightToggleText: {
    fontSize: 12,
    fontFamily: 'Courier',
    fontWeight: '600',
  },
  statusGrid: {
    marginBottom: 28,
  },
  actions: {
    marginBottom: 28,
  },
  tipBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    fontFamily: 'Courier',
  },
  tipText: {
    fontSize: 13,
    lineHeight: 20,
  },
});
