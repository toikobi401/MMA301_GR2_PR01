import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import type { Friend } from '@app/shared';
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
  StatusDot,
  Tabs,
  Text,
} from '@/components/ui';
import { friendsApi } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/session';

type Tab = 'friends' | 'requests' | 'find';

/**
 * Friends list.
 *
 * Everything here runs against mocks — the server has no friends endpoints
 * yet, though the contracts exist. See `src/lib/mock-api.ts` for the exact
 * routes that need building.
 */
export default function FriendsScreen() {
  const { token, restoring } = useSession();
  const [tab, setTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ userId: string; displayName: string }>>([]);
  const [searching, setSearching] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setFriends(await friendsApi.list());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Debounced so a search does not fire on every keystroke.
  useEffect(() => {
    if (tab !== 'find') return;
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    setSearching(true);
    const timer = setTimeout(async () => {
      setResults(await friendsApi.search(query));
      setSearching(false);
    }, 280);

    return () => clearTimeout(timer);
  }, [query, tab]);

  // Wait for the stored session to be exchanged, or every reload flashes the
  // signed-out view before the token arrives.
  if (restoring) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="small" />
      </View>
    );
  }

  if (!token) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text tone="muted">Sign in to see your friends.</Text>
        <Button label="Go to lobby" className="mt-4" onPress={() => router.replace('/')} />
      </View>
    );
  }

  const accepted = friends.filter((friend) => friend.status === 'accepted');
  const incoming = friends.filter((friend) => friend.status === 'pending' && !friend.outgoing);
  const outgoing = friends.filter((friend) => friend.status === 'pending' && friend.outgoing);

  async function act(userId: string, action: 'accept' | 'remove') {
    setPendingId(userId);
    if (action === 'accept') await friendsApi.accept(userId);
    else await friendsApi.remove(userId);
    await refresh();
    setPendingId(null);
  }

  async function add(displayName: string) {
    setPendingId(displayName);
    await friendsApi.request(displayName);
    setQuery('');
    setResults([]);
    await refresh();
    setPendingId(null);
    setTab('requests');
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="p-6 items-center">
      <View className="w-full max-w-[680px] gap-4">
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'friends', label: `Friends (${accepted.length})` },
            { value: 'requests', label: `Requests (${incoming.length})` },
            { value: 'find', label: 'Find' },
          ]}
        />

        {loading ? (
          <View className="py-10">
            <ActivityIndicator size="small" />
          </View>
        ) : tab === 'friends' ? (
          <Card>
            <CardContent className="gap-0 pt-4">
              {accepted.length === 0 ? (
                <EmptyState
                  title="No friends yet"
                  description="Find people to play with and they will show up here."
                  actionLabel="Find people"
                  onAction={() => setTab('find')}
                />
              ) : (
                accepted.map((friend, index) => (
                  <FriendRow
                    key={friend.userId}
                    friend={friend}
                    first={index === 0}
                    busy={pendingId === friend.userId}
                    onRemove={() => void act(friend.userId, 'remove')}
                  />
                ))
              )}
            </CardContent>
          </Card>
        ) : tab === 'requests' ? (
          <View className="gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Waiting for you</CardTitle>
              </CardHeader>
              <CardContent className="gap-0">
                {incoming.length === 0 ? (
                  <EmptyState title="Nothing to answer" />
                ) : (
                  incoming.map((friend, index) => (
                    <FriendRow
                      key={friend.userId}
                      friend={friend}
                      first={index === 0}
                      busy={pendingId === friend.userId}
                      onAccept={() => void act(friend.userId, 'accept')}
                      onRemove={() => void act(friend.userId, 'remove')}
                    />
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sent</CardTitle>
              </CardHeader>
              <CardContent className="gap-0">
                {outgoing.length === 0 ? (
                  <EmptyState title="No requests sent" />
                ) : (
                  outgoing.map((friend, index) => (
                    <FriendRow
                      key={friend.userId}
                      friend={friend}
                      first={index === 0}
                      busy={pendingId === friend.userId}
                      onRemove={() => void act(friend.userId, 'remove')}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          </View>
        ) : (
          <Card>
            <CardContent className="gap-3 pt-4">
              <Input
                label="Search by name"
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                placeholder="At least two letters"
              />

              {searching ? (
                <ActivityIndicator size="small" />
              ) : results.length === 0 ? (
                <Text variant="caption" tone="muted">
                  {query.trim().length < 2 ? 'Type to search.' : 'Nobody matched that.'}
                </Text>
              ) : (
                <View className="gap-0">
                  {results.map((person, index) => (
                    <View
                      key={person.userId}
                      className={cn(
                        'flex-row items-center justify-between py-2.5',
                        index > 0 && 'border-t border-border',
                      )}
                    >
                      <View className="flex-row items-center gap-2">
                        <Avatar name={person.displayName} size="sm" />
                        <Text>{person.displayName}</Text>
                      </View>
                      <Button
                        size="sm"
                        label="Add"
                        loading={pendingId === person.displayName}
                        onPress={() => void add(person.displayName)}
                      />
                    </View>
                  ))}
                </View>
              )}
            </CardContent>
          </Card>
        )}

        <Text variant="caption" tone="muted" className="text-center">
          Friends run on placeholder data until the server exposes the endpoints.
        </Text>
      </View>
    </ScrollView>
  );
}

function FriendRow({
  friend,
  first,
  busy,
  onAccept,
  onRemove,
}: {
  friend: Friend;
  first: boolean;
  busy: boolean;
  onAccept?: () => void;
  onRemove?: () => void;
}) {
  return (
    <View
      className={cn(
        'flex-row items-center justify-between py-3',
        !first && 'border-t border-border',
      )}
    >
      <View className="flex-row items-center gap-3">
        <Avatar name={friend.displayName} size="sm" />
        <View className="gap-0.5">
          <Text className="font-medium">{friend.displayName}</Text>
          <View className="flex-row items-center gap-1.5">
            <StatusDot className={friend.online ? 'bg-success' : 'bg-muted-foreground'} />
            <Text variant="caption" tone="muted">
              {friend.online ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>
      </View>

      <View className="flex-row items-center gap-2">
        {friend.status === 'pending' && !onAccept && <Badge label="Sent" variant="muted" />}
        {onAccept && <Button size="sm" label="Accept" loading={busy} onPress={onAccept} />}
        {onRemove && (
          <Button
            size="sm"
            variant="outline"
            label={onAccept ? 'Decline' : 'Remove'}
            loading={busy && !onAccept}
            onPress={onRemove}
          />
        )}
      </View>
    </View>
  );
}
