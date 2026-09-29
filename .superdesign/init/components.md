# Components

Framework: **Expo SDK 57 (React Native 0.86) + Expo Router**, one codebase rendered on iOS, Android and web (react-native-web).
Styling: **NativeWind v4 on Tailwind 3** — Tailwind `className` on React Native primitives (`View`, `Text`, `Pressable`, `TextInput`).
Component library: **custom shadcn-style primitives** (shadcn/ui itself cannot run — it needs Radix + the DOM). Variants use `class-variance-authority`; classes merge with `cn()` (clsx + tailwind-merge).
Icons: none — the app uses text glyphs (♠ ♥ ♦ ♣, ←, ☾/☀) instead of an icon library.

When reproducing in HTML: `View` → `div` (flex column by default in RN!), `Text` → `span`/`p`, `Pressable` → `button`, `TextInput` → `input`. React Native `View`s default to `flex-direction: column`.

## Shared UI primitives (`src/components/ui`)

| Component | Path | Description |
|---|---|---|
| `cn()` | `apps/client/src/lib/cn.ts` | clsx + tailwind-merge class combiner used by every component. |
| `Text` | `apps/client/src/components/ui/text.tsx` | Typography primitive: `variant` display/title/heading/subheading/body/bodyStrong/caption/label/numeric; `tone` default/muted/primary/destructive/success/inverted. |
| `Button` | `apps/client/src/components/ui/button.tsx` | cva button: variants default/secondary/outline/ghost/destructive/success, sizes sm(36px)/default(44px)/lg(52px)/icon, `block`; `label` or children. |
| `Card family` | `apps/client/src/components/ui/card.tsx` | Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardSeparator. |
| `Input` | `apps/client/src/components/ui/input.tsx` | Labelled TextInput with focus ring, error and hint. |
| `Badge, StatusDot` | `apps/client/src/components/ui/badge.tsx` | Small pill label with variants; StatusDot for online state. |
| `Avatar` | `apps/client/src/components/ui/avatar.tsx` | Initials avatar circle, sized. |
| `Tabs` | `apps/client/src/components/ui/tabs.tsx` | Segmented control: `value`, `onChange`, `options[]`. |
| `EmptyState` | `apps/client/src/components/ui/empty-state.tsx` | Centered title/description/action for empty lists. |
| `ui barrel` | `apps/client/src/components/ui/index.ts` | Re-exports of the primitives above. |

## Poker domain components (`src/components/poker`)

| Component | Path | Description |
|---|---|---|
| `TableFelt, TableCentre` | `apps/client/src/components/poker/table-felt.tsx` | Dark green felt oval with wooden rail; centre slot for pot/board. |
| `PlayingCard, CardRow` | `apps/client/src/components/poker/playing-card.tsx` | Face-up / face-down playing card, sizes sm/md/lg, suit colours from `suit-*` tokens. |
| `DealtCard` | `apps/client/src/components/poker/dealt-card.tsx` | Reanimated wrapper that slides/fades a card in during the deal. |
| `Board` | `apps/client/src/components/poker/board.tsx` | Five community-card slots (placeholders when empty). |
| `ChipStack, PotDisplay, formatChips` | `apps/client/src/components/poker/chip-stack.tsx` | Chip colour stack + numeric amount; pot pill; thousands formatting. |
| `PlayerSeat` | `apps/client/src/components/poker/player-seat.tsx` | Seat: avatar, name, stack, hole cards, committed chips, dealer button, acting ring + clock, bot/banned badges, empty "+ Add bot". |
| `BetSlider` | `apps/client/src/components/poker/bet-slider.tsx` | PanResponder drag track between legal min and max. |
| `ActionBar` | `apps/client/src/components/poker/action-bar.tsx` | Raise-to amount, presets 0.5x/1x/3x pot/All in, slider + numeric field, Fold/Check/Call/Bet-Raise buttons. |
| `HandLog` | `apps/client/src/components/poker/hand-log.tsx` | Bottom sheet modal: Hands tab (expandable per-street actions, shown cards) and Tendencies tab. |
| `TableChat` | `apps/client/src/components/poker/table-chat.tsx` | Bottom sheet chat with message list and input. |
| `AddBotSheet` | `apps/client/src/components/poker/add-bot-sheet.tsx` | Bottom sheet choosing bot difficulty (easy/medium/hard/expert). |
| `poker barrel` | `apps/client/src/components/poker/index.ts` | Re-exports of the poker components above. |

---

## Source — UI primitives

### `apps/client/src/lib/cn.ts`

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges class names, with later Tailwind utilities winning over earlier ones
 * in the same group.
 *
 * Without the merge, `cn('px-4', 'px-6')` would emit both and the result would
 * depend on stylesheet order. This is what lets a caller override a
 * component's default padding by passing className.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

### `apps/client/src/components/ui/text.tsx`

```tsx
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
```

