import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import type { HandDetail, HandSummary } from '@app/shared';
import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Text } from '@/components/ui';
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
  const { user, token, restoring } = useSession();
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

  const days = useMemo(() => groupByDay(hands), [hands]);
  const won = hands.filter((hand) => hand.netChips > 0).length;
  const net = hands.reduce((sum, hand) => sum + hand.netChips, 0);

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
    return (
      <HandReplay hand={selected} viewerId={user?.id ?? null} onBack={() => setSelected(null)} />
    );
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="p-6 items-center">
      <View className="w-full max-w-[680px] gap-4">
        {loading || loadingDetail ? (
          <View className="py-10">
            <ActivityIndicator size="small" />
          </View>
        ) : hands.length === 0 ? (
          <Card>
            <CardContent className="pt-4">
              <EmptyState
                title="No hands yet"
                description="Every hand you play is recorded here, action by action."
                actionLabel="Find a table"
                onAction={() => router.replace('/')}
              />
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Totals over exactly the hands listed below, so the numbers can
                be checked against the list by eye. */}
            <View className="flex-row rounded-lg border border-border bg-card">
              <Stat label="Hands" value={String(hands.length)} />
              <Stat label="Won" value={String(won)} divided />
              <Stat
                label="Net"
                value={`${net >= 0 ? '+' : '−'}${formatChips(Math.abs(net))}`}
                tone={net >= 0 ? 'success' : 'destructive'}
                divided
              />
            </View>

            <Card>
              <CardContent className="gap-0 pt-4">
                {days.map((day, dayIndex) => (
                  <View
                    key={day.label}
                    className={cn(dayIndex > 0 && 'mt-1 border-t border-border pt-4')}
                  >
                    <Text variant="caption" tone="muted">
                      {day.label}
                    </Text>

                    {day.hands.map((hand, index) => (
                      <Pressable
                        key={hand.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Replay ${hand.tableName}, hand ${hand.handNumber}`}
                        onPress={() => void open(hand.id)}
                        className={cn(
                          'gap-2 py-3 active:opacity-70',
                          index > 0 && 'border-t border-border',
                        )}
                      >
                        <View className="flex-row items-start justify-between gap-3">
                          <View className="flex-1 gap-0.5">
                            <Text className="font-medium">
                              {hand.tableName}, hand {hand.handNumber}
                            </Text>
                            <Text variant="caption" tone="muted">
                              {formatTime(hand.startedAt)} · pot{' '}
                              <Text variant="numeric" className="text-sm text-muted-foreground">
                                {formatChips(hand.potTotal)}
                              </Text>
                            </Text>
                          </View>
                          <SignedChips amount={hand.netChips} />
                        </View>

                        {hand.board.length > 0 ? (
                          <CardRow cards={hand.board} size="sm" />
                        ) : (
                          <Text variant="caption" tone="muted">
                            Ended before the flop
                          </Text>
                        )}
                      </Pressable>
                    ))}
                  </View>
                ))}
              </CardContent>
            </Card>
          </>
        )}

        <Text variant="caption" tone="muted" className="text-center">
          Placeholder data until the server exposes a hand-history endpoint.
        </Text>
      </View>
    </ScrollView>
  );
}

function Stat({
  label,
  value,
  tone,
  divided = false,
}: {
  label: string;
  value: string;
  tone?: 'success' | 'destructive';
  divided?: boolean;
}) {
  return (
    <View className={cn('flex-1 gap-0.5 p-3', divided && 'border-l border-border')}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text
        variant="numeric"
        className={cn(
          'text-lg font-semibold',
          tone === 'success' && 'text-success',
          tone === 'destructive' && 'text-destructive',
        )}
      >
        {value}
      </Text>
    </View>
  );
}

function SignedChips({ amount, className }: { amount: number; className?: string }) {
  return (
    <Text
      variant="numeric"
      className={cn('font-medium', amount >= 0 ? 'text-success' : 'text-destructive', className)}
    >
      {/* A real minus sign lines up with the plus in tabular figures. */}
      {amount >= 0 ? '+' : '−'}
      {formatChips(Math.abs(amount))}
    </Text>
  );
}

function groupByDay(hands: HandSummary[]) {
  const groups: { label: string; hands: HandSummary[] }[] = [];
  for (const hand of hands) {
    const label = dayLabel(hand.startedAt);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.hands.push(hand);
    else groups.push({ label, hands: [hand] });
  }
  return groups;
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
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

function HandReplay({
  hand,
  viewerId,
  onBack,
}: {
  hand: HandDetail;
  viewerId: string | null;
  onBack: () => void;
}) {
  // How many actions to reveal. Stepping through is the whole point of
  // storing actions individually rather than only a final summary.
  const [step, setStep] = useState(hand.actions.length);
  const total = hand.actions.length;

  const visible = hand.actions.slice(0, step);
  const street = visible[visible.length - 1]?.street ?? 'preflop';

  // The board fills as the streets arrive, so the replay shows what each
  // player could actually see when they acted.
  const cardsShown = Math.min(
    hand.board.length,
    street === 'preflop' ? 0 : street === 'flop' ? 3 : street === 'turn' ? 4 : 5,
  );

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="p-6 items-center">
      <View className="w-full max-w-[680px] gap-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-0.5">
            <Text variant="heading">
              {hand.tableName}, hand {hand.handNumber}
            </Text>
            <Text variant="caption" tone="muted">
              {dayLabel(hand.startedAt)} at {formatTime(hand.startedAt)}
            </Text>
          </View>
          <Button variant="outline" size="sm" label="All hands" onPress={onBack} />
        </View>

        <Card>
          <CardContent className="items-center gap-3 pt-4">
            <CardRow cards={hand.board.slice(0, cardsShown)} placeholders={5 - cardsShown} />
            <Text variant="caption" tone="muted">
              {step === 0 ? 'Before the deal' : STREET_LABEL[street]} · final pot{' '}
              <Text variant="numeric" className="text-sm text-foreground">
                {formatChips(hand.potTotal)}
              </Text>
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
                  'flex-row items-center justify-between py-3',
                  index > 0 && 'border-t border-border',
                )}
              >
                <View className="flex-1 gap-0.5">
                  <Text className="font-medium">
                    {player.displayName}
                    {player.userId === viewerId && (
                      <Text variant="caption" tone="muted">
                        {' '}
                        (you)
                      </Text>
                    )}
                  </Text>
                  {player.handRank && (
                    <Text variant="caption" tone="muted">
                      {player.handRank}
                    </Text>
                  )}
                </View>

                <View className="flex-row items-center gap-3">
                  {player.holeCards && <CardRow cards={player.holeCards} size="sm" />}
                  <SignedChips amount={player.netChips} className="w-16 text-right" />
                </View>
              </View>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Replay</CardTitle>
            <Text variant="caption" tone="muted">
              Action{' '}
              <Text variant="numeric" className="text-sm text-foreground">
                {step}
              </Text>{' '}
              of{' '}
              <Text variant="numeric" className="text-sm text-muted-foreground">
                {total}
              </Text>
            </Text>
          </CardHeader>

          <CardContent className="gap-3">
            <View className="h-1 overflow-hidden rounded-full bg-muted">
              <View
                className="h-full rounded-full bg-primary"
                style={{ width: `${total === 0 ? 0 : (step / total) * 100}%` }}
              />
            </View>

            <View className="flex-row gap-2">
              <Button
                variant="outline"
                size="sm"
                label="Start"
                disabled={step === 0}
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
                disabled={step >= total}
                onPress={() => setStep((current) => Math.min(total, current + 1))}
                className="flex-1"
              />
            </View>

            <View className="gap-0">
              {visible.map((action, index) => {
                const newStreet = index === 0 || visible[index - 1]?.street !== action.street;
                // The newest action is the one the step just revealed; it is
                // what the player is looking for after pressing Next.
                const latest = index === visible.length - 1;
                return (
                  <View key={action.sequence}>
                    {newStreet && (
                      <Text variant="caption" tone="muted" className={cn(index > 0 && 'pt-3')}>
                        {STREET_LABEL[action.street] ?? action.street}
                      </Text>
                    )}
                    <View
                      className={cn(
                        'flex-row items-center justify-between py-1.5',
                        latest && '-mx-2 rounded-md bg-primary/10 px-2',
                      )}
                    >
                      <Text variant="caption">
                        <Text variant="caption" className="font-medium">
                          {action.displayName ?? 'Unknown'}
                        </Text>{' '}
                        {ACTION_LABEL[action.action] ?? action.action}
                        {action.amount > 0 && (
                          <Text variant="numeric" className="text-sm">
                            {' '}
                            {formatChips(action.amount)}
                          </Text>
                        )}
                      </Text>
                      <Text
                        variant="numeric"
                        className={cn('text-xs', latest ? 'text-primary' : 'text-muted-foreground')}
                      >
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
