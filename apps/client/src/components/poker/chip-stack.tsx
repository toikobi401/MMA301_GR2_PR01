import { View } from 'react-native';
import { cn } from '@/lib/cn';
import { Text } from '@/components/ui/text';

/**
 * Formats a chip count compactly: 1500 becomes 1.5K, 2000000 becomes 2M.
 *
 * Long numbers wreck a seat layout at phone widths, and players read stack
 * sizes by magnitude rather than by exact digits.
 */
export function formatChips(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) {
    const millions = amount / 1_000_000;
    return `${millions % 1 === 0 ? millions : millions.toFixed(1)}M`;
  }
  if (Math.abs(amount) >= 10_000) {
    const thousands = amount / 1000;
    return `${thousands % 1 === 0 ? thousands : thousands.toFixed(1)}K`;
  }
  return amount.toLocaleString('en-US');
}

/** Chip colour by denomination, following common casino conventions. */
function chipColour(amount: number): string {
  if (amount >= 100_000) return 'bg-chip-black';
  if (amount >= 10_000) return 'bg-chip-blue';
  if (amount >= 1_000) return 'bg-chip-green';
  if (amount >= 100) return 'bg-chip-red';
  return 'bg-chip-white';
}

export interface ChipStackProps {
  amount: number;
  /** Hides the disc, leaving only the number. */
  bare?: boolean;
  className?: string;
}

export function ChipStack({ amount, bare = false, className }: ChipStackProps) {
  if (amount <= 0) return null;

  return (
    <View className={cn('flex-row items-center gap-1.5', className)}>
      {!bare && (
        <View
          className={cn(
            'h-4 w-4 rounded-full border-2 border-white/40',
            chipColour(amount),
          )}
        />
      )}
      <Text variant="numeric" className="text-sm text-white">
        {formatChips(amount)}
      </Text>
    </View>
  );
}

/** The pot, shown at the centre of the table. */
export function PotDisplay({ amount, className }: { amount: number; className?: string }) {
  return (
    <View
      className={cn(
        'flex-row items-center gap-2 self-center rounded-full bg-black/40 px-4 py-1.5',
        className,
      )}
    >
      <Text variant="label" className="text-white/60">
        Pot
      </Text>
      <Text variant="numeric" className="font-semibold text-white">
        {formatChips(amount)}
      </Text>
    </View>
  );
}