### `apps/client/src/components/ui/button.tsx`

```tsx
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
```

### `apps/client/src/components/ui/card.tsx`

```tsx
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
```

### `apps/client/src/components/ui/input.tsx`

```tsx
import { forwardRef, useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { cn } from '@/lib/cn';
import { Text } from './text';

export interface InputProps extends TextInputProps {
  label?: string;
  /** Shown below the field in red. Also marks the border. */
  error?: string;
  /** Shown below the field when there is no error. */
  hint?: string;
  className?: string;
  containerClassName?: string;
}

/**
 * Text field with a label, focus ring, and error state.
 *
 * Focus is tracked in state rather than through a `:focus` class because
 * React Native has no CSS pseudo-classes — the ring has to be driven by the
 * focus callbacks.
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, hint, className, containerClassName, onFocus, onBlur, ...props },
  ref,
) {
  const [focused, setFocused] = useState(false);

  return (
    <View className={cn('gap-1.5', containerClassName)}>
      {label ? (
        <Text variant="caption" className="font-medium text-foreground">
          {label}
        </Text>
      ) : null}

      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor="#9AA3B4"
        className={cn(
          'min-h-[44px] rounded-md border bg-background px-3 py-2 text-base text-foreground',
          focused ? 'border-ring' : 'border-input',
          error && 'border-destructive',
          props.editable === false && 'opacity-50',
          className,
        )}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        {...props}
      />

      {error ? (
        <Text variant="caption" tone="destructive">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});
```

### `apps/client/src/components/ui/badge.tsx`

```tsx
import { cva, type VariantProps } from 'class-variance-authority';
import { View, type ViewProps } from 'react-native';
import { cn } from '@/lib/cn';
import { Text } from './text';

const badgeVariants = cva('flex-row items-center self-start rounded-full px-2.5 py-0.5', {
  variants: {
    variant: {
      default: 'bg-primary',
      secondary: 'bg-secondary',
      outline: 'border border-border bg-transparent',
      destructive: 'bg-destructive',
      success: 'bg-success',
      muted: 'bg-muted',
    },
  },
  defaultVariants: { variant: 'default' },
});

const badgeTextVariants = cva('text-xs font-medium', {
  variants: {
    variant: {
      default: 'text-primary-foreground',
      secondary: 'text-secondary-foreground',
      outline: 'text-foreground',
      destructive: 'text-destructive-foreground',
      success: 'text-success-foreground',
      muted: 'text-muted-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface BadgeProps extends ViewProps, VariantProps<typeof badgeVariants> {
  label: string;
  className?: string;
}

export function Badge({ label, variant, className, ...props }: BadgeProps) {
  return (
    <View className={cn(badgeVariants({ variant }), className)} {...props}>
      <Text className={badgeTextVariants({ variant })}>{label}</Text>
    </View>
  );
}

/** A small filled dot, for presence and status rows. */
export function StatusDot({ className }: { className?: string }) {
  return <View className={cn('h-2 w-2 rounded-full bg-muted-foreground', className)} />;
}

export { badgeVariants };
```

### `apps/client/src/components/ui/avatar.tsx`

```tsx
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
```

### `apps/client/src/components/ui/tabs.tsx`

```tsx
import { Pressable, View } from 'react-native';
import { cn } from '@/lib/cn';
import { Text } from './text';

export interface TabOption<T extends string> {
  value: T;
  label: string;
}

export interface TabsProps<T extends string> {
  options: ReadonlyArray<TabOption<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * Segmented control.
 *
 * A row of pressables rather than a scrolling tab bar: these switch between
 * views of the same list, so all the options must stay visible at once.
 */
export function Tabs<T extends string>({ options, value, onChange, className }: TabsProps<T>) {
  return (
    <View className={cn('flex-row rounded-md bg-muted p-1', className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            className={cn(
              'flex-1 items-center justify-center rounded px-3 py-1.5',
              active && 'bg-background',
            )}
          >
            <Text
              variant="caption"
              className={cn('font-medium', active ? 'text-foreground' : 'text-muted-foreground')}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
```

### `apps/client/src/components/ui/empty-state.tsx`

```tsx
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
```

### `apps/client/src/components/ui/index.ts`

```ts
export { Avatar, type AvatarProps } from './avatar';
export { Badge, StatusDot, badgeVariants, type BadgeProps } from './badge';
export { Button, buttonVariants, type ButtonProps } from './button';
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardSeparator,
  CardTitle,
} from './card';
export { EmptyState, type EmptyStateProps } from './empty-state';
export { Input, type InputProps } from './input';
export { Tabs, type TabOption, type TabsProps } from './tabs';
export { Text, textVariants, type TextProps } from './text';
```

## Source — Poker components

### `apps/client/src/components/poker/table-felt.tsx`

```tsx
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
```

### `apps/client/src/components/poker/playing-card.tsx`

