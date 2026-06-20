import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './app/navigation/AppNavigator';
import { initSolver } from './app/utils/solver';
import { loadDatabase } from './app/utils/databaseLoader';

export default function App() {
  useEffect(() => {
    // Initialize WASM solver and load star catalog
    initSolver()
      .then(() => loadDatabase())
      .catch((err) => {
        console.warn('Solver init failed (non-critical):', err);
      });
  }, []);

  return (
    <SafeAreaProvider>
      <AppNavigator />
    </SafeAreaProvider>
  );
}
