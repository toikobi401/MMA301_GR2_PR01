import { View } from 'react-native';
import { cn } from '@/lib/cn';
import { Button } from './button';
import { Text } from './text';

export interface EmptyStateProps {
  title: string;
  /** One line saying what to do about it, not merely that it is empty. */
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

/**
 * Shown when a list has nothing in it.
 *
 * Always says what to do next rather than only reporting the absence: an
 * empty list with no way forward reads like a fault.
 */
export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <View className={cn('items-center gap-2 px-4 py-10', className)}>
      <Text variant="bodyStrong" className="text-center">
        {title}
      </Text>

      {description && (
        <Text variant="caption" tone="muted" className="max-w-[320px] text-center">
          {description}
        </Text>
      )}

      {actionLabel && onAction && (
        <Button variant="outline" size="sm" label={actionLabel} onPress={onAction} className="mt-2" />
      )}
    </View>
  );
}
