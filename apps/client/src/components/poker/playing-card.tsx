import { cva, type VariantProps } from 'class-variance-authority';
import { View } from 'react-native';
import { cn } from '@/lib/cn';
import { Text } from '@/components/ui/text';

/** Cards arrive from the server as two characters, e.g. "As", "Th", "2c". */
export type CardCode = string;

const SUIT_SYMBOL: Record<string, string> = {
  s: '♠', // spade
  h: '♥', // heart
  d: '♦', // diamond
  c: '♣', // club
};

const cardVariants = cva('items-center justify-center rounded-md border', {
  variants: {
    size: {
      sm: 'h-11 w-8',
      default: 'h-16 w-12',
      lg: 'h-24 w-[68px]',
    },
    facing: {
      up: 'border-black/10 bg-white',
      // The back is a solid colour rather than a pattern: at phone sizes a
      // pattern turns to noise, and the point is only "this card is hidden".
      down: 'border-white/10 bg-primary',
    },
  },
  defaultVariants: { size: 'default', facing: 'up' },
});

const rankVariants = cva('font-bold', {
  variants: {
    size: { sm: 'text-sm', default: 'text-xl', lg: 'text-3xl' },
  },
  defaultVariants: { size: 'default' },
});

const suitVariants = cva('', {
  variants: {
    size: { sm: 'text-xs', default: 'text-base', lg: 'text-xl' },
  },
  defaultVariants: { size: 'default' },
});

export interface PlayingCardProps extends VariantProps<typeof cardVariants> {
  /** Omit to render a face-down card. */
  card?: CardCode | null;
  /** Dims the card, for cards not part of the winning hand at showdown. */
  dimmed?: boolean;
  className?: string;
}

export function PlayingCard({ card, size, dimmed = false, className }: PlayingCardProps) {
  const faceUp = Boolean(card);

  if (!faceUp) {
    return (
      <View
        accessibilityLabel="Face-down card"
        className={cn(cardVariants({ size, facing: 'down' }), dimmed && 'opacity-40', className)}
      >
        <View className="h-2/3 w-2/3 rounded border border-white/20" />
      </View>
    );
  }

  const rank = card?.[0] ?? '';
  const suit = card?.[1] ?? '';
  const symbol = SUIT_SYMBOL[suit] ?? suit;
  const isRed = suit === 'h' || suit === 'd';

  return (
    <View
      accessibilityLabel={`${rank} of ${suit}`}
      className={cn(cardVariants({ size, facing: 'up' }), dimmed && 'opacity-40', className)}
    >
      <Text className={cn(rankVariants({ size }), isRed ? 'text-suit-red' : 'text-suit-black')}>
        {rank === 'T' ? '10' : rank}
      </Text>
      <Text className={cn(suitVariants({ size }), isRed ? 'text-suit-red' : 'text-suit-black')}>
        {symbol}
      </Text>
    </View>
  );
}

/** A row of cards, used for the board and for hole cards. */
export function CardRow({
  cards,
  size,
  placeholders = 0,
  className,
}: {
  cards: (CardCode | null)[];
  size?: PlayingCardProps['size'];
  /** Empty slots drawn after the cards, so the board keeps its width. */
  placeholders?: number;
  className?: string;
}) {
  return (
    <View className={cn('flex-row gap-1.5', className)}>
      {cards.map((card, index) => (
        <PlayingCard key={`${card ?? 'back'}-${index}`} card={card} size={size} />
      ))}
      {Array.from({ length: placeholders }).map((_, index) => (
        <View
          key={`slot-${index}`}
          className={cn(
            'rounded-md border border-dashed border-white/15',
            size === 'sm' ? 'h-11 w-8' : size === 'lg' ? 'h-24 w-[68px]' : 'h-16 w-12',
          )}
        />
      ))}
    </View>
  );
}
