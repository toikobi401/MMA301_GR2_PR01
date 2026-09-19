import { useColorScheme } from 'nativewind';

export type ColorScheme = 'light' | 'dark';

/**
 * Theme control.
 *
 * NativeWind resolves `dark:` classes from this, so components never branch on
 * the scheme themselves — they just carry both variants.
 */
export function useTheme() {
  const { colorScheme, setColorScheme, toggleColorScheme } = useColorScheme();

  return {
    scheme: (colorScheme ?? 'light') as ColorScheme,
    isDark: colorScheme === 'dark',
    setScheme: setColorScheme,
    toggle: toggleColorScheme,
  };
}