```tsx
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
```

### `apps/client/src/components/poker/dealt-card.tsx`

```tsx
import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { PlayingCard, type PlayingCardProps } from './playing-card';

export interface DealtCardProps extends PlayingCardProps {
  /**
   * Position in the deal order. Each card waits `index * stagger` before
   * flying out, which is what makes the deal read as one card at a time
   * rather than everything appearing at once.
   */
  index?: number;
  stagger?: number;
  /** Pixels the card travels from the deck. Negative y means from above. */
  fromX?: number;
  fromY?: number;
  /** Skip the animation and appear in place. */
  instant?: boolean;
}

const DEAL_DURATION = 260;

/**
 * A card that flies in from the dealer position.
 *
 * The animation is entirely client-side. The server sends the finished state
 * and this replays the deal visually — if it drove the animation by sending
 * one card at a time, a dropped connection mid-deal would leave the table in
 * a half-dealt state with no way to recover.
 */
export function DealtCard({
  index = 0,
  stagger = 90,
  fromX = 0,
  fromY = -140,
  instant = false,
  ...cardProps
}: DealtCardProps) {
  const progress = useSharedValue(instant ? 1 : 0);

  useEffect(() => {
    if (instant) {
      progress.value = 1;
      return;
    }

    progress.value = 0;
    progress.value = withDelay(
      index * stagger,
      withTiming(1, {
        duration: DEAL_DURATION,
        // Decelerating: fast off the deck, settling into the seat, which is
        // how a dealt card actually behaves.
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [index, stagger, instant, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateX: fromX * (1 - progress.value) },
      { translateY: fromY * (1 - progress.value) },
      { scale: 0.85 + 0.15 * progress.value },
    ],
  }));

  return (
    <Animated.View style={style}>
      <PlayingCard {...cardProps} />
    </Animated.View>
  );
}
```

### `apps/client/src/components/poker/board.tsx`

```tsx
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
```

### `apps/client/src/components/poker/chip-stack.tsx`

```tsx
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
```

### `apps/client/src/components/poker/player-seat.tsx`

```tsx
import { Pressable, View } from 'react-native';
import type { BotDifficulty } from '@app/shared';
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
  /** Marks the seat as played by the server. */
  isBot?: boolean;
  botDifficulty?: BotDifficulty | null;
  /** Banned mid-hand: folded, cannot act, leaves when the hand ends. */
  isBanned?: boolean;
  /** Shown on an empty seat when the viewer owns the table. */
  onAddBot?: () => void;
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
  isBot = false,
  botDifficulty = null,
  isBanned = false,
  onAddBot,
  clockRemaining,
  className,
}: PlayerSeatProps) {
  if (status === 'empty' || !name) {
    // An empty seat becomes the add-bot control for the table owner, so the
    // action sits where the result will appear.
    const Wrapper = onAddBot ? Pressable : View;

    return (
      <Wrapper
        {...(onAddBot
          ? { onPress: onAddBot, accessibilityRole: 'button' as const }
          : {})}
        className={cn(
          'items-center justify-center rounded-lg border border-dashed px-3 py-2',
          onAddBot ? 'border-white/30 active:bg-white/10' : 'border-white/15',
          className,
        )}
      >
        <Text variant="caption" className={onAddBot ? 'text-white/60' : 'text-white/30'}>
          {onAddBot ? '+ Add bot' : `Seat ${seat + 1}`}
        </Text>
      </Wrapper>
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
          isBanned && 'opacity-60',
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
          <View className="flex-row items-center gap-1">
            <Text variant="caption" className="font-medium text-white" numberOfLines={1}>
              {name}
            </Text>
            {isBot && (
              // Small enough not to change the seat's footprint, so the table
              // does not reflow when a bot is swapped for a person.
              <View className="rounded bg-white/15 px-1">
                <Text className="text-[9px] font-bold uppercase text-white/70">
                  {botDifficulty ? botDifficulty[0] : 'B'}
                </Text>
              </View>
            )}
            {isBanned && (
              // They keep the seat until the hand ends, so the table has to
              // say why they are not acting.
              <View className="rounded bg-destructive px-1">
                <Text className="text-[9px] font-bold uppercase text-destructive-foreground">
                  ⃠ banned
                </Text>
              </View>
            )}
          </View>
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
```

### `apps/client/src/components/poker/bet-slider.tsx`

