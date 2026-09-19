import { View } from 'react-native';
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
  isActing?: boolean;
  isDealer?: boolean;
  isSelf?: boolean;
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
  isActing = false,
  isDealer = false,
  isSelf = false,
  clockRemaining,
  className,
}: PlayerSeatProps) {
  if (status === 'empty' || !name) {
    return (
      <View
        className={cn(
          'items-center justify-center rounded-lg border border-dashed border-white/15 px-3 py-2',
          className,
        )}
      >
        <Text variant="caption" className="text-white/30">
          Seat {seat + 1}
        </Text>
      </View>
    );
  }

  const folded = status === 'folded';
  const allIn = status === 'all_in';

  return (
    <View className={cn('items-center gap-1', className)}>
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
              index={position * 6 + dealIndex}
              stagger={55}
              fromY={-70}
              instant={!dealing}
            />
          ))}
        </View>
      )}

      <View
        className={cn(
          'flex-row items-center gap-2 rounded-lg border px-2.5 py-1.5',
          // The acting player is the one thing on the table that must be
          // unmissable, so it gets a ring rather than a subtle tint.
          isActing ? 'border-primary bg-primary/15' : 'border-white/10 bg-black/40',
          folded && 'opacity-40',
          isSelf && !isActing && 'border-white/25',
        )}
      >
        <View>
          <Avatar name={name} size="sm" />
          {isDealer && (
            <View className="absolute -right-1 -top-1 h-4 w-4 items-center justify-center rounded-full bg-white">
              <Text className="text-[9px] font-bold text-black">D</Text>
            </View>
          )}
        </View>

        <View className="min-w-[56px]">
          <Text variant="caption" className="font-medium text-white" numberOfLines={1}>
            {name}
          </Text>
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

      {/* The action clock drains left to right; it turns red in the last
          quarter so a player glancing at the table sees the urgency. */}
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
