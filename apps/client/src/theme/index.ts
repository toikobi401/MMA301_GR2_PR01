import { useColorScheme } from 'react-native';
import {
  darkTheme,
  lightTheme,
  radius,
  spacing,
  typography,
  type ThemeColors,
} from '@app/design-tokens';

export interface Theme {
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  isDark: boolean;
}

/**
 * Follows the OS appearance setting. Components read tokens from here rather
 * than importing colours directly, so a theme swap is a one-line change.
 */
export function useTheme(): Theme {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  return {
    colors: isDark ? darkTheme : lightTheme,
    spacing,
    radius,
    typography,
    isDark,
  };
}

export { darkTheme, lightTheme, radius, spacing, typography };
