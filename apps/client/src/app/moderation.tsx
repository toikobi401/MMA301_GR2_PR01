import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { canModerate, type ManagedTable, type ManagedUser } from '@app/shared';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Tabs,
  Text,
} from '@/components/ui';
import { formatChips } from '@/components/poker';
import { moderationApi } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/session';

type Tab = 'tables' | 'players';

/**
 * Tournament control.
 *
 * Opens and closes tables, watches who is seated, and bans players. Players
 * cannot open tables themselves any more, so this is the only way one exists.
 */
export default function ModerationScreen() {
  const { user, token, restoring } = useSession();
  const [tab, setTab] = useState<Tab>('tables');

  if (restoring) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="small" />
      </View>
    );
  }

  if (!token || !canModerate(user?.role)) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background p-6">
        <Text variant="bodyStrong">Not available</Text>
        <Text tone="muted" className="max-w-[320px] text-center">
          Tournament control is limited to moderators.
        </Text>
        <Button variant="outline" label="Back to lobby" onPress={() => router.replace('/')} />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="p-6 items-center">
      <View className="w-full max-w-[720px] gap-4">
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'tables', label: 'Tables' },
            { value: 'players', label: 'Players' },
          ]}
        />

        {tab === 'tables' ? <TablePanel /> : <PlayerPanel isAdmin={user?.role === 'admin'} />}
      </View>
    </ScrollView>
  );
}

