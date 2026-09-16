import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

/**
 * Pressable already handles mouse, touch, and keyboard on web through
 * react-native-web, so one component covers every platform.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const [hovered, setHovered] = useState(false);
  const isPrimary = variant === 'primary';
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      // onHoverIn/Out are no-ops on touch devices and typed on every platform,
      // unlike the web-only `hovered` flag react-native-web adds.
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: isPrimary ? theme.colors.accent : theme.colors.surface,
          borderColor: isPrimary ? theme.colors.accent : theme.colors.border,
          borderRadius: theme.radius.md,
          opacity: inactive ? 0.5 : pressed ? 0.85 : hovered ? 0.92 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={isPrimary ? theme.colors.onAccent : theme.colors.textPrimary}
        />
      ) : (
        <Text
          style={[
            theme.typography.bodyStrong,
            { color: isPrimary ? theme.colors.onAccent : theme.colors.textPrimary },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
  },
});
