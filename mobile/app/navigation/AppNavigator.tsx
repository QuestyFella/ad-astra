import React, { createContext, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import type { ThemeMode } from '../theme/colors';
import { getTheme } from '../theme/colors';
import type {
  HomeStackParamList,
  AboutStackParamList,
  TabParamList,
} from '../types/navigation';

import { HomeScreen } from '../screens/HomeScreen';
import { SolvingScreen } from '../screens/SolvingScreen';
import { ResultScreen } from '../screens/ResultScreen';
import { AboutScreen } from '../screens/AboutScreen';

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
const AboutStack = createNativeStackNavigator<AboutStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function HomeStackScreen() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} />
      <HomeStack.Screen name="Solving" component={SolvingScreen} />
      <HomeStack.Screen name="Result" component={ResultScreen} />
    </HomeStack.Navigator>
  );
}

function AboutStackScreen() {
  return (
    <AboutStack.Navigator screenOptions={{ headerShown: false }}>
      <AboutStack.Screen name="AboutMain" component={AboutScreen} />
    </AboutStack.Navigator>
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
              height: 64,
              paddingBottom: 10,
              paddingTop: 6,
            },
            tabBarActiveTintColor: t.accent,
            tabBarInactiveTintColor: t.textMuted,
            tabBarLabelStyle: {
              fontSize: 12,
              fontWeight: '600',
            },
          }}
        >
          <Tab.Screen
            name="SolveTab"
            component={HomeStackScreen}
            options={{
              tabBarLabel: 'Solve',
              tabBarIcon: ({ color }) => (
                <Text style={{ fontSize: 22, color }}>◎</Text>
              ),
            }}
          />
          <Tab.Screen
            name="AboutTab"
            component={AboutStackScreen}
            options={{
              tabBarLabel: 'About',
              tabBarIcon: ({ color }) => (
                <Text style={{ fontSize: 20, color }}>ⓘ</Text>
              ),
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </ThemeContext.Provider>
  );
}
