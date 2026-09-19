import { cva, type VariantProps } from 'class-variance-authority';
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { cn } from '@/lib/cn';

/**
 * Typography scale.
 *
 * Every string in the app goes through here rather than through a bare Text,
 * so sizes and weights stay consistent without each screen inventing its own.
 */
const textVariants = cva('text-foreground', {
  variants: {
    variant: {
      display: 'text-4xl font-bold tracking-tight',
      title: 'text-2xl font-bold tracking-tight',
      heading: 'text-xl font-semibold',
      subheading: 'text-lg font-semibold',
      body: 'text-base',
      bodyStrong: 'text-base font-medium',
      caption: 'text-sm',
      label: 'text-xs font-medium uppercase tracking-wider',
      // Tabular figures so a changing chip count does not shift the layout.
      numeric: 'text-base font-mono tabular-nums',
    },
    tone: {
      default: 'text-foreground',
      muted: 'text-muted-foreground',
      primary: 'text-primary',
      destructive: 'text-destructive',
      success: 'text-success',
      inverted: 'text-primary-foreground',
    },
  },
  defaultVariants: {
    variant: 'body',
    tone: 'default',
  },
});

export interface TextProps extends RNTextProps, VariantProps<typeof textVariants> {
  className?: string;
}

export function Text({ className, variant, tone, ...props }: TextProps) {
  return <RNText className={cn(textVariants({ variant, tone }), className)} {...props} />;
}

export { textVariants };
