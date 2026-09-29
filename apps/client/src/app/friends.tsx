import { router } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import type { Friend } from '@app/shared';
import {
  Avatar,
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  StatusDot,
  Tabs,
  Text,
} from '@/components/ui';
import { friendsApi } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { useHydrated } from '@/lib/use-hydrated';
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
  const hydrated = useHydrated();
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
  // The prerendered HTML has no session, so deciding before hydration makes
  // the first client render disagree with it (React #418).
  if (!hydrated || restoring) {
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
  // Online first: those are the people a player can actually sit down with.
  const online = accepted.filter((friend) => friend.online);
  const offline = accepted.filter((friend) => !friend.online);
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
            { value: 'requests', label: 'Requests', count: incoming.length },
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
                <>
                  <Group title="Online now" first>
                    {online.map((friend, index) => (
                      <FriendRow
                        key={friend.userId}
                        friend={friend}
                        first={index === 0}
                        busy={pendingId === friend.userId}
                        onRemove={() => void act(friend.userId, 'remove')}
                      />
                    ))}
                  </Group>
                  <Group title="Offline" first={online.length === 0}>
                    {offline.map((friend, index) => (
                      <FriendRow
                        key={friend.userId}
                        friend={friend}
                        first={index === 0}
                        busy={pendingId === friend.userId}
                        onRemove={() => void act(friend.userId, 'remove')}
                      />
                    ))}
                  </Group>
                </>
              )}
            </CardContent>
          </Card>
        ) : tab === 'requests' ? (
          <Card>
            <CardContent className="gap-0 pt-4">
              {incoming.length === 0 && outgoing.length === 0 ? (
                <EmptyState
                  title="No requests"
                  description="Requests you send or receive wait here until they are answered."
                  actionLabel="Find people"
                  onAction={() => setTab('find')}
                />
              ) : (
                <>
                  <Group title="Waiting for you" first>
                    {incoming.map((friend, index) => (
                      <FriendRow
                        key={friend.userId}
                        friend={friend}
                        first={index === 0}
                        busy={pendingId === friend.userId}
                        onAccept={() => void act(friend.userId, 'accept')}
                        onRemove={() => void act(friend.userId, 'remove')}
                      />
                    ))}
                  </Group>
                  <Group title="You sent" first={incoming.length === 0}>
                    {outgoing.map((friend, index) => (
                      <FriendRow
                        key={friend.userId}
                        friend={friend}
                        first={index === 0}
                        busy={pendingId === friend.userId}
                        onRemove={() => void act(friend.userId, 'remove')}
                      />
                    ))}
                  </Group>
                </>
              )}
            </CardContent>
          </Card>
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
                        label="Add friend"
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

/** A titled run of rows inside one card. Renders nothing when empty. */
function Group({
  title,
  first,
  children,
}: {
  title: string;
  first: boolean;
  children: ReactNode[];
}) {
  if (children.length === 0) return null;

  return (
    <View className={cn(!first && 'mt-1 border-t border-border pt-4')}>
      <Text variant="caption" tone="muted">
        {title}
      </Text>
      {children}
    </View>
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
  const pending = friend.status === 'pending';
  const subtitle = !pending
    ? friend.online
      ? 'Online'
      : 'Offline'
    : friend.outgoing
      ? 'Waiting for an answer'
      : 'Wants to be friends';

  return (
    <View
      className={cn(
        'flex-row items-center justify-between py-3',
        !first && 'border-t border-border',
      )}
    >
      <View className="flex-1 flex-row items-center gap-3">
        <View>
          <Avatar name={friend.displayName} size="sm" />
          {!pending && friend.online && (
            <StatusDot className="absolute -bottom-0.5 -right-0.5 h-3 w-3 border-2 border-card bg-success" />
          )}
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="font-medium" numberOfLines={1}>
            {friend.displayName}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center gap-2">
        {onAccept && onRemove && (
          <Button size="sm" variant="outline" label="Decline" onPress={onRemove} />
        )}
        {onAccept && <Button size="sm" label="Accept" loading={busy} onPress={onAccept} />}
        {onRemove && !onAccept && (
          <Button
            size="sm"
            variant="outline"
            label={pending ? 'Cancel' : 'Remove'}
            loading={busy}
            onPress={onRemove}
          />
        )}
      </View>
    </View>
  );
}
