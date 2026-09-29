# Layouts

There is **no shared nav bar, sidebar or footer component**. The only shared shell is the Expo Router root stack.

- Every screen except the table gets the **native stack header** (title text, back chevron) styled from `_layout.tsx`: header background `#FFFFFF` light / `#12161D` dark, tint `#12161D` / `#F7F8FA`, title weight 600; content background `#F7F8FA` light / `#0A0D12` dark.
- The **table screen hides the header** (`headerShown: false`) and draws its own dark top bar ("← Lobby" | History | Chat | Hand #N) inside a `SafeAreaView`, then the felt, then a bottom action panel.
- Navigation between sections is done from the **lobby** (`index.tsx`): a row of outline buttons (Wallet, Friends, Leaderboard, History, and Tournament control for staff) plus a theme toggle.
- Bottom sheets (`HandLog`, `TableChat`, `AddBotSheet`) are React Native `Modal`s: dim `bg-black/50` backdrop, sheet `rounded-t-lg border-t bg-card p-4`, max 80% height.

### `apps/client/src/app/_layout.tsx`

```tsx
import '@/global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';

/**
 * Root layout. Runs on iOS, Android, and web from this one file — the
 * navigator renders as a native stack on device and as browser history on web.
 *
 * The CSS import must come first: it registers the Tailwind styles NativeWind
 * compiles, and components that render before it would have no styles.
 */
export default function RootLayout() {
  const { isDark } = useTheme();

  return (
    <SafeAreaProvider>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: isDark ? '#12161D' : '#FFFFFF' },
          headerTintColor: isDark ? '#F7F8FA' : '#12161D',
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: isDark ? '#0A0D12' : '#F7F8FA' },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Poker' }} />
        <Stack.Screen name="table" options={{ title: 'Table', headerShown: false }} />
        <Stack.Screen name="wallet" options={{ title: 'Wallet' }} />
        <Stack.Screen name="friends" options={{ title: 'Friends' }} />
        <Stack.Screen name="leaderboard" options={{ title: 'Leaderboard' }} />
        <Stack.Screen name="history" options={{ title: 'Hand history' }} />
        <Stack.Screen name="moderation" options={{ title: 'Tournament control' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
```

### `apps/client/src/lib/theme.ts`

```ts
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
```
