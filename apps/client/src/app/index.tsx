import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
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
import { BuyInSheet, formatChips } from '@/components/poker';
import { tablesApi, walletApi } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { useHydrated } from '@/lib/use-hydrated';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';

export default function LobbyScreen() {
  const { isDark, toggle } = useTheme();
  const hydrated = useHydrated();
  const { user, token, restoring, busy, error, login, register, logout } = useSession();

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="items-center px-4 py-6 sm:px-6"
    >
      <View className="w-full max-w-[680px] gap-6">
        <View className="flex-row items-start justify-between">
          <View className="min-w-0 flex-1 gap-1">
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
            <View className="w-5 h-5 border-2 rounded-full border-white/60 bg-primary" />
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
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  // The table being sat down at, and the code that got us there if it is private.
  const [buying, setBuying] = useState<{ table: TableSummary; joinCode?: string } | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [findingCode, setFindingCode] = useState(false);
  const [newTable, setNewTable] = useState({
    open: false,
    name: 'Demo table',
    blinds: '10',
    seats: '6',
    visibility: 'public',
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // The balance decides which tables a player can afford to join, so it
      // is fetched alongside the list rather than hidden behind the wallet.
      const [page, wallet] = await Promise.all([
        tablesApi.list(),
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

  // On focus, not mount: coming back from a table or the wallet is when the
  // balance and the seat counts have changed, and this screen stayed mounted.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  function openTable(table: TableSummary, joinCode?: string) {
    if (table.viewerSeated) {
      router.push(`/table?id=${table.id}`);
      return;
    }
    setBuyError(null);
    setBuying({ table, joinCode });
  }

  async function sitDown(amount: number, seat: number | undefined) {
    if (!buying) return;
    const { table, joinCode } = buying;

    setJoining(table.id);
    setBuyError(null);
    try {
      await tablesApi.join(table.id, amount, { seat, joinCode });
      setBuying(null);
      router.push(`/table?id=${table.id}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not join';
      // Already seated is not a failure — go to the table.
      if (message.toLowerCase().includes('already seated')) {
        setBuying(null);
        router.push(`/table?id=${table.id}`);
      } else {
        setBuyError(message);
      }
    } finally {
      setJoining(null);
    }
  }

  async function joinWithCode() {
    setFindingCode(true);
    setError(null);
    try {
      const table = await tablesApi.findByCode(code);
      setCode('');
      openTable(table, code.trim());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not find that table');
    } finally {
      setFindingCode(false);
    }
  }

  async function createTable() {
    setCreating(true);
    setError(null);
    try {
      const smallBlind = Number(newTable.blinds);
      await tablesApi.create({
        name: newTable.name.trim() || 'Table',
        maxSeats: Number(newTable.seats),
        smallBlind,
        bigBlind: smallBlind * 2,
        // Twenty to five hundred big blinds: deep enough to play, not to bully.
        minBuyIn: smallBlind * 40,
        maxBuyIn: smallBlind * 1000,
        isPrivate: newTable.visibility === 'private',
      });
      setNewTable((current) => ({ ...current, open: false }));
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create table');
    } finally {
      setCreating(false);
    }
  }

  async function deleteTable(id: string) {
    setDeleting(id);
    setError(null);
    try {
      await tablesApi.remove(id);
      setConfirmDelete(null);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete table');
    } finally {
      setDeleting(null);
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
      <View className="flex-row flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          label="Wallet"
          onPress={() => router.push('/wallet')}
          className="w-[48%] flex-1 sm:w-auto"
        />
        <Button
          variant="outline"
          size="sm"
          label="History"
          onPress={() => router.push('/history')}
          className="w-[48%] flex-1 sm:w-auto"
        />
        <Button
          variant="outline"
          size="sm"
          label="Friends"
          onPress={() => router.push('/friends')}
          className="w-[48%] flex-1 sm:w-auto"
        />
        <Button
          variant="outline"
          size="sm"
          label="Ranks"
          onPress={() => router.push('/leaderboard')}
          className="w-[48%] flex-1 sm:w-auto"
        />
      </View>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Tables</CardTitle>
          <View className="flex-row gap-2">
            {canModerate(role) && (
              <Button
                size="sm"
                label={newTable.open ? 'Cancel' : 'Create table'}
                onPress={() => setNewTable((current) => ({ ...current, open: !current.open }))}
              />
            )}
            <Button variant="outline" size="sm" label="Refresh" onPress={() => void refresh()} />
          </View>
        </CardHeader>

        <CardContent className="gap-0">
          {newTable.open && (
            <View className="gap-3 p-3 mb-3 border rounded-md border-border">
              <Input
                label="Name"
                value={newTable.name}
                maxLength={64}
                onChangeText={(name) => setNewTable((current) => ({ ...current, name }))}
              />
              <Tabs
                value={newTable.blinds}
                onChange={(blinds) => setNewTable((current) => ({ ...current, blinds }))}
                options={[
                  { value: '10', label: '10/20' },
                  { value: '25', label: '25/50' },
                  { value: '50', label: '50/100' },
                ]}
              />
              <Tabs
                value={newTable.seats}
                onChange={(seats) => setNewTable((current) => ({ ...current, seats }))}
                options={[
                  { value: '2', label: '2 seats' },
                  { value: '6', label: '6 seats' },
                  { value: '9', label: '9 seats' },
                ]}
              />
              <Tabs
                value={newTable.visibility}
                onChange={(visibility) => setNewTable((current) => ({ ...current, visibility }))}
                options={[
                  { value: 'public', label: 'Public' },
                  { value: 'private', label: 'Private' },
                ]}
              />
              <Button
                label="Open table"
                loading={creating}
                onPress={() => void createTable()}
              />
            </View>
          )}

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
                  'gap-3 py-3',
                  index > 0 && 'border-t border-border',
                )}
              >
                <View className="gap-0.5">
                  <Text className="font-medium" numberOfLines={1}>
                    {table.name}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {table.smallBlind}/{table.bigBlind} · {table.seatedCount}/{table.maxSeats}{' '}
                    seated
                    {table.joinCode ? ` · code ${table.joinCode}` : ''}
                  </Text>
                </View>

                <View className="flex-row flex-wrap items-center gap-2">
                  <Badge
                    label={table.status === 'in_hand' ? 'Playing' : table.status === 'closed' ? 'Closed' : 'Open'}
                    variant={table.status === 'in_hand' ? 'success' : 'secondary'}
                  />
                  <Button
                    size="sm"
                    label={table.viewerSeated ? 'Open' : 'Join'}
                    disabled={table.status === 'closed' || deleting === table.id || (!table.viewerSeated && table.freeSeats.length === 0)}
                    onPress={() => openTable(table)}
                  />
                  {role === 'admin' && (
                    <Button
                      variant="destructive"
                      size="sm"
                      label="Delete table"
                      disabled={deleting !== null}
                      onPress={() => setConfirmDelete(table.id)}
                    />
                  )}
                </View>
                {role === 'admin' && confirmDelete === table.id && (
                  <View className="gap-2 rounded-md border border-border bg-muted p-3">
                    <Text variant="caption">
                      Delete {table.name}? All players will return to the lobby and their chips
                      will be refunded. An unfinished hand will be cancelled. This cannot be undone.
                    </Text>
                    <View className="flex-row gap-2">
                      <Button
                        variant="destructive" size="sm" label="Confirm delete"
                        loading={deleting === table.id} onPress={() => void deleteTable(table.id)}
                      />
                      <Button
                        variant="outline" size="sm" label="Cancel" disabled={deleting !== null}
                        onPress={() => setConfirmDelete(null)}
                      />
                    </View>
                  </View>
                )}
              </View>
            ))
          )}
        </CardContent>
      </Card>

      <View className="flex-row items-end gap-2">
        <Input
          label="Private table"
          placeholder="Join code"
          autoCapitalize="characters"
          value={code}
          onChangeText={setCode}
          containerClassName="flex-1"
        />
        <Button
          variant="outline"
          label="Find"
          disabled={code.trim().length === 0}
          loading={findingCode}
          onPress={() => void joinWithCode()}
        />
      </View>

      {error && (
        <Text variant="caption" tone="destructive">
          {error}
        </Text>
      )}

      <BuyInSheet
        visible={buying !== null}
        title={buying ? `Sit down at ${buying.table.name}` : 'Sit down'}
        min={buying?.table.viewerMinBuyIn ?? 0}
        max={Math.min(buying?.table.maxBuyIn ?? 0, balance ?? 0)}
        hint={
          buying && buying.table.viewerMinBuyIn > buying.table.minBuyIn
            ? 'You left this table recently, so you return with at least what you took.'
            : undefined
        }
        freeSeats={buying?.table.freeSeats}
        confirmLabel="Sit down"
        busy={joining !== null}
        error={buyError}
        onClose={() => setBuying(null)}
        onConfirm={(amount, seat) => void sitDown(amount, seat)}
      />

      {!canModerate(role) && (
        <Text variant="caption" tone="muted" className="text-center">
          Tables are opened by a tournament moderator.
        </Text>
      )}
    </View>
  );
}
