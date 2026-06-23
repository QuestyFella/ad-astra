import React, { useState } from 'react';
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/** Active state: scale(0.95) per design.md button micro-interaction. */
export function PressableScale({
  style,
  children,
  disabled,
  ...rest
}: PressableScaleProps) {
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        style,
        { transform: [{ scale: pressed && !disabled ? 0.95 : 1 }] },
        disabled && { opacity: 0.48 },
      ]}
    >
      {children}
    </Pressable>
  );
}
