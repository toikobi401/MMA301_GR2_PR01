import { cva, type VariantProps } from 'class-variance-authority';
import { ActivityIndicator, Pressable, type PressableProps } from 'react-native';
import { cn } from '@/lib/cn';
import { Text } from './text';

const buttonVariants = cva(
  // Minimum height is 44, the smallest reliable touch target on a phone.
  'flex-row items-center justify-center gap-2 rounded-md min-h-[44px] px-4',
  {
    variants: {
      variant: {
        default: 'bg-primary active:opacity-90',
        secondary: 'bg-secondary active:opacity-90',
        outline: 'border border-border bg-transparent active:bg-secondary',
        ghost: 'bg-transparent active:bg-secondary',
        destructive: 'bg-destructive active:opacity-90',
        success: 'bg-success active:opacity-90',
      },
      size: {
        sm: 'min-h-[36px] px-3',
        default: 'min-h-[44px] px-4',
        lg: 'min-h-[52px] px-6',
        icon: 'min-h-[44px] w-[44px] px-0',
      },
      block: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: { variant: 'default', size: 'default', block: false },
  },
);

const labelVariants = cva('', {
  variants: {
    variant: {
      default: 'text-primary-foreground',
      secondary: 'text-secondary-foreground',
      outline: 'text-foreground',
      ghost: 'text-foreground',
      destructive: 'text-destructive-foreground',
      success: 'text-success-foreground',
    },
    size: {
      sm: 'text-sm font-medium',
      default: 'text-base font-medium',
      lg: 'text-base font-semibold',
      icon: 'text-base font-medium',
    },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

export interface ButtonProps
  extends Omit<PressableProps, 'children'>,
    VariantProps<typeof buttonVariants> {
  label?: string;
  loading?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function Button({
  label,
  loading = false,
  disabled,
  variant,
  size,
  block,
  className,
  children,
  ...props
}: ButtonProps) {
  const inactive = disabled || loading;
  const isTransparent = variant === 'outline' || variant === 'ghost';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(inactive), busy: loading }}
      disabled={inactive}
      className={cn(buttonVariants({ variant, size, block }), inactive && 'opacity-50', className)}
      {...props}
    >
      {loading ? (
        // ActivityIndicator takes a colour prop, not a class, so the tint
        // cannot come from Tailwind. Transparent variants use the muted
        // foreground; filled ones always sit on a saturated background.
        <ActivityIndicator size="small" color={isTransparent ? '#9AA3B4' : '#FFFFFF'} />
      ) : (
        (children ?? (label ? <Text className={labelVariants({ variant, size })}>{label}</Text> : null))
      )}
    </Pressable>
  );
}

export { buttonVariants };
