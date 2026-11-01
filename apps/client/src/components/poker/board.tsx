import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { cn } from '@/lib/cn';
import { DealtCard } from './dealt-card';
import type { CardCode, PlayingCardProps } from './playing-card';

export interface BoardProps {
  cards: CardCode[];
  size?: PlayingCardProps['size'];
  className?: string;
}

const SLOT_SIZE: Record<string, string> = {
  sm: 'h-11 w-8',
  default: 'h-16 w-12',
  lg: 'h-24 w-[68px]',
};

/**
 * The community cards.
 *
 * Only newly arrived cards animate. Without this the whole board would
 * re-deal on every turn and river, which looks broken — the flop is already
 * on the table and should stay put.
 */
export function Board({ cards, size = 'default', className }: BoardProps) {
  const previousCount = useRef(0);
  const [firstNew, setFirstNew] = useState(0);

  useEffect(() => {
    // A shorter board means a new hand started, so everything is new again.
    setFirstNew(cards.length < previousCount.current ? 0 : previousCount.current);
    previousCount.current = cards.length;
  }, [cards.length]);

  const placeholders = Math.max(0, 5 - cards.length);
  const slot = SLOT_SIZE[size ?? 'default'] ?? SLOT_SIZE.default;

  return (
    <View className={cn('flex-row gap-1.5', className)}>
      {cards.map((card, index) => (
        <DealtCard
          // Keyed by card, so React does not reuse a mounted card's animation
          // state for a different card arriving in the same position.
          key={card}
          card={card}
          size={size}
          index={Math.max(0, index - firstNew)}
          instant={index < firstNew}
          fromY={-90}
          stagger={110}
        />
      ))}

      {Array.from({ length: placeholders }).map((_, index) => (
        <View
          key={`slot-${index}`}
          className={cn('rounded-md border border-dashed border-white/15', slot)}
        />
      ))}
    </View>
  );
}
