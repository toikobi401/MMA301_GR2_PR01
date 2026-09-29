import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { canModerate, type TableSummary, type UserRole } from '@app/shared';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Tabs,
  Text,
} from '@/components/ui';
import { formatChips } from '@/components/poker';
import { api } from '@/lib/api';
import { walletApi } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { useHydrated } from '@/lib/use-hydrated';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';

export default function LobbyScreen() {
  const { isDark, toggle } = useTheme();
  const hydrated = useHydrated();
  const { user, token, restoring, busy, error, login, register, logout } = useSession();

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="p-6 items-center">
      <View className="w-full max-w-[680px] gap-6">
        <View className="flex-row items-start justify-between">
          <View className="gap-1">
            <Text variant="label" tone="muted">
              MMA301 · Group 2
            </Text>
            <Text variant="title">Texas Hold'em</Text>
            <Text tone="muted">Play money. No real currency anywhere.</Text>
          </View>

          <Button
            variant="outline"
            size="icon"
            accessibilityLabel={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            onPress={toggle}
          >
            <Text className="text-base">{isDark ? '☀' : '☾'}</Text>
          </Button>
        </View>

        {!hydrated || restoring ? (
          // Before hydration the prerendered HTML has no session, so rendering
          // either branch here would disagree with it (React #418). After
          // that, a stored session is still being exchanged — showing the
          // sign-in form would make a signed-in user think they were logged
          // out.
          <View className="py-10">
            <ActivityIndicator size="small" />
          </View>
        ) : token && user ? (
          <TableList user={user.displayName} role={user.role} onSignOut={logout} />
        ) : (
          <SignIn busy={busy} error={error} onLogin={login} onRegister={register} />
        )}
      </View>
    </ScrollView>
  );
}

