import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import type { Leaderboard, LeaderboardEntry, LeaderboardScope } from '@app/shared';
import {
  Avatar,
  Button,
  Card,
  CardContent,
  CardSeparator,
  EmptyState,
  Tabs,
  Text,
} from '@/components/ui';
import { formatChips } from '@/components/poker';
import { leaderboardApi } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { useHydrated } from '@/lib/use-hydrated';
import { useSession } from '@/lib/session';

const SCOPES = [
  { value: 'net_chips' as const, label: 'Chips' },
  { value: 'hands_won' as const, label: 'Hands won' },
  { value: 'biggest_pot' as const, label: 'Biggest pot' },
];

/**
 * Rankings.
 *
 * Mocked: the server writes playerStats but exposes no endpoint to read them.
 * Bots are excluded from the stats collection already, so the live version
 * needs no filtering.
 */
export default function LeaderboardScreen() {
  const hydrated = useHydrated();
  const { user, token, restoring } = useSession();
  const [scope, setScope] = useState<LeaderboardScope>('net_chips');
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setBoard(await leaderboardApi.fetch(scope, user?.displayName ?? 'You'));
    setLoading(false);
  }, [scope, user?.displayName]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
        <Text tone="muted">Sign in to see the rankings.</Text>
        <Button label="Go to lobby" className="mt-4" onPress={() => router.replace('/')} />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="p-6 items-center">
      <View className="w-full max-w-[680px] gap-4">
        <Tabs value={scope} onChange={setScope} options={SCOPES} />

        <Card>
          <CardContent className="gap-0 pt-4">
            {loading ? (
              <View className="py-10">
                <ActivityIndicator size="small" />
              </View>
            ) : (board?.entries.length ?? 0) === 0 ? (
              <EmptyState
                title="Nobody has played yet"
                description="Rankings appear once hands have been dealt."
              />
            ) : (
              <>
                {board?.entries.map((entry, index) => (
                  <Row
                    key={entry.userId}
                    entry={entry}
                    scope={scope}
                    first={index === 0}
                    isViewer={entry.userId === user?.id}
                  />
                ))}

                {/* The viewer usually sits outside the top ten, so their own
                    row is pinned below rather than being absent. */}
                {board?.viewerRank &&
                  !board.entries.some((entry) => entry.userId === board.viewerRank?.userId) && (
                    <>
                      <CardSeparator className="my-2" />
                      <Row entry={board.viewerRank} scope={scope} first isViewer />
                    </>
                  )}
              </>
            )}
          </CardContent>
        </Card>

        <Text variant="caption" tone="muted" className="text-center">
          Placeholder data. Bots never appear in the rankings.
        </Text>
      </View>
    </ScrollView>
  );
}

function Row({
  entry,
  scope,
  first,
  isViewer,
}: {
  entry: LeaderboardEntry;
  scope: LeaderboardScope;
  first: boolean;
  isViewer: boolean;
}) {
  const positive = entry.score >= 0;

  return (
    <View
      className={cn(
        'flex-row items-center gap-3 py-2.5',
        !first && 'border-t border-border',
        isViewer && 'rounded-md bg-accent/10 px-2',
      )}
    >
      <Text
        variant="numeric"
        className={cn('w-7 text-right', entry.rank <= 3 ? 'font-bold' : 'text-muted-foreground')}
      >
        {entry.rank}
      </Text>

      <Avatar name={entry.displayName} size="sm" />

      <View className="flex-1 gap-0.5">
        <Text className={cn('font-medium', isViewer && 'text-accent')} numberOfLines={1}>
          {entry.displayName}
          {isViewer ? ' (you)' : ''}
        </Text>
        <Text variant="caption" tone="muted">
          {entry.handsPlayed} hands
        </Text>
      </View>

      <Text
        variant="numeric"
        className={cn(
          'font-medium',
          scope === 'net_chips' && (positive ? 'text-success' : 'text-destructive'),
        )}
      >
        {scope === 'net_chips' && positive ? '+' : ''}
        {scope === 'hands_won' ? entry.score : formatChips(entry.score)}
      </Text>
    </View>
  );
}
