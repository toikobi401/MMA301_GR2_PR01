import { StyleSheet, View, type ViewProps } from 'react-native';
import { useTheme } from '@/theme';

/** Surface container with the themed border and radius applied. */
export function Card({ style, children, ...rest }: ViewProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
});