```tsx
import { useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, View } from 'react-native';
import { cn } from '@/lib/cn';

export interface BetSliderProps {
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  /**
   * Set on the table screen, which is dark on every platform.
   *
   * Matches `ActionBar`'s own prop: `dark:` only cascades on web, so a fixed
   * palette keeps the track legible on the felt regardless of platform.
   */
  onDarkSurface?: boolean;
  className?: string;
}

/**
 * A drag-to-choose bet size between the legal min and max.
 *
 * Built on `PanResponder` rather than a native slider package: the project
 * has no slider dependency yet, and a single-axis drag over a `View` is all
 * this needs. `PanResponder` also works unmodified through react-native-web,
 * so one implementation covers every platform per the project's rule against
 * platform-specific variants for something that isn't genuinely different.
 */
export function BetSlider({
  min,
  max,
  value,
  onChange,
  disabled = false,
  onDarkSurface = false,
  className,
}: BetSliderProps) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const range = Math.max(1, max - min);

  const handleLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    widthRef.current = next;
    setWidth(next);
  };

  const commitFromX = (x: number) => {
    const trackWidth = widthRef.current;
    if (trackWidth <= 0) return;
    const ratio = Math.min(1, Math.max(0, x / trackWidth));
    const raw = min + ratio * range;
    onChange(Math.round(raw));
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: (event) => commitFromX(event.nativeEvent.locationX),
        onPanResponderMove: (event) => commitFromX(event.nativeEvent.locationX),
      }),
    // Re-created when the legal range or disabled state changes, so a stale
    // closure never commits an amount outside the current hand's limits.
    [disabled, min, max],
  );

  const ratio = range > 0 ? Math.min(1, Math.max(0, (value - min) / range)) : 0;
  const thumbLeft = width > 0 ? ratio * width : 0;

  return (
    <View
      className={cn('h-8 justify-center', disabled && 'opacity-50', className)}
      onLayout={handleLayout}
      {...panResponder.panHandlers}
    >
      <View
        className={cn(
          'h-1.5 overflow-hidden rounded-full',
          onDarkSurface ? 'bg-white/15' : 'bg-muted',
        )}
      >
        <View className="h-full rounded-full bg-primary" style={{ width: `${ratio * 100}%` }} />
      </View>

      <View
        pointerEvents="none"
        className={cn(
          'absolute h-5 w-5 rounded-full border-2 bg-primary',
          onDarkSurface ? 'border-white' : 'border-background',
        )}
        style={{ left: Math.max(0, Math.min(width - 20, thumbLeft - 10)) }}
      />
    </View>
  );
}
```

### `apps/client/src/components/poker/action-bar.tsx`

