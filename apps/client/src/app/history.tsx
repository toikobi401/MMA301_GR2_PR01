import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import type { HandDetail, HandSummary } from '@app/shared';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Text,
} from '@/components/ui';
import { CardRow, formatChips } from '@/components/poker';
import { handsApi } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { useHydrated } from '@/lib/use-hydrated';
import { useSession } from '@/lib/session';

/**
 * Hand history, with per-action replay.
 *
 * Mocked: the server writes finished hands to Mongo but exposes no read
 * endpoint. The stored documents already contain every action with a
 * millisecond offset, which is what makes the replay below possible.
 */
export default function HistoryScreen() {
  const hydrated = useHydrated();
  const { token, restoring } = useSession();
  const [hands, setHands] = useState<HandSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<HandDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setHands(await handsApi.list());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function open(id: string) {
    setLoadingDetail(true);
    setSelected(await handsApi.detail(id));
    setLoadingDetail(false);
  }

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
        <Text tone="muted">Sign in to see your hands.</Text>
        <Button label="Go to lobby" className="mt-4" onPress={() => router.replace('/')} />
      </View>
    );
  }

  if (selected) {
    return <HandReplay hand={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="p-6 items-center">
      <View className="w-full max-w-[680px] gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Recent hands</CardTitle>
          </CardHeader>

          <CardContent className="gap-0">
            {loading || loadingDetail ? (
              <View className="py-10">
                <ActivityIndicator size="small" />
              </View>
            ) : hands.length === 0 ? (
              <EmptyState
                title="No hands yet"
                description="Every hand you play is recorded here, action by action."
                actionLabel="Find a table"
                onAction={() => router.replace('/')}
              />
            ) : (
              hands.map((hand, index) => (
                <Pressable
                  key={hand.id}
                  accessibilityRole="button"
                  onPress={() => void open(hand.id)}
                  className={cn(
                    'gap-2 py-3 active:opacity-70',
                    index > 0 && 'border-t border-border',
                  )}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="gap-0.5">
                      <Text className="font-medium">
                        {hand.tableName} · #{hand.handNumber}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {new Date(hand.startedAt).toLocaleString()} · pot{' '}
                        {formatChips(hand.potTotal)}
                      </Text>
                    </View>

                    <Text
                      variant="numeric"
                      className={cn(
                        'font-medium',
                        hand.netChips >= 0 ? 'text-success' : 'text-destructive',
                      )}
                    >
                      {hand.netChips >= 0 ? '+' : ''}
                      {formatChips(hand.netChips)}
                    </Text>
                  </View>

                  {hand.board.length > 0 && <CardRow cards={hand.board} size="sm" />}
                </Pressable>
              ))
            )}
          </CardContent>
        </Card>

        <Text variant="caption" tone="muted" className="text-center">
          Placeholder data until the server exposes a hand-history endpoint.
        </Text>
      </View>
    </ScrollView>
  );
}

const STREET_LABEL: Record<string, string> = {
  preflop: 'Preflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
};

const ACTION_LABEL: Record<string, string> = {
  post_blind: 'posts',
  fold: 'folds',
  check: 'checks',
  call: 'calls',
  bet: 'bets',
  raise: 'raises to',
};

function HandReplay({ hand, onBack }: { hand: HandDetail; onBack: () => void }) {
  // How many actions to reveal. Stepping through is the whole point of
  // storing actions individually rather than only a final summary.
  const [step, setStep] = useState(hand.actions.length);

  const visible = hand.actions.slice(0, step);
  const street = visible[visible.length - 1]?.street ?? 'preflop';

  // The board fills as the streets arrive, so the replay shows what each
  // player could actually see when they acted.
  const cardsShown =
    street === 'preflop' ? 0 : street === 'flop' ? 3 : street === 'turn' ? 4 : 5;

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="p-6 items-center">
      <View className="w-full max-w-[680px] gap-4">
        <View className="flex-row items-center justify-between">
          <Button variant="ghost" size="sm" label="← Back" onPress={onBack} />
          <Text variant="caption" tone="muted">
            {hand.tableName} · hand #{hand.handNumber}
          </Text>
        </View>

        <Card>
          <CardContent className="items-center gap-3 pt-4">
            <CardRow cards={hand.board.slice(0, cardsShown)} placeholders={5 - cardsShown} />
            <Text variant="caption" tone="muted">
              Pot {formatChips(hand.potTotal)}
            </Text>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Players</CardTitle>
          </CardHeader>
          <CardContent className="gap-0">
            {hand.players.map((player, index) => (
              <View
                key={player.userId}
                className={cn(
                  'flex-row items-center justify-between py-2.5',
                  index > 0 && 'border-t border-border',
                )}
              >
                <View className="gap-1">
                  <Text className="font-medium">{player.displayName}</Text>
                  {player.handRank && (
                    <Text variant="caption" tone="muted">
                      {player.handRank}
                    </Text>
                  )}
                </View>

                <View className="flex-row items-center gap-3">
                  {player.holeCards && <CardRow cards={player.holeCards} size="sm" />}
                  <Text
                    variant="numeric"
                    className={cn(
                      'w-16 text-right font-medium',
                      player.netChips >= 0 ? 'text-success' : 'text-destructive',
                    )}
                  >
                    {player.netChips >= 0 ? '+' : ''}
                    {formatChips(player.netChips)}
                  </Text>
                </View>
              </View>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Replay</CardTitle>
            <Text variant="caption" tone="muted">
              {step} of {hand.actions.length}
            </Text>
          </CardHeader>

          <CardContent className="gap-3">
            <View className="flex-row gap-2">
              <Button
                variant="outline"
                size="sm"
                label="Start"
                onPress={() => setStep(0)}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                label="Back"
                disabled={step === 0}
                onPress={() => setStep((current) => Math.max(0, current - 1))}
                className="flex-1"
              />
              <Button
                size="sm"
                label="Next"
                disabled={step >= hand.actions.length}
                onPress={() => setStep((current) => Math.min(hand.actions.length, current + 1))}
                className="flex-1"
              />
            </View>

            <View className="gap-0">
              {visible.map((action, index) => {
                const newStreet = index === 0 || visible[index - 1]?.street !== action.street;
                return (
                  <View key={action.sequence}>
                    {newStreet && (
                      <Text
                        variant="label"
                        tone="muted"
                        className={cn('pt-3', index === 0 && 'pt-0')}
                      >
                        {STREET_LABEL[action.street] ?? action.street}
                      </Text>
                    )}
                    <View className="flex-row items-center justify-between py-1.5">
                      <Text variant="caption">
                        <Text variant="caption" className="font-medium">
                          {action.displayName ?? 'Unknown'}
                        </Text>{' '}
                        {ACTION_LABEL[action.action] ?? action.action}
                        {action.amount > 0 ? ` ${formatChips(action.amount)}` : ''}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {(action.offsetMs / 1000).toFixed(1)}s
                      </Text>
                    </View>
                  </View>
                );
              })}

              {visible.length === 0 && (
                <Text variant="caption" tone="muted" className="py-3">
                  Press Next to step through the hand.
                </Text>
              )}
            </View>
          </CardContent>
        </Card>
      </View>
    </ScrollView>
  );
}
