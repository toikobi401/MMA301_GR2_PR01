import { View, type ViewProps } from 'react-native';
import { cn } from '@/lib/cn';

/**
 * The table surface.
 *
 * A real table is an ellipse, but an ellipse wastes most of a phone screen —
 * the usable area ends up in the middle while the corners sit empty. This is
 * a rounded rectangle with a rail, which keeps the casino read while using the
 * full width.
 */
export function TableFelt({ className, children, ...props }: ViewProps & { className?: string }) {
  return (
    <View className={cn('rounded-[40px] bg-felt-rail p-2', className)} {...props}>
      <View className="flex-1 rounded-[32px] border border-felt-line bg-felt">
        {children}
      </View>
    </View>
  );
}

/** Centre area of the table: the board and the pot sit here. */
export function TableCentre({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn('flex-1 items-center justify-center gap-3', className)} {...props} />;
}