```tsx
import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { BetSlider } from './bet-slider';
import { formatChips } from './chip-stack';

export interface LegalAction {
  type: 'fold' | 'check' | 'call' | 'bet' | 'raise';
  min?: number;
  max?: number;
}

export interface ActionBarProps {
  actions: LegalAction[];
  /**
   * Set on the table screen, which is dark on every platform.
   *
   * The `dark` class only cascades on web; on native, NativeWind resolves
   * `dark:` from the app-level scheme. Fixed colours keep the bar legible on
   * the felt regardless of platform or the user's theme.
   */
  onDarkSurface?: boolean;
  /** Chips needed to call. Zero when checking is free. */
  toCall: number;
  potSize: number;
  onAct: (type: LegalAction['type'], amount: number) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * The betting controls.
 *
 * Only legal actions are rendered, which is the point: a player cannot press
 * a button the server would reject. The server still validates every action —
 * this only keeps the interface honest.
 */
export function ActionBar({
  actions,
  toCall,
  potSize,
  onAct,
  disabled = false,
  onDarkSurface = false,
  className,
}: ActionBarProps) {
  const raise = actions.find((action) => action.type === 'bet' || action.type === 'raise');
  const canFold = actions.some((action) => action.type === 'fold');
  const canCheck = actions.some((action) => action.type === 'check');
  const canCall = actions.some((action) => action.type === 'call');

  const [amount, setAmount] = useState(raise?.min ?? 0);
  // The typed text, separate from `amount`: while the field reads "1500" the
  // amount is already 1500, but while it reads "" or "15-" it should not
  // collapse to some clamped number the player didn't type yet.
  const [amountText, setAmountText] = useState(String(raise?.min ?? 0));

  // Reset to the minimum whenever the legal range changes, so a stale amount
  // from the previous street is never submitted.
  useEffect(() => {
    setAmount(raise?.min ?? 0);
    setAmountText(String(raise?.min ?? 0));
  }, [raise?.min, raise?.max]);

  const setClamped = (next: number) => {
    const clamped = Math.min(raise?.max ?? next, Math.max(raise?.min ?? next, Math.round(next)));
    setAmount(clamped);
    setAmountText(String(clamped));
  };

  if (actions.length === 0) {
    return (
      <View className={cn('items-center py-4', className)}>
        <Text
          variant="caption"
          tone={onDarkSurface ? undefined : 'muted'}
          className={cn(onDarkSurface && 'text-white/50')}
        >
          Waiting for other players
        </Text>
      </View>
    );
  }

  // Common bet sizes as fractions of the pot. Anything outside the legal
  // range is dropped rather than shown disabled.
  const presets = raise
    ? (
        [
          { label: '0.5x pot', value: Math.floor(potSize * 0.5) },
          { label: '1x pot', value: Math.floor(potSize * 1) },
          { label: '3x pot', value: Math.floor(potSize * 3) },
          { label: 'All in', value: raise.max ?? 0 },
        ] as const
      ).filter(
        (preset) =>
          preset.value >= (raise.min ?? 0) &&
          preset.value <= (raise.max ?? Number.MAX_SAFE_INTEGER),
      )
    : [];

  return (
    <View className={cn('gap-2', className)}>
      {raise && (
        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <Text
              variant="label"
              tone={onDarkSurface ? undefined : 'muted'}
              className={cn(onDarkSurface && 'text-white/60')}
            >
              Raise to
            </Text>
            <Text
              variant="numeric"
              className={cn('font-semibold', onDarkSurface && 'text-white')}
            >
              {formatChips(amount)}
            </Text>
          </View>

          <View className="flex-row gap-1.5">
            {presets.map((preset) => (
              <Button
                key={preset.label}
                size="sm"
                variant={amount === preset.value ? 'default' : 'outline'}
                disabled={disabled}
                onPress={() => setClamped(preset.value)}
                className={cn(
                  'flex-1',
                  onDarkSurface && amount !== preset.value && 'border-white/20',
                )}
              >
                <Text
                  className={cn(
                    'text-sm font-medium',
                    amount === preset.value
                      ? 'text-primary-foreground'
                      : onDarkSurface
                        ? 'text-white/80'
                        : 'text-foreground',
                  )}
                >
                  {preset.label}
                </Text>
              </Button>
            ))}
          </View>

          <View className="flex-row items-center gap-2">
            <BetSlider
              min={raise.min ?? 0}
              max={raise.max ?? amount}
              value={amount}
              onChange={setClamped}
              disabled={disabled}
              onDarkSurface={onDarkSurface}
              className="flex-1"
            />

            <TextInput
              value={amountText}
              editable={!disabled}
              keyboardType="number-pad"
              inputMode="numeric"
              onChangeText={(text) => {
                // Digits only, so a stray letter can't get typed into an
                // amount that later gets sent to the server as-is.
                const digitsOnly = text.replace(/[^0-9]/g, '');
                setAmountText(digitsOnly);
                if (digitsOnly !== '') setAmount(Number(digitsOnly));
              }}
              onBlur={() => setClamped(amount)}
              onSubmitEditing={() => setClamped(amount)}
              className={cn(
                'w-24 rounded-md border px-2 py-1.5 text-right text-sm font-medium',
                onDarkSurface
                  ? 'border-white/20 text-white'
                  : 'border-input text-foreground',
              )}
            />
          </View>
        </View>
      )}

      <View className="flex-row gap-2">
        {canFold && (
          <Button
            variant="outline"
            disabled={disabled}
            onPress={() => onAct('fold', 0)}
            className={cn('flex-1', onDarkSurface && 'border-white/20')}
          >
            <Text
              className={cn('text-base font-medium', onDarkSurface ? 'text-white' : 'text-foreground')}
            >
              Fold
            </Text>
          </Button>
        )}

        {canCheck && (
          <Button
            variant="secondary"
            label="Check"
            disabled={disabled}
            onPress={() => onAct('check', 0)}
            className="flex-1"
          />
        )}

        {canCall && (
          <Button
            variant="secondary"
            label={`Call ${formatChips(toCall)}`}
            disabled={disabled}
            onPress={() => onAct('call', 0)}
            className="flex-1"
          />
        )}

        {raise && (
          <Button
            label={raise.type === 'bet' ? 'Bet' : 'Raise'}
            disabled={disabled}
            onPress={() => {
              // Clamp at submit time too: pressing this while the field still
              // reads an unclamped value typed a moment ago (before blur)
              // must never send a number outside the legal range.
              const clamped = Math.min(
                raise.max ?? amount,
                Math.max(raise.min ?? amount, Math.round(amount)),
              );
              onAct(raise.type, clamped);
            }}
            className="flex-1"
          />
        )}
      </View>
    </View>
  );
}
```

### `apps/client/src/components/poker/hand-log.tsx`

