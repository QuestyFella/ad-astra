import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';

export type HomeStackParamList = {
  HomeMain: undefined;
  ImagePreview: { imageUri: string };
  Solving: { imageUri: string };
  Result: { imageUri: string };
};

export type CatalogStackParamList = {
  CatalogMain: undefined;
};

export type SettingsStackParamList = {
  SettingsMain: undefined;
};

export type TabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList>;
  CatalogTab: NavigatorScreenParams<CatalogStackParamList>;
  SettingsTab: NavigatorScreenParams<SettingsStackParamList>;
};

export type HomeScreenProps = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, 'HomeMain'>,
  BottomTabScreenProps<TabParamList>
>;

export type ImagePreviewScreenProps = NativeStackScreenProps<
  HomeStackParamList,
  'ImagePreview'
>;

export type SolvingScreenProps = NativeStackScreenProps<
  HomeStackParamList,
  'Solving'
>;

export type ResultScreenProps = NativeStackScreenProps<
  HomeStackParamList,
  'Result'
>;

export type CatalogScreenProps = CompositeScreenProps<
  NativeStackScreenProps<CatalogStackParamList, 'CatalogMain'>,
  BottomTabScreenProps<TabParamList>
>;

export type SettingsScreenProps = CompositeScreenProps<
  NativeStackScreenProps<SettingsStackParamList, 'SettingsMain'>,
  BottomTabScreenProps<TabParamList>
>;
