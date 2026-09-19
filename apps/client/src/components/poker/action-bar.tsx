import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
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

  // Reset to the minimum whenever the legal range changes, so a stale amount
  // from the previous street is never submitted.
  useEffect(() => {
    setAmount(raise?.min ?? 0);
  }, [raise?.min, raise?.max]);

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
          { label: '½ pot', value: Math.floor(potSize / 2) },
          { label: '¾ pot', value: Math.floor((potSize * 3) / 4) },
          { label: 'Pot', value: potSize },
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
                onPress={() => setAmount(preset.value)}
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
            onPress={() => onAct(raise.type, amount)}
            className="flex-1"
          />
        )}
      </View>
    </View>
  );
}