function TablePanel() {
  const [tables, setTables] = useState<ManagedTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState('');
  const [blinds, setBlinds] = useState('10');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const page = await moderationApi.listTables();
      setTables(page.items);
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

  async function create() {
    const smallBlind = Number(blinds);
    if (!name.trim()) {
      setError('Give the table a name');
      return;
    }
    if (!Number.isFinite(smallBlind) || smallBlind < 1) {
      setError('Small blind must be at least 1');
      return;
    }

    setCreating(true);
    setError(null);
    try {
      await moderationApi.createTable({
        name: name.trim(),
        maxSeats: 6,
        smallBlind,
        bigBlind: smallBlind * 2,
        minBuyIn: smallBlind * 40,
        maxBuyIn: smallBlind * 200,
        isPrivate: false,
      });
      setName('');
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open the table');
    } finally {
      setCreating(false);
    }
  }

  async function close(table: ManagedTable) {
    setBusyId(table.id);
    setError(null);
    try {
      await moderationApi.closeTable(table.id, 'Closed by a moderator');
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not close the table');
    } finally {
      setBusyId(null);
    }
  }

  const open = tables.filter((table) => table.status !== 'closed');
  const closed = tables.filter((table) => table.status === 'closed');

  return (
    <View className="gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Open a table</CardTitle>
        </CardHeader>
        <CardContent className="gap-3">
          <Input label="Name" value={name} onChangeText={setName} placeholder="Friday night" />
          <Input
            label="Small blind"
            value={blinds}
            onChangeText={setBlinds}
            keyboardType="number-pad"
            hint={`Big blind ${Number(blinds) * 2 || 0}, buy-in ${
              Number(blinds) * 40 || 0
            } to ${Number(blinds) * 200 || 0}`}
          />
          <Button label="Open" loading={creating} onPress={() => void create()} block />
        </CardContent>
      </Card>

      {error && (
        <Text variant="caption" tone="destructive">
          {error}
        </Text>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Running ({open.length})</CardTitle>
          <Button variant="outline" size="sm" label="Refresh" onPress={() => void refresh()} />
        </CardHeader>

        <CardContent className="gap-0">
          {loading ? (
            <View className="py-8">
              <ActivityIndicator size="small" />
            </View>
          ) : open.length === 0 ? (
            <EmptyState
              title="No tables running"
              description="Players cannot open tables themselves, so nothing exists until you do."
            />
          ) : (
            open.map((table, index) => (
              <View
                key={table.id}
                className={cn('gap-2 py-3', index > 0 && 'border-t border-border')}
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 gap-0.5">
                    <Text className="font-medium">{table.name}</Text>
                    <Text variant="caption" tone="muted">
                      {table.smallBlind}/{table.bigBlind} · {table.seatedCount}/{table.maxSeats}{' '}
                      seated · hand #{table.handNumber}
                    </Text>
                  </View>

                  <View className="flex-row items-center gap-2">
                    <Badge
                      label={table.status === 'in_hand' ? 'Playing' : 'Idle'}
                      variant={table.status === 'in_hand' ? 'success' : 'secondary'}
                    />
                    <Button
                      size="sm"
                      variant="destructive"
                      label="Close"
                      loading={busyId === table.id}
                      onPress={() => void close(table)}
                    />
                  </View>
                </View>

                {table.seatedPlayers.length > 0 && (
                  <View className="flex-row flex-wrap gap-1.5">
                    {table.seatedPlayers.map((player) => (
                      <View
                        key={player.userId}
                        className="flex-row items-center gap-1 rounded bg-muted px-2 py-1"
                      >
                        <Text variant="caption">{player.displayName}</Text>
                        {player.isBot && (
                          <Text variant="caption" tone="muted">
                            bot
                          </Text>
                        )}
                        <Text variant="caption" tone="muted">
                          {formatChips(player.stack)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))
          )}
        </CardContent>
      </Card>

      {closed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Closed ({closed.length})</CardTitle>
          </CardHeader>
          <CardContent className="gap-0">
            {closed.slice(0, 8).map((table, index) => (
              <View
                key={table.id}
                className={cn(
                  'flex-row items-center justify-between py-2.5',
                  index > 0 && 'border-t border-border',
                )}
              >
                <Text tone="muted">{table.name}</Text>
                <Text variant="caption" tone="muted">
                  {table.handNumber} hands
                </Text>
              </View>
            ))}
          </CardContent>
        </Card>
      )}
    </View>
  );
}

function PlayerPanel({ isAdmin }: { isAdmin: boolean }) {
  const [players, setPlayers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState<ManagedUser | null>(null);
  const [reason, setReason] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const page = await moderationApi.listUsers(query.trim() || undefined);
      setPlayers(page.items);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load accounts');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 280);
    return () => clearTimeout(timer);
  }, [refresh]);

  async function ban() {
    if (!banTarget) return;
    if (!reason.trim()) {
      setError('A ban needs a reason');
      return;
    }

    setBusyId(banTarget.id);
    setError(null);
    try {
      await moderationApi.ban(banTarget.id, { reason: reason.trim() });
      setBanTarget(null);
      setReason('');
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not apply the ban');
    } finally {
      setBusyId(null);
    }
  }

  async function unban(player: ManagedUser) {
    setBusyId(player.id);
    setError(null);
    try {
      await moderationApi.unban(player.id);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not lift the ban');
    } finally {
      setBusyId(null);
    }
  }

  async function promote(player: ManagedUser) {
    setBusyId(player.id);
    setError(null);
    try {
      await moderationApi.setRole(
        player.id,
        player.role === 'moderator' ? 'user' : 'moderator',
      );
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not change the role');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View className="gap-4">
      <Input
        label="Search"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        placeholder="Name"
      />

      {banTarget && (
        <Card>
          <CardHeader>
            <CardTitle>Ban {banTarget.displayName}</CardTitle>
          </CardHeader>
          <CardContent className="gap-3">
            <Text variant="caption" tone="muted">
              Their chips are untouched. If they are in a hand they will be folded and removed
              once it finishes.
            </Text>
            <Input
              label="Reason"
              value={reason}
              onChangeText={setReason}
              placeholder="Why are they being banned?"
            />
            <View className="flex-row gap-2">
              <Button
                variant="outline"
                label="Cancel"
                onPress={() => {
                  setBanTarget(null);
                  setReason('');
                }}
                className="flex-1"
              />
              <Button
                variant="destructive"
                label="Ban"
                loading={busyId === banTarget.id}
                onPress={() => void ban()}
                className="flex-1"
              />
            </View>
          </CardContent>
        </Card>
      )}

      {error && (
        <Text variant="caption" tone="destructive">
          {error}
        </Text>
      )}

      <Card>
        <CardContent className="gap-0 pt-4">
          {loading ? (
            <View className="py-8">
              <ActivityIndicator size="small" />
            </View>
          ) : players.length === 0 ? (
            <EmptyState title="Nobody matched" />
          ) : (
            players.map((player, index) => (
              <View
                key={player.id}
                className={cn(
                  'flex-row items-center gap-3 py-3',
                  index > 0 && 'border-t border-border',
                )}
              >
                <Avatar name={player.displayName} size="sm" />

                <View className="flex-1 gap-0.5">
                  <View className="flex-row items-center gap-1.5">
                    <Text className="font-medium" numberOfLines={1}>
                      {player.displayName}
                    </Text>
                    {player.role !== 'user' && (
                      <Badge label={player.role} variant="secondary" />
                    )}
                    {player.isBot && <Badge label="bot" variant="muted" />}
                    {player.ban && <Badge label="banned" variant="destructive" />}
                  </View>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {player.ban
                      ? player.ban.reason
                      : `${formatChips(player.chips)} · ${player.handsPlayed} hands`}
                  </Text>
                </View>

                <View className="flex-row gap-1.5">
                  {isAdmin && !player.isBot && player.role !== 'admin' && (
                    <Button
                      size="sm"
                      variant="outline"
                      label={player.role === 'moderator' ? 'Demote' : 'Promote'}
                      loading={busyId === player.id}
                      onPress={() => void promote(player)}
                    />
                  )}

                  {player.ban ? (
                    <Button
                      size="sm"
                      variant="outline"
                      label="Unban"
                      loading={busyId === player.id}
                      onPress={() => void unban(player)}
                    />
                  ) : (
                    !player.isBot && (
                      <Button
                        size="sm"
                        variant="destructive"
                        label="Ban"
                        onPress={() => {
                          setBanTarget(player);
                          setReason('');
                        }}
                      />
                    )
                  )}
                </View>
              </View>
            ))
          )}
        </CardContent>
      </Card>
    </View>
  );
}
