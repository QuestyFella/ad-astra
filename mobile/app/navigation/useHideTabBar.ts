import { useLayoutEffect } from 'react';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import type { Theme } from '../theme/colors';

const TAB_BAR_HEIGHT = 64;

export function useHideTabBar(
  navigation: NavigationProp<ParamListBase>,
  theme: Theme,
) {
  useLayoutEffect(() => {
    const parent = navigation.getParent();
    parent?.setOptions({
      tabBarStyle: { display: 'none' },
    });
    return () => {
      parent?.setOptions({
        tabBarStyle: {
          backgroundColor: theme.canvasSoft,
          borderTopWidth: 1,
          borderTopColor: 'rgba(0, 0, 0, 0.08)',
          height: TAB_BAR_HEIGHT,
          paddingBottom: 10,
          paddingTop: 6,
        },
      });
    };
  }, [navigation, theme.canvasSoft]);
}
