import React, { createContext, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import type { ThemeMode } from '../theme/colors';
import { getTheme } from '../theme/colors';
import type {
  HomeStackParamList,
  CatalogStackParamList,
  SettingsStackParamList,
  TabParamList,
} from '../types/navigation';

import { HomeScreen } from '../screens/HomeScreen';
import { ImagePreviewScreen } from '../screens/ImagePreviewScreen';
import { SolvingScreen } from '../screens/SolvingScreen';
import { ResultScreen } from '../screens/ResultScreen';
import { CatalogScreen } from '../screens/CatalogScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

export const ThemeContext = createContext<{
  theme: ThemeMode;
  nightMode: boolean;
  setNightMode: (v: boolean) => void;
}>({
  theme: 'night',
  nightMode: true,
  setNightMode: () => {},
});

const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const CatalogStack = createNativeStackNavigator<CatalogStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function HomeStackScreen() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} />
      <HomeStack.Screen name="ImagePreview" component={ImagePreviewScreen} />
      <HomeStack.Screen name="Solving" component={SolvingScreen} />
      <HomeStack.Screen name="Result" component={ResultScreen} />
    </HomeStack.Navigator>
  );
}

function CatalogStackScreen() {
  return (
    <CatalogStack.Navigator screenOptions={{ headerShown: false }}>
      <CatalogStack.Screen name="CatalogMain" component={CatalogScreen} />
    </CatalogStack.Navigator>
  );
}

function SettingsStackScreen() {
  return (
    <SettingsStack.Navigator screenOptions={{ headerShown: false }}>
      <SettingsStack.Screen name="SettingsMain" component={SettingsScreen} />
    </SettingsStack.Navigator>
  );
}

export function AppNavigator() {
  const [nightMode, setNightMode] = useState(true);
  const theme: ThemeMode = nightMode ? 'night' : 'day';
  const t = getTheme(theme);

  return (
    <ThemeContext.Provider value={{ theme, nightMode, setNightMode }}>
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: t.card,
              borderTopColor: t.cardBorder,
              borderTopWidth: 1,
              height: 60,
              paddingBottom: 8,
              paddingTop: 4,
            },
            tabBarActiveTintColor: t.accent,
            tabBarInactiveTintColor: t.textMuted,
            tabBarLabelStyle: {
              fontSize: 11,
              fontFamily: 'Courier',
              fontWeight: '600',
            },
          }}
        >
          <Tab.Screen
            name="HomeTab"
            component={HomeStackScreen}
            options={{
              tabBarLabel: 'Solve',
              tabBarIcon: ({ color }) => (
                <Text style={{ fontSize: 20, color }}>◎</Text>
              ),
            }}
          />
          <Tab.Screen
            name="CatalogTab"
            component={CatalogStackScreen}
            options={{
              tabBarLabel: 'Catalogs',
              tabBarIcon: ({ color }) => (
                <Text style={{ fontSize: 20, color }}>☰</Text>
              ),
            }}
          />
          <Tab.Screen
            name="SettingsTab"
            component={SettingsStackScreen}
            options={{
              tabBarLabel: 'Settings',
              tabBarIcon: ({ color }) => (
                <Text style={{ fontSize: 20, color }}>⚙</Text>
              ),
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </ThemeContext.Provider>
  );
}