```tsx
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import type { TableHand } from '@app/shared';
import { Badge, Button, Tabs, Text } from '@/components/ui';
import { cn } from '@/lib/cn';
import { CardRow } from './playing-card';
import { formatChips } from './chip-stack';

export interface HandLogProps {
  visible: boolean;
  hands: TableHand[];
  loading: boolean;
  viewerId: string | null;
  onClose: () => void;
  onRefresh: () => void;
}

const ACTION_VERB: Record<string, string> = {
  post_blind: 'posts',
  fold: 'folds',
  check: 'checks',
  call: 'calls',
  bet: 'bets',
  raise: 'raises to',
};

const STREET_LABEL: Record<string, string> = {
  preflop: 'Preflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
};

/**
 * The table's public record.
 *
 * Betting happened in front of everyone, so reviewing it afterwards only
 * levels the table between a player keeping notes and one who is not. Cards
 * appear only where they were actually shown.
 *
 * Two views because they answer different questions: "what happened in that
 * hand" and "how does this person play".
 */
export function HandLog({
  visible,
  hands,
  loading,
  viewerId,
  onClose,
  onRefresh,
}: HandLogProps) {
  const [tab, setTab] = useState<'hands' | 'players'>('hands');
  const [openHand, setOpenHand] = useState<string | null>(null);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
        <Pressable
          className="dark max-h-[80%] gap-3 rounded-t-lg border-t border-border bg-card p-4"
          onPress={() => {}}
        >
          <View className="flex-row items-center justify-between">
            <Text variant="subheading" className="text-white">
              Table history
            </Text>
            <View className="flex-row gap-1">
              <Button variant="ghost" size="sm" label="Refresh" onPress={onRefresh} />
              <Button variant="ghost" size="sm" label="Close" onPress={onClose} />
            </View>
          </View>

          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: 'hands', label: `Hands (${hands.length})` },
              { value: 'players', label: 'Tendencies' },
            ]}
          />

          <ScrollView className="max-h-[440px]">
            {loading ? (
              <Text variant="caption" className="py-8 text-center text-white/50">
                Loading…
              </Text>
            ) : hands.length === 0 ? (
              <Text variant="caption" className="py-8 text-center text-white/50">
                No hands have finished at this table yet.
              </Text>
            ) : tab === 'hands' ? (
              <View className="gap-2">
                {hands.map((hand) => (
                  <HandRow
                    key={hand.id}
                    hand={hand}
                    viewerId={viewerId}
                    expanded={openHand === hand.id}
                    onToggle={() => setOpenHand(openHand === hand.id ? null : hand.id)}
                  />
                ))}
              </View>
            ) : (
              <Tendencies hands={hands} viewerId={viewerId} />
            )}
          </ScrollView>

          <Text variant="caption" className="text-center text-white/40">
            Everyone at this table sees the same log. Cards appear only where they were shown.
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function HandRow({
  hand,
  viewerId,
  expanded,
  onToggle,
}: {
  hand: TableHand;
  viewerId: string | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const winners = hand.players.filter((player) => player.won);
  const shown = hand.players.filter((player) => player.revealedCards);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onToggle}
      className={cn(
        'gap-2 rounded-lg border border-white/10 bg-black/30 p-3 active:opacity-80',
        expanded && 'border-white/25',
      )}
    >
      <View className="flex-row items-center justify-between">
        <Text variant="caption" className="font-medium text-white">
          Hand #{hand.handNumber}
        </Text>
        <Text variant="caption" className="text-white/50">
          {formatChips(hand.potTotal)} pot
        </Text>
      </View>

      <View className="flex-row items-center gap-2">
        {hand.board.length > 0 ? (
          <CardRow cards={hand.board} size="sm" />
        ) : (
          <Text variant="caption" className="text-white/40">
            Ended before the flop
          </Text>
        )}
      </View>

      <Text variant="caption" className="text-white/60">
        {winners.length > 0
          ? `${winners.map((player) => player.displayName).join(', ')} won`
          : 'No winner recorded'}
        {shown.length > 0 ? ` · ${shown.length} hand(s) shown` : ' · nothing shown'}
      </Text>

      {expanded && (
        <View className="gap-3 border-t border-white/10 pt-2">
          {shown.length > 0 && (
            <View className="gap-1.5">
              <Text variant="label" className="text-white/50">
                Shown at showdown
              </Text>
              {shown.map((player) => (
                <View key={player.userId} className="flex-row items-center gap-2">
                  <Text variant="caption" className="w-20 text-white" numberOfLines={1}>
                    {player.displayName}
                  </Text>
                  <CardRow cards={player.revealedCards ?? []} size="sm" />
                  {player.handRank && (
                    <Text variant="caption" className="text-white/50">
                      {player.handRank}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}

          <View className="gap-0.5">
            <Text variant="label" className="text-white/50">
              Actions
            </Text>
            {hand.actions.map((action, index) => {
              const newStreet =
                index === 0 || hand.actions[index - 1]?.street !== action.street;
              const isViewer = action.userId === viewerId;

              return (
                <View key={action.sequence}>
                  {newStreet && (
                    <Text variant="caption" className="pt-1.5 text-white/40">
                      {STREET_LABEL[action.street] ?? action.street}
                    </Text>
                  )}
                  <Text variant="caption" className={isViewer ? 'text-white' : 'text-white/70'}>
                    <Text variant="caption" className="font-medium">
                      {action.displayName ?? 'Unknown'}
                    </Text>{' '}
                    {ACTION_VERB[action.action] ?? action.action}
                    {action.amount > 0 ? ` ${formatChips(action.amount)}` : ''}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </Pressable>
  );
}

interface Tendency {
  userId: string;
  displayName: string;
  hands: number;
  /** Hands where they put money in preflop by choice. */
  entered: number;
  raises: number;
  folds: number;
  showdowns: number;
  net: number;
}

/**
 * What the log is actually for.
 *
 * Counting how often someone enters a pot or raises is the read a human
 * makes from watching, and it is derived entirely from actions everyone
 * already saw — no hidden information is involved.
 */
function Tendencies({ hands, viewerId }: { hands: TableHand[]; viewerId: string | null }) {
  const rows = useMemo(() => {
    const byPlayer = new Map<string, Tendency>();

    for (const hand of hands) {
      const seen = new Set<string>();

      for (const player of hand.players) {
        const entry = byPlayer.get(player.userId) ?? {
          userId: player.userId,
          displayName: player.displayName,
          hands: 0,
          entered: 0,
          raises: 0,
          folds: 0,
          showdowns: 0,
          net: 0,
        };
        entry.hands += 1;
        entry.net += player.netChips;
        if (player.revealedCards) entry.showdowns += 1;
        byPlayer.set(player.userId, entry);
      }

      // Who posted a blind this hand. The big blind enters the pot by
      // checking, which looks like no action at all — counting only calls and
      // raises scored every big blind at zero percent even when they played
      // the hand to showdown.
      const posted = new Set(
        hand.actions
          .filter((action) => action.action === 'post_blind' && action.userId)
          .map((action) => action.userId as string),
      );

      for (const action of hand.actions) {
        if (!action.userId) continue;
        const entry = byPlayer.get(action.userId);
        if (!entry) continue;

        if (action.action === 'fold') entry.folds += 1;

        if (action.street === 'preflop') {
          const voluntary =
            action.action === 'call' ||
            action.action === 'raise' ||
            action.action === 'bet' ||
            // A blind who checks has chosen to see the flop for free, which
            // is entering the pot even though no chips moved.
            (action.action === 'check' && posted.has(action.userId));

          if (voluntary && !seen.has(`${action.userId}:entered`)) {
            entry.entered += 1;
            seen.add(`${action.userId}:entered`);
          }

          if (action.action === 'raise' || action.action === 'bet') entry.raises += 1;
        }
      }
    }

    return [...byPlayer.values()].sort((a, b) => b.hands - a.hands);
  }, [hands]);

  if (rows.length === 0) {
    return (
      <Text variant="caption" className="py-8 text-center text-white/50">
        Not enough hands yet.
      </Text>
    );
  }

  return (
    <View className="gap-2">
      <Text variant="caption" className="text-white/50">
        Derived from actions everyone at this table already saw.
      </Text>

      {rows.map((row) => {
        const entryRate = row.hands > 0 ? Math.round((row.entered / row.hands) * 100) : 0;
        const style =
          row.hands < 5
            ? 'Too few hands'
            : entryRate > 55
              ? 'Loose'
              : entryRate < 25
                ? 'Tight'
                : 'Balanced';

        return (
          <View
            key={row.userId}
            className={cn(
              'gap-1 rounded-lg border border-white/10 bg-black/30 p-3',
              row.userId === viewerId && 'border-primary/40',
            )}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-1.5">
                <Text variant="caption" className="font-medium text-white">
                  {row.displayName}
                  {row.userId === viewerId ? ' (you)' : ''}
                </Text>
                <Badge label={style} variant={row.hands < 5 ? 'muted' : 'secondary'} />
              </View>
              <Text
                variant="numeric"
                className={cn(
                  'text-xs',
                  row.net >= 0 ? 'text-success' : 'text-destructive',
                )}
              >
                {row.net >= 0 ? '+' : ''}
                {formatChips(row.net)}
              </Text>
            </View>

            <Text variant="caption" className="text-white/50">
              {row.hands} hands · entered {entryRate}% · raised {row.raises}× · folded{' '}
              {row.folds}× · showed {row.showdowns}×
            </Text>
          </View>
        );
      })}
    </View>
  );
}
```

