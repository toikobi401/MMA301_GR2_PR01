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
