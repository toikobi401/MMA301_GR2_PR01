# Routes

File-based routing with **Expo Router** (`apps/client/src/app`). Every file is one route; all share the root `Stack` in `_layout.tsx`. Params are query strings (`/table?id=<tableId>`). The web build is statically prerendered, so every session/param-dependent screen gates on `useHydrated()` + `restoring` and shows a spinner first.

| URL | File | Header | What it renders |
|---|---|---|---|
| `/` | `src/app/index.tsx` | "Poker" | Signed out: brand header (MMA301 · Group 2 / Texas Hold'em / "Play money. No real currency anywhere." + ☾ theme toggle) and a Sign in / Register card. Signed in: greeting + chip balance, nav buttons (Wallet, Friends, Leaderboard, History, Tournament control if staff), list of open table cards (name, blinds, buy-in range, seated count, Join). |
| `/table?id=` | `src/app/table.tsx` | hidden | Full-screen dark poker table: top bar, felt with opponent seats across the top, pot + board + Deal button in the centre, own seat at the bottom, then the ActionBar panel. Opens HandLog / TableChat / AddBotSheet sheets. |
| `/wallet` | `src/app/wallet.tsx` | "Wallet" | Balance card, simulated Deposit / Withdraw with amount input, recent transactions list (kind, signed amount, balance after). |
| `/friends` | `src/app/friends.tsx` | "Friends" | Tabs Friends / Requests / Find people; rows with avatar, name, status dot, action buttons. MOCK data. |
| `/leaderboard` | `src/app/leaderboard.tsx` | "Leaderboard" | Tabs Net chips / Hands won / Biggest pot; ranked rows with position, avatar, name, value. MOCK data. |
| `/history` | `src/app/history.tsx` | "Hand history" | List of the viewer's past hands (board cards, pot, result) with a per-action replay view. MOCK data. |
| `/moderation` | `src/app/moderation.tsx` | "Tournament control" | Staff only. Tabs Tables / Players: open-table form, table list with Close; player search, Ban / Unban, role change. |

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