### `apps/client/src/components/poker/table-chat.tsx`

```tsx
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import type { ChatMessage } from '@app/shared';
import { Button, Text } from '@/components/ui';
import { cn } from '@/lib/cn';

export interface TableChatProps {
  visible: boolean;
  messages: ChatMessage[];
  viewerId: string | null;
  onSend: (body: string) => void;
  onClose: () => void;
}

/**
 * In-game chat.
 *
 * Sending and receiving both run over the live socket — only the backlog on
 * open is missing, because the server has no endpoint to fetch recent
 * messages. Until it does, a player who joins mid-session starts with an
 * empty log rather than the last few lines.
 */
export function TableChat({ visible, messages, viewerId, onSend, onClose }: TableChatProps) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  // New messages arrive at the bottom, so follow them.
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(timer);
  }, [messages.length, visible]);

  function send() {
    const body = draft.trim();
    if (!body) return;
    onSend(body);
    setDraft('');
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
        <Pressable
          className="dark max-h-[70%] gap-3 rounded-t-lg border-t border-border bg-card p-4"
          onPress={() => {}}
        >
          <View className="flex-row items-center justify-between">
            <Text variant="subheading" className="text-white">
              Table chat
            </Text>
            <Button variant="ghost" size="sm" label="Close" onPress={onClose} />
          </View>

          <ScrollView ref={scrollRef} className="max-h-[300px]">
            {messages.length === 0 ? (
              <Text variant="caption" className="py-6 text-center text-white/40">
                Nothing said yet.
              </Text>
            ) : (
              <View className="gap-2">
                {messages.map((message) => {
                  const mine = message.userId === viewerId;
                  return (
                    <View
                      key={message.id}
                      className={cn('max-w-[85%] rounded-lg px-3 py-2', mine
                        ? 'self-end bg-primary'
                        : 'self-start bg-white/10')}
                    >
                      {!mine && (
                        <Text variant="caption" className="font-medium text-white/60">
                          {message.displayName}
                        </Text>
                      )}
                      <Text
                        variant="caption"
                        className={mine ? 'text-primary-foreground' : 'text-white'}
                      >
                        {message.body}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>

          <View className="flex-row gap-2">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={send}
              placeholder="Say something"
              placeholderTextColor="#9AA3B4"
              maxLength={500}
              returnKeyType="send"
              className="min-h-[44px] flex-1 rounded-md border border-input bg-background px-3 py-2 text-base text-foreground"
            />
            <Button label="Send" onPress={send} disabled={draft.trim().length === 0} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
```

