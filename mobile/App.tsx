import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './app/navigation/AppNavigator';
import { ensureSolverReady } from './app/utils/solver';

export default function App() {
  useEffect(() => {
    ensureSolverReady().catch((err) => {
      console.warn('Solver init failed (non-critical):', err);
    });
  }, []);

  return (
    <SafeAreaProvider>
      <AppNavigator />
    </SafeAreaProvider>
  );
}
