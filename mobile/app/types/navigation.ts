import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';

export type HomeStackParamList = {
  HomeMain: undefined;
  Solving: { imageUri: string };
  Result: { imageUri: string };
};

export type AboutStackParamList = {
  AboutMain: undefined;
};

export type TabParamList = {
  SolveTab: NavigatorScreenParams<HomeStackParamList>;
  AboutTab: NavigatorScreenParams<AboutStackParamList>;
};

export type HomeScreenProps = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, 'HomeMain'>,
  BottomTabScreenProps<TabParamList>
>;

export type SolvingScreenProps = NativeStackScreenProps<
  HomeStackParamList,
  'Solving'
>;

export type ResultScreenProps = NativeStackScreenProps<
  HomeStackParamList,
  'Result'
>;

export type AboutScreenProps = CompositeScreenProps<
  NativeStackScreenProps<AboutStackParamList, 'AboutMain'>,
  BottomTabScreenProps<TabParamList>
>;