### `apps/client/src/components/poker/add-bot-sheet.tsx`

```tsx
import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import type { BotDifficulty } from '@app/shared';
import { Button, Text } from '@/components/ui';
import { cn } from '@/lib/cn';

interface Option {
  value: BotDifficulty;
  label: string;
  description: string;
}

/**
 * One line each, describing how the bot plays rather than how it is built.
 * "Monte Carlo equity" means nothing to someone choosing an opponent.
 */
const OPTIONS: Option[] = [
  { value: 'easy', label: 'Easy', description: 'Plays almost at random' },
  { value: 'medium', label: 'Medium', description: 'Weighs its hand against the price' },
  { value: 'hard', label: 'Hard', description: 'Estimates its odds, bluffs sometimes' },
  { value: 'expert', label: 'Expert', description: 'Learns how you play and adapts' },
];

export interface AddBotSheetProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (difficulty: BotDifficulty) => void;
  busy?: boolean;
}

export function AddBotSheet({ visible, onClose, onConfirm, busy = false }: AddBotSheetProps) {
  const [selected, setSelected] = useState<BotDifficulty>('medium');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        className="flex-1 items-center justify-center bg-black/60 p-6"
        onPress={onClose}
      >
        {/* Stops a tap inside the card from closing the sheet. */}
        <Pressable
          className="dark w-full max-w-[420px] gap-3 rounded-lg border border-border bg-card p-4"
          onPress={() => {}}
        >
          <Text variant="subheading" className="text-white">
            Add a bot
          </Text>

          <View className="gap-2">
            {OPTIONS.map((option) => {
              const active = selected === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => setSelected(option.value)}
                  className={cn(
                    'rounded-md border px-3 py-2.5',
                    active ? 'border-primary bg-primary/15' : 'border-white/15',
                  )}
                >
                  <Text className={cn('font-medium', active ? 'text-white' : 'text-white/80')}>
                    {option.label}
                  </Text>
                  <Text variant="caption" className="text-white/50">
                    {option.description}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="flex-row gap-2">
            <Button variant="outline" onPress={onClose} className="flex-1 border-white/20">
              <Text className="text-base font-medium text-white">Cancel</Text>
            </Button>
            <Button
              loading={busy}
              onPress={() => onConfirm(selected)}
              className="flex-1"
              label="Add"
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
```

### `apps/client/src/components/poker/index.ts`

```ts
export { ActionBar, type ActionBarProps, type LegalAction } from './action-bar';
export { AddBotSheet, type AddBotSheetProps } from './add-bot-sheet';
export { BetSlider, type BetSliderProps } from './bet-slider';
export { Board, type BoardProps } from './board';
export { ChipStack, PotDisplay, formatChips, type ChipStackProps } from './chip-stack';
export { HandLog, type HandLogProps } from './hand-log';
export { DealtCard, type DealtCardProps } from './dealt-card';
export { CardRow, PlayingCard, type CardCode, type PlayingCardProps } from './playing-card';
export { PlayerSeat, type PlayerSeatProps, type SeatStatus } from './player-seat';
export { TableChat, type TableChatProps } from './table-chat';
export { TableCentre, TableFelt } from './table-felt';
```
