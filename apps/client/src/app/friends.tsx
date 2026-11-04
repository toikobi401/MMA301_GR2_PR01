import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { Friend, UserSearchResult } from '@app/shared';
import {
  ActionButton,
  EmptyState,
  FriendGroup,
  FriendRow,
} from '@/components/friends/friends-ui';
import { friendsApi } from '@/lib/api-client';
import { friendsTabs, type FriendsTab } from '@/lib/friends-tabs';
import { useHydrated } from '@/lib/use-hydrated';
import { useSession } from '@/lib/session';

export default function FriendsScreen() {
  const [tab, setTab] = useState<FriendsTab>('friends');
  const hydrated = useHydrated();
  const { token, restoring } = useSession();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      setFriends((await friendsApi.list()).items);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tải được danh sách bạn bè');
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const accepted = friends.filter((friend) => friend.status === 'accepted');
  const online = accepted.filter((friend) => friend.online);
  const offline = accepted.filter((friend) => !friend.online);
  const incoming = friends.filter((friend) => friend.status === 'pending' && !friend.outgoing);
  const outgoing = friends.filter((friend) => friend.status === 'pending' && friend.outgoing);

  // Waits for a pause in typing, and ignores an answer that arrives after the
  // query has moved on: searches can finish out of order.
  useEffect(() => {
    const term = query.trim();
    if (!token || term.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    let stale = false;
    setSearching(true);
    const timer = setTimeout(() => {
      friendsApi
        .search(term)
        .then(({ items }) => {
          if (!stale) setSearchResults(items);
        })
        .catch((caught: unknown) => {
          if (!stale) setError(caught instanceof Error ? caught.message : 'Không tìm được');
        })
        .finally(() => {
          if (!stale) setSearching(false);
        });
    }, 300);

    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query, token]);

  const known = new Set(friends.map((friend) => friend.userId));
  const people = searchResults.filter((person) => !known.has(person.userId));

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thực hiện được');
    }
  }

  function removeFriend(userId: string) {
    void run(() => friendsApi.remove(userId));
  }

  function acceptFriend(userId: string) {
    void run(() => friendsApi.accept(userId));
  }

  function sendRequest(person: UserSearchResult) {
    void run(() => friendsApi.request(person.userId));
    setTab('requests');
  }

  // Every branch below depends on the session, which the prerendered HTML does
  // not have; deciding earlier makes hydration disagree with it (React #418).
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
        <Text className="text-muted-foreground">Đăng nhập để xem bạn bè.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="min-h-full items-center px-4 py-8 sm:px-6"
      keyboardShouldPersistTaps="handled"
    >
      <View className="w-full max-w-2xl gap-6">
        <View className="gap-4">
          <Link href="/" asChild>
            <Pressable
              accessibilityRole="button"
              className="min-h-11 self-start justify-center rounded-md px-1"
            >
              <Text className="font-medium text-primary">‹  Về sảnh</Text>
            </Pressable>
          </Link>
          <View className="gap-1">
            <Text className="text-3xl font-bold text-foreground">Bạn bè</Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              Kết nối với mọi người và tìm bạn cùng chơi.
            </Text>
          </View>
        </View>

        <View
          accessibilityRole="tablist"
          className="flex-row rounded-xl border border-border bg-card p-1"
        >
          {friendsTabs.map((item) => {
            const count =
              item.id === 'friends'
                ? accepted.length
                : item.id === 'requests'
                  ? incoming.length
                  : null;
            const selected = tab === item.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                className={`min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-lg px-2 py-2 ${selected ? 'bg-primary' : ''}`}
                onPress={() => setTab(item.id)}
              >
                <Text
                  className={`text-center text-sm font-semibold ${selected ? 'text-primary-foreground' : 'text-muted-foreground'}`}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
                {count !== null && (
                  <Text
                    className={`min-w-5 rounded-full px-1 text-center text-xs font-bold ${selected ? 'bg-card text-primary' : 'bg-secondary text-secondary-foreground'}`}
                  >
                    {count}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>

        <View className="rounded-xl border border-border bg-card p-4 sm:p-6">
          {tab === 'friends' ? (
            accepted.length === 0 ? (
              <EmptyState
                title="Bạn chưa có bạn bè"
                description="Tìm người chơi poker khác để kết bạn. Họ sẽ xuất hiện ở đây."
                actionLabel="Tìm người"
                onAction={() => setTab('search')}
              />
            ) : (
              <View className="gap-5">
                {online.length > 0 && (
                  <FriendGroup title={`Đang trực tuyến · ${online.length}`}>
                    {online.map((friend) => (
                      <FriendRow
                        key={friend.userId}
                        friend={friend}
                        onRemove={() => removeFriend(friend.userId)}
                      />
                    ))}
                  </FriendGroup>
                )}
                {offline.length > 0 && (
                  <FriendGroup title={`Ngoại tuyến · ${offline.length}`}>
                    {offline.map((friend) => (
                      <FriendRow
                        key={friend.userId}
                        friend={friend}
                        onRemove={() => removeFriend(friend.userId)}
                      />
                    ))}
                  </FriendGroup>
                )}
              </View>
            )
          ) : tab === 'requests' ? (
            incoming.length + outgoing.length === 0 ? (
              <EmptyState
                title="Chưa có lời mời nào"
                description="Lời mời bạn gửi hoặc nhận sẽ xuất hiện ở đây."
                actionLabel="Tìm người"
                onAction={() => setTab('search')}
              />
            ) : (
              <View className="gap-5">
                {incoming.length > 0 && (
                  <FriendGroup title="Lời mời bạn nhận">
                    {incoming.map((friend) => (
                      <FriendRow
                        key={friend.userId}
                        friend={friend}
                        onAccept={() => acceptFriend(friend.userId)}
                        onRemove={() => removeFriend(friend.userId)}
                      />
                    ))}
                  </FriendGroup>
                )}
                {outgoing.length > 0 && (
                  <FriendGroup title="Lời mời bạn đã gửi">
                    {outgoing.map((friend) => (
                      <FriendRow
                        key={friend.userId}
                        friend={friend}
                        onRemove={() => removeFriend(friend.userId)}
                      />
                    ))}
                  </FriendGroup>
                )}
              </View>
            )
          ) : (
            <View className="gap-4">
              <View className="gap-2">
                <Text className="font-semibold text-card-foreground">Tìm người chơi</Text>
                <Text className="text-sm leading-5 text-muted-foreground">
                  Nhập ít nhất 2 ký tự để tìm theo tên hiển thị.
                </Text>
                <TextInput
                  accessibilityLabel="Tìm theo tên"
                  autoCapitalize="none"
                  className="rounded-lg border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground"
                  onChangeText={setQuery}
                  placeholder="Ví dụ: Ada"
                  returnKeyType="search"
                  value={query}
                />
              </View>
              {query.trim().length < 2 ? (
                <EmptyState
                  title="Bắt đầu tìm kiếm"
                  description="Gõ ít nhất 2 ký tự để xem danh sách người chơi phù hợp."
                />
              ) : searching ? (
                <ActivityIndicator size="small" />
              ) : people.length === 0 ? (
                <EmptyState
                  title="Không tìm thấy người chơi"
                  description="Thử tìm bằng tên khác. Người đã là bạn hoặc đang có lời mời sẽ không hiện ở đây."
                />
              ) : (
                <View>
                  {people.map((person) => (
                    <View
                      key={person.userId}
                      className="flex-row items-center justify-between gap-3 border-t border-border py-4"
                    >
                      <View className="flex-row items-center gap-3">
                        <View className="h-11 w-11 items-center justify-center rounded-full bg-secondary">
                          <Text className="font-bold text-secondary-foreground">
                            {person.displayName.slice(0, 1)}
                          </Text>
                        </View>
                        <Text className="font-semibold text-card-foreground">
                          {person.displayName}
                        </Text>
                      </View>
                      <ActionButton
                        label="Thêm bạn"
                        onPress={() => sendRequest(person)}
                      />
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
        {error && <Text className="text-center text-xs text-destructive">{error}</Text>}
      </View>
    </ScrollView>
  );
}
