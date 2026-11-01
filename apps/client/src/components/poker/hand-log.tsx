import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import type { TableHand } from '@app/shared';
import { Badge, Button, Tabs, Text } from '@/components/ui';
import { cn } from '@/lib/cn';
import { CardRow } from './playing-card';
import { formatChips } from './chip-stack';

export interface HandLogProps {
  visible: boolean;
  hands: TableHand[];
  loading: boolean;
  viewerId: string | null;
  onClose: () => void;
  onRefresh: () => void;
}

const ACTION_VERB: Record<string, string> = {
  post_blind: 'posts',
  fold: 'folds',
  check: 'checks',
  call: 'calls',
  bet: 'bets',
  raise: 'raises to',
};

const STREET_LABEL: Record<string, string> = {
  preflop: 'Preflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
};

/**
 * The table's public record.
 *
 * Betting happened in front of everyone, so reviewing it afterwards only
 * levels the table between a player keeping notes and one who is not. Cards
 * appear only where they were actually shown.
 *
 * Two views because they answer different questions: "what happened in that
 * hand" and "how does this person play".
 */
export function HandLog({
  visible,
  hands,
  loading,
  viewerId,
  onClose,
  onRefresh,
}: HandLogProps) {
  const [tab, setTab] = useState<'hands' | 'players'>('hands');
  const [openHand, setOpenHand] = useState<string | null>(null);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
        <Pressable
          className="dark max-h-[80%] gap-3 rounded-t-lg border-t border-border bg-card p-4"
          onPress={() => {}}
        >
          <View className="flex-row items-center justify-between">
            <Text variant="subheading" className="text-white">
              Table history
            </Text>
            <View className="flex-row gap-1">
              <Button variant="ghost" size="sm" label="Refresh" onPress={onRefresh} />
              <Button variant="ghost" size="sm" label="Close" onPress={onClose} />
            </View>
          </View>

          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: 'hands', label: `Hands (${hands.length})` },
              { value: 'players', label: 'Tendencies' },
            ]}
          />

          <ScrollView className="max-h-[440px]">
            {loading ? (
              <Text variant="caption" className="py-8 text-center text-white/50">
                Loading…
              </Text>
            ) : hands.length === 0 ? (
              <Text variant="caption" className="py-8 text-center text-white/50">
                No hands have finished at this table yet.
              </Text>
            ) : tab === 'hands' ? (
              <View className="gap-2">
                {hands.map((hand) => (
                  <HandRow
                    key={hand.id}
                    hand={hand}
                    viewerId={viewerId}
                    expanded={openHand === hand.id}
                    onToggle={() => setOpenHand(openHand === hand.id ? null : hand.id)}
                  />
                ))}
              </View>
            ) : (
              <Tendencies hands={hands} viewerId={viewerId} />
            )}
          </ScrollView>

          <Text variant="caption" className="text-center text-white/40">
            Everyone at this table sees the same log. Cards appear only where they were shown.
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function HandRow({
  hand,
  viewerId,
  expanded,
  onToggle,
}: {
  hand: TableHand;
  viewerId: string | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const winners = hand.players.filter((player) => player.won);
  const shown = hand.players.filter((player) => player.revealedCards);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onToggle}
      className={cn(
        'gap-2 rounded-lg border border-white/10 bg-black/30 p-3 active:opacity-80',
        expanded && 'border-white/25',
      )}
    >
      <View className="flex-row items-center justify-between">
        <Text variant="caption" className="font-medium text-white">
          Hand #{hand.handNumber}
        </Text>
        <Text variant="caption" className="text-white/50">
          {formatChips(hand.potTotal)} pot
        </Text>
      </View>

      <View className="flex-row items-center gap-2">
        {hand.board.length > 0 ? (
          <CardRow cards={hand.board} size="sm" />
        ) : (
          <Text variant="caption" className="text-white/40">
            Ended before the flop
          </Text>
        )}
      </View>

      <Text variant="caption" className="text-white/60">
        {winners.length > 0
          ? `${winners.map((player) => player.displayName).join(', ')} won`
          : 'No winner recorded'}
        {shown.length > 0 ? ` · ${shown.length} hand(s) shown` : ' · nothing shown'}
      </Text>

      {expanded && (
        <View className="gap-3 border-t border-white/10 pt-2">
          {shown.length > 0 && (
            <View className="gap-1.5">
              <Text variant="label" className="text-white/50">
                Shown at showdown
              </Text>
              {shown.map((player) => (
                <View key={player.userId} className="flex-row items-center gap-2">
                  <Text variant="caption" className="w-20 text-white" numberOfLines={1}>
                    {player.displayName}
                  </Text>
                  <CardRow cards={player.revealedCards ?? []} size="sm" />
                  {player.handRank && (
                    <Text variant="caption" className="text-white/50">
                      {player.handRank}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}

          <View className="gap-0.5">
            <Text variant="label" className="text-white/50">
              Actions
            </Text>
            {hand.actions.map((action, index) => {
              const newStreet =
                index === 0 || hand.actions[index - 1]?.street !== action.street;
              const isViewer = action.userId === viewerId;

              return (
                <View key={action.sequence}>
                  {newStreet && (
                    <Text variant="caption" className="pt-1.5 text-white/40">
                      {STREET_LABEL[action.street] ?? action.street}
                    </Text>
                  )}
                  <Text variant="caption" className={isViewer ? 'text-white' : 'text-white/70'}>
                    <Text variant="caption" className="font-medium">
                      {action.displayName ?? 'Unknown'}
                    </Text>{' '}
                    {ACTION_VERB[action.action] ?? action.action}
                    {action.amount > 0 ? ` ${formatChips(action.amount)}` : ''}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </Pressable>
  );
}

interface Tendency {
  userId: string;
  displayName: string;
  hands: number;
  /** Hands where they put money in preflop by choice. */
  entered: number;
  raises: number;
  folds: number;
  showdowns: number;
  net: number;
}

/**
 * What the log is actually for.
 *
 * Counting how often someone enters a pot or raises is the read a human
 * makes from watching, and it is derived entirely from actions everyone
 * already saw — no hidden information is involved.
 */
function Tendencies({ hands, viewerId }: { hands: TableHand[]; viewerId: string | null }) {
  const rows = useMemo(() => {
    const byPlayer = new Map<string, Tendency>();

    for (const hand of hands) {
      const seen = new Set<string>();

      for (const player of hand.players) {
        const entry = byPlayer.get(player.userId) ?? {
          userId: player.userId,
          displayName: player.displayName,
          hands: 0,
          entered: 0,
          raises: 0,
          folds: 0,
          showdowns: 0,
          net: 0,
        };
        entry.hands += 1;
        entry.net += player.netChips;
        if (player.revealedCards) entry.showdowns += 1;
        byPlayer.set(player.userId, entry);
      }

      // Who posted a blind this hand. The big blind enters the pot by
      // checking, which looks like no action at all — counting only calls and
      // raises scored every big blind at zero percent even when they played
      // the hand to showdown.
      const posted = new Set(
        hand.actions
          .filter((action) => action.action === 'post_blind' && action.userId)
          .map((action) => action.userId as string),
      );

      for (const action of hand.actions) {
        if (!action.userId) continue;
        const entry = byPlayer.get(action.userId);
        if (!entry) continue;

        if (action.action === 'fold') entry.folds += 1;

        if (action.street === 'preflop') {
          const voluntary =
            action.action === 'call' ||
            action.action === 'raise' ||
            action.action === 'bet' ||
            // A blind who checks has chosen to see the flop for free, which
            // is entering the pot even though no chips moved.
            (action.action === 'check' && posted.has(action.userId));

          if (voluntary && !seen.has(`${action.userId}:entered`)) {
            entry.entered += 1;
            seen.add(`${action.userId}:entered`);
          }

          if (action.action === 'raise' || action.action === 'bet') entry.raises += 1;
        }
      }
    }

    return [...byPlayer.values()].sort((a, b) => b.hands - a.hands);
  }, [hands]);

  if (rows.length === 0) {
    return (
      <Text variant="caption" className="py-8 text-center text-white/50">
        Not enough hands yet.
      </Text>
    );
  }

  return (
    <View className="gap-2">
      <Text variant="caption" className="text-white/50">
        Derived from actions everyone at this table already saw.
      </Text>

      {rows.map((row) => {
        const entryRate = row.hands > 0 ? Math.round((row.entered / row.hands) * 100) : 0;
        const style =
          row.hands < 5
            ? 'Too few hands'
            : entryRate > 55
              ? 'Loose'
              : entryRate < 25
                ? 'Tight'
                : 'Balanced';

        return (
          <View
            key={row.userId}
            className={cn(
              'gap-1 rounded-lg border border-white/10 bg-black/30 p-3',
              row.userId === viewerId && 'border-primary/40',
            )}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-1.5">
                <Text variant="caption" className="font-medium text-white">
                  {row.displayName}
                  {row.userId === viewerId ? ' (you)' : ''}
                </Text>
                <Badge label={style} variant={row.hands < 5 ? 'muted' : 'secondary'} />
              </View>
              <Text
                variant="numeric"
                className={cn(
                  'text-xs',
                  row.net >= 0 ? 'text-success' : 'text-destructive',
                )}
              >
                {row.net >= 0 ? '+' : ''}
                {formatChips(row.net)}
              </Text>
            </View>

            <Text variant="caption" className="text-white/50">
              {row.hands} hands · entered {entryRate}% · raised {row.raises}× · folded{' '}
              {row.folds}× · showed {row.showdowns}×
            </Text>
          </View>
        );
      })}
    </View>
  );
}
