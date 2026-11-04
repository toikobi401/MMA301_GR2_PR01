import { Pressable, View } from 'react-native';
import type { BotDifficulty } from '@app/shared';
import { cn } from '@/lib/cn';
import { Avatar } from '@/components/ui/avatar';
import { Text } from '@/components/ui/text';
import { ChipStack, formatChips } from './chip-stack';
import { DealtCard } from './dealt-card';
import type { CardCode } from './playing-card';

export type SeatStatus = 'active' | 'folded' | 'all_in' | 'sitting_out' | 'empty';

export interface PlayerSeatProps {
  seat: number;
  name?: string | null;
  stack?: number;
  status: SeatStatus;
  /** Chips put in on the current street, shown in front of the seat. */
  committed?: number;
  /** Two cards when known, two nulls for face-down, empty when not in the hand. */
  holeCards?: (CardCode | null)[];
  /** Animates the hole cards in. Set only for the hand currently being dealt. */
  dealing?: boolean;
  /** Seat position in the deal order, so cards arrive one seat at a time. */
  dealIndex?: number;
  /** Number of table positions included in the deal order. */
  dealOrderSize?: number;
  isActing?: boolean;
  isDealer?: boolean;
  isSelf?: boolean;
  /** Marks the seat as played by the server. */
  isBot?: boolean;
  botDifficulty?: BotDifficulty | null;
  /** Banned mid-hand: folded, cannot act, leaves when the hand ends. */
  isBanned?: boolean;
  /** "SB" or "BB" for this hand. */
  positionLabel?: string | null;
  /** What they just did this street, e.g. "Raise". */
  actionLabel?: string | null;
  /** Why they hold no cards, e.g. "Away". */
  statusNote?: string | null;
  /** The viewer's own hand so far, e.g. "Two pair". */
  handDescription?: string | null;
  /** On the reserve after the normal clock ran out. */
  onTimeBank?: boolean;
  /** A full table on a phone: no avatar, so every seat fits across the screen. */
  compact?: boolean;
  /** Shown on an empty seat when the viewer owns the table. */
  onAddBot?: () => void;
  /** Fraction of the action clock remaining, 0 to 1. */
  clockRemaining?: number;
  className?: string;
}

