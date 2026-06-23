import React, { useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { HomeScreenProps } from '../types/navigation';
import { ThemeContext } from '../navigation/AppNavigator';
import { getTheme } from '../theme/colors';
import { tokens } from '../theme/tokens';
import { isSolverReady } from '../utils/solver';
import {
  ScreenShell,
  ScreenHeader,
  CaptureCard,
  ButtonPrimary,
  ButtonSecondaryPill,
  ListGroup,
  ListRow,
  TextLink,
} from '../components/ui';

export function HomeScreen({ navigation }: HomeScreenProps) {
  const { theme } = useContext(ThemeContext);
  const t = getTheme(theme);
  const catalogReady = isSolverReady();

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
      Alert.alert('Camera needed', 'Allow camera access to photograph the sky.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (!result.canceled && result.assets[0]) {
      goToSolving(result.assets[0].uri);
    }
  };

  return (
    <ScreenShell theme={t} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          theme={t}
          title="Solve"
          subtitle="Identify a star field from a photo — fully offline."
        />

        <CaptureCard theme={t} onPress={takePhoto} />

        <View style={styles.actions}>
          <ButtonPrimary
            label="Take Photo"
            onPress={takePhoto}
            fullWidth
          />
          <ButtonSecondaryPill
            label="Choose from Library"
            onPress={importImage}
            fullWidth
          />
        </View>

        <ListGroup theme={t} title="How it works">
          <ListRow
            label="Capture"
            detail="Photograph a clear star field"
          />
          <ListRow
            label="Detect"
            detail="Find star centroids on-device"
          />
          <ListRow
            label="Solve"
            detail="Match against the Hipparcos catalog"
          />
        </ListGroup>

        <TextLink
          label="View on GitHub ↗"
          onPress={() => Linking.openURL('https://github.com/QuestyFella/ad-astra')}
          theme={t}
          style={styles.link}
        />

        <View
          style={[
            styles.statusChip,
            {
              backgroundColor: t.card,
              borderColor: t.hairline,
            },
          ]}
        >
          <View
            style={[
              styles.statusDot,
              { backgroundColor: catalogReady ? t.primary : t.textMuted },
            ]}
          />
          <Text style={[styles.statusText, { color: t.textMuted }]}>
            {catalogReady ? 'Catalog loaded · Offline ready' : 'Catalog not loaded'}
          </Text>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingBottom: tokens.space.xxl,
  },
  actions: {
    gap: tokens.space.sm,
    marginBottom: tokens.space.xl,
  },
  link: {
    marginTop: tokens.space.xs,
    marginLeft: tokens.space.xxs,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: tokens.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: tokens.space.xs,
    paddingHorizontal: tokens.space.md,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: tokens.space.xs,
  },
  statusText: {
    ...tokens.type.caption,
  },
});