function SignIn({
  busy,
  error,
  onLogin,
  onRegister,
}: {
  busy: boolean;
  error: string | null;
  onLogin: (email: string, password: string) => Promise<boolean>;
  onRegister: (email: string, password: string, name: string) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  // The session keeps one error for both forms. Remembering which form
  // produced it stops a failed sign-in from showing up under "Create account".
  const [submittedMode, setSubmittedMode] = useState(mode);

  const submit = () => {
    setSubmittedMode(mode);
    if (mode === 'login') void onLogin(email, password);
    else void onRegister(email, password, displayName);
  };

  const registering = mode === 'register';
  const shownError = submittedMode === mode ? error : null;

  return (
    <Card>
      <CardHeader>
        {/* Two peers, not a primary action and a buried link: a new player
            should see "Create account" as clearly as a returning one sees
            "Sign in". */}
        <Tabs
          value={mode}
          onChange={setMode}
          options={[
            { value: 'login', label: 'Sign in' },
            { value: 'register', label: 'Create account' },
          ]}
        />
      </CardHeader>

      <CardContent className="gap-3">
        {registering && (
          <Input
            label="Display name"
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
            placeholder="Your name at the table"
            hint="This is the name other players see at the table."
          />
        )}

        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
        />

        <Input
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="At least 8 characters"
          onSubmitEditing={submit}
          // Sign-in failures are about the credentials, so they sit under
          // the field the player will retype. Registration errors can be
          // about any field and go above the button instead.
          error={!registering ? (shownError ?? undefined) : undefined}
        />

        {registering && (
          <View className="flex-row items-center gap-3 rounded-md bg-muted px-3 py-2.5">
            <View className="h-5 w-5 rounded-full border-2 border-white/60 bg-primary" />
            <Text variant="caption">
              New accounts start with{' '}
              <Text variant="numeric" className="text-sm font-semibold">
                10,000
              </Text>{' '}
              chips.
            </Text>
          </View>
        )}

        {registering && shownError && (
          <Text variant="caption" tone="destructive">
            {shownError}
          </Text>
        )}

        <Button
          label={registering ? 'Create account' : 'Sign in'}
          loading={busy}
          onPress={submit}
          block
          className="mt-1"
        />
      </CardContent>
    </Card>
  );
}

function TableList({
  user,
  role,
  onSignOut,
}: {
  user: string;
  role: UserRole;
  onSignOut: () => void;
}) {
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // The balance decides which tables a player can afford to join, so it
      // is fetched alongside the list rather than hidden behind the wallet.
      const [page, wallet] = await Promise.all([
        api.get<{ items: TableSummary[] }>('/api/v1/tables'),
        walletApi.get(),
      ]);
      setTables(page.items);
      setBalance(wallet.chips);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load tables');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function joinTable(tableId: string) {
    setJoining(tableId);
    setError(null);
    try {
      await api.post(`/api/v1/tables/${tableId}/join`, { buyIn: 1000 });
      router.push(`/table?id=${tableId}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not join';
      // Already seated is not a failure — go to the table.
      if (message.toLowerCase().includes('already seated')) {
        router.push(`/table?id=${tableId}`);
      } else {
        setError(message);
      }
    } finally {
      setJoining(null);
    }
  }

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between">
        <Text tone="muted">
          Signed in as <Text className="font-medium text-foreground">{user}</Text>
        </Text>
        <Button variant="ghost" size="sm" label="Sign out" onPress={onSignOut} />
      </View>

      {balance !== null && (
        <View className="flex-row items-baseline gap-2">
          <Text variant="caption" tone="muted">
            Balance
          </Text>
          <Text variant="numeric" className="font-semibold">
            {formatChips(balance)}
          </Text>
        </View>
      )}

      {/* Everything that is not the table itself lives one tap away. */}
      <View className="flex-row gap-2">
        <Button
          variant="outline"
          size="sm"
          label="Wallet"
          onPress={() => router.push('/wallet')}
          className="flex-1"
        />
        <Button
          variant="outline"
          size="sm"
          label="Friends"
          onPress={() => router.push('/friends')}
          className="flex-1"
        />
        <Button
          variant="outline"
          size="sm"
          label="Ranks"
          onPress={() => router.push('/leaderboard')}
          className="flex-1"
        />
        <Button
          variant="outline"
          size="sm"
          label="Hands"
          onPress={() => router.push('/history')}
          className="flex-1"
        />
      </View>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Tables</CardTitle>
          <Button variant="outline" size="sm" label="Refresh" onPress={() => void refresh()} />
        </CardHeader>

        <CardContent className="gap-0">
          {loading ? (
            <View className="py-6">
              <ActivityIndicator size="small" />
            </View>
          ) : tables.length === 0 ? (
            <Text tone="muted" className="py-4">
              No tables are open right now. A tournament moderator opens them — refresh in a
              moment.
            </Text>
          ) : (
            tables.map((table, index) => (
              <View
                key={table.id}
                className={cn(
                  'flex-row items-center justify-between py-3',
                  index > 0 && 'border-t border-border',
                )}
              >
                <View className="flex-1 gap-0.5 pr-3">
                  <Text className="font-medium" numberOfLines={1}>
                    {table.name}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {table.smallBlind}/{table.bigBlind} · {table.seatedCount}/{table.maxSeats}{' '}
                    seated
                  </Text>
                </View>

                <View className="flex-row items-center gap-2">
                  <Badge
                    label={table.status === 'in_hand' ? 'Playing' : 'Open'}
                    variant={table.status === 'in_hand' ? 'success' : 'secondary'}
                  />
                  <Button
                    size="sm"
                    label="Join"
                    loading={joining === table.id}
                    onPress={() => void joinTable(table.id)}
                  />
                </View>
              </View>
            ))
          )}
        </CardContent>
      </Card>

      {error && (
        <Text variant="caption" tone="destructive">
          {error}
        </Text>
      )}

      {canModerate(role) ? (
        <Button
          label="Tournament control"
          onPress={() => router.push('/moderation')}
          block
        />
      ) : (
        <Text variant="caption" tone="muted" className="text-center">
          Tables are opened by a tournament moderator.
        </Text>
      )}
    </View>
  );
}