export function PlayerSeat({
  seat,
  name,
  stack = 0,
  status,
  committed = 0,
  holeCards = [],
  dealing = false,
  dealIndex = 0,
  dealOrderSize = 9,
  isActing = false,
  isDealer = false,
  isSelf = false,
  isBot = false,
  botDifficulty = null,
  isBanned = false,
  positionLabel = null,
  actionLabel = null,
  statusNote = null,
  handDescription = null,
  onTimeBank = false,
  compact = false,
  onAddBot,
  clockRemaining,
  className,
}: PlayerSeatProps) {
  if (status === 'empty' || !name) {
    // An empty seat becomes the add-bot control for the table owner, so the
    // action sits where the result will appear.
    const Wrapper = onAddBot ? Pressable : View;

    return (
      <Wrapper
        {...(onAddBot
          ? { onPress: onAddBot, accessibilityRole: 'button' as const }
          : {})}
        className={cn(
          'items-center justify-center rounded-lg border border-dashed',
          compact ? 'px-1 py-1' : 'px-3 py-2',
          onAddBot ? 'border-white/30 active:bg-white/10' : 'border-white/15',
          className,
        )}
      >
        <Text variant="caption" className={onAddBot ? 'text-white/60' : 'text-white/30'}>
          {onAddBot ? (compact ? '+ Bot' : '+ Add bot') : `Seat ${seat + 1}`}
        </Text>
      </Wrapper>
    );
  }

  const folded = status === 'folded';
  const allIn = status === 'all_in';

  return (
    <View className={cn('items-center gap-1', compact && 'max-w-[74px]', className)}>
      {committed > 0 && <ChipStack amount={committed} />}

      {holeCards.length > 0 && (
        <View className={cn('flex-row gap-1.5', folded && 'opacity-30')}>
          {holeCards.map((card, position) => (
            <DealtCard
              key={`${card ?? 'back'}-${position}`}
              card={card}
              size="sm"
              // Cards go round the table one per player per pass, the order a
              // real dealer uses, so the seat index decides the delay.
              index={position * dealOrderSize + dealIndex}
              stagger={55}
              fromY={-70}
              instant={!dealing}
            />
          ))}
        </View>
      )}

      <View
        className={cn(
          'flex-row items-center rounded-lg border',
          compact ? 'gap-1 px-1 py-1' : 'gap-2 px-2.5 py-1.5',
          isBanned && 'opacity-60',
          // The acting player is the one thing on the table that must be
          // unmissable, so it gets a ring rather than a subtle tint.
          isActing ? 'border-primary bg-primary/15' : 'border-white/10 bg-black/40',
          folded && 'opacity-40',
          isSelf && !isActing && 'border-white/25',
        )}
      >
        <View>
          {!compact && <Avatar name={name} size="sm" />}
          {isDealer && !compact && (
            <View className="absolute -right-1 -top-1 h-4 w-4 items-center justify-center rounded-full bg-white">
              <Text className="text-[9px] font-bold text-black">D</Text>
            </View>
          )}
        </View>

        <View className={compact ? 'min-w-0 flex-shrink' : 'min-w-[56px]'}>
          <View className="flex-row items-center gap-1">
            <Text
              variant="caption"
              className={cn('font-medium text-white', compact && 'flex-shrink text-xs')}
              numberOfLines={1}
            >
              {name}
            </Text>
            {isDealer && compact && (
              <View className="h-3.5 w-3.5 items-center justify-center rounded-full bg-white">
                <Text className="text-[8px] font-bold text-black">D</Text>
              </View>
            )}
            {isBot && !compact && (
              // Small enough not to change the seat's footprint, so the table
              // does not reflow when a bot is swapped for a person.
              <View className="rounded bg-white/15 px-1">
                <Text className="text-[9px] font-bold uppercase text-white/70">
                  {botDifficulty ? botDifficulty[0] : 'B'}
                </Text>
              </View>
            )}
            {isBanned && (
              // They keep the seat until the hand ends, so the table has to
              // say why they are not acting.
              <View className="rounded bg-destructive px-1">
                <Text className="text-[9px] font-bold uppercase text-destructive-foreground">
                  ⃠ banned
                </Text>
              </View>
            )}
          </View>
          {allIn ? (
            <Text variant="caption" className="text-xs font-semibold text-chip-red">
              ALL IN
            </Text>
          ) : (
            <Text variant="numeric" className="text-xs text-white/70">
              {formatChips(stack)}
            </Text>
          )}
        </View>
      </View>

      {(actionLabel || positionLabel || statusNote) && (
        <View className="flex-row items-center gap-1">
          {positionLabel && (
            <View className="rounded bg-white/15 px-1">
              <Text className="text-[9px] font-bold text-white/80">{positionLabel}</Text>
            </View>
          )}
          {actionLabel && (
            <Text variant="caption" className="text-xs font-semibold text-primary">
              {actionLabel}
            </Text>
          )}
          {statusNote && (
            <Text variant="caption" className="text-xs text-white/50">
              {statusNote}
            </Text>
          )}
        </View>
      )}

      {handDescription && (
        <Text variant="caption" className="text-xs font-medium text-white/80">
          {handDescription}
        </Text>
      )}

      {/* The action clock drains left to right; it turns red in the last
          quarter so a player glancing at the table sees the urgency. */}
      {isActing && onTimeBank && (
        <Text variant="caption" className="text-xs font-semibold text-destructive">
          Time bank
        </Text>
      )}
      {isActing && clockRemaining !== undefined && (
        <View className="h-1 w-16 overflow-hidden rounded-full bg-white/15">
          <View
            className={cn(
              'h-full rounded-full',
              clockRemaining > 0.25 ? 'bg-primary' : 'bg-destructive',
            )}
            style={{ width: `${Math.max(0, Math.min(1, clockRemaining)) * 100}%` }}
          />
        </View>
      )}
    </View>
  );
}
