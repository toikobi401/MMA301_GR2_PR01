import { View, type ViewProps } from 'react-native';
import { cn } from '@/lib/cn';
import { Text } from './text';

export function Card({ className, ...props }: ViewProps & { className?: string }) {
  return (
    <View
      className={cn('rounded-lg border border-border bg-card overflow-hidden', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn('p-4 gap-1', className)} {...props} />;
}

export function CardTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <Text variant="subheading" className={cn('text-card-foreground', className)}>
      {children}
    </Text>
  );
}

export function CardDescription({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Text variant="caption" tone="muted" className={className}>
      {children}
    </Text>
  );
}

export function CardContent({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn('px-4 pb-4', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ViewProps & { className?: string }) {
  return (
    <View
      className={cn('flex-row items-center gap-2 px-4 pb-4 pt-0', className)}
      {...props}
    />
  );
}

/** A divider that lines up with card padding. */
export function CardSeparator({ className }: { className?: string }) {
  return <View className={cn('h-px bg-border', className)} />;
}
