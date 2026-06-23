import React, { createContext, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import type { ThemeMode } from '../theme/colors';
import { getTheme } from '../theme/colors';
import { tokens } from '../theme/tokens';
import type {
  HomeStackParamList,
  AboutStackParamList,
  TabParamList,
} from '../types/navigation';

import { HomeScreen } from '../screens/HomeScreen';
import { SolvingScreen } from '../screens/SolvingScreen';
import { ResultScreen } from '../screens/ResultScreen';
import { AboutScreen } from '../screens/AboutScreen';
import { SolverProvider } from '../store/SolverProvider';

export const ThemeContext = createContext<{
  theme: ThemeMode;
  nightMode: boolean;
  setNightMode: (v: boolean) => void;
}>({
  theme: 'light',
  nightMode: false,
  setNightMode: () => {},
});

const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const AboutStack = createNativeStackNavigator<AboutStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function HomeStackScreen() {
  return (
    <SolverProvider>
      <HomeStack.Navigator screenOptions={{ headerShown: false }}>
        <HomeStack.Screen name="HomeMain" component={HomeScreen} />
        <HomeStack.Screen name="Solving" component={SolvingScreen} />
        <HomeStack.Screen name="Result" component={ResultScreen} />
      </HomeStack.Navigator>
    </SolverProvider>
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
  const [nightMode, setNightMode] = useState(false);
  const theme: ThemeMode = nightMode ? 'dark' : 'light';
  const t = getTheme(theme);

  return (
    <ThemeContext.Provider value={{ theme, nightMode, setNightMode }}>
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: t.canvasSoft,
              borderTopWidth: 1,
              borderTopColor: 'rgba(0, 0, 0, 0.08)',
              height: 64,
              paddingBottom: 10,
              paddingTop: 6,
            },
            tabBarActiveTintColor: t.primary,
            tabBarInactiveTintColor: t.textMuted,
            tabBarLabelStyle: {
              fontFamily: tokens.font.text,
              fontSize: 11,
              fontWeight: '400',
              letterSpacing: -0.12,
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
