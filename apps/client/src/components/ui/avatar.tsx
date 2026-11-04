import { cva, type VariantProps } from 'class-variance-authority';
import { View } from 'react-native';
import { cn } from '@/lib/cn';
import { Text } from './text';

const avatarVariants = cva('items-center justify-center rounded-full bg-secondary', {
  variants: {
    size: {
      sm: 'h-8 w-8',
      default: 'h-10 w-10',
      lg: 'h-14 w-14',
      xl: 'h-20 w-20',
    },
  },
  defaultVariants: { size: 'default' },
});

const initialsVariants = cva('font-semibold text-secondary-foreground', {
  variants: {
    size: {
      sm: 'text-xs',
      default: 'text-sm',
      lg: 'text-lg',
      xl: 'text-2xl',
    },
  },
  defaultVariants: { size: 'default' },
});

/** First letter of the first two words, so "Le Tran" becomes "LT". */
function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export interface AvatarProps extends VariantProps<typeof avatarVariants> {
  name: string;
  className?: string;
}

export function Avatar({ name, size, className }: AvatarProps) {
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={name}
      className={cn(avatarVariants({ size }), className)}
    >
      <Text className={initialsVariants({ size })}>{initialsOf(name) || '?'}</Text>
    </View>
  );
}
