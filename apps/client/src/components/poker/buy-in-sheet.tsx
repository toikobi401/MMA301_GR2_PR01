import { useEffect, useState } from 'react';
import { Modal, Pressable, TextInput, View } from 'react-native';
import { Button, Text } from '@/components/ui';
import { cn } from '@/lib/cn';
import { BetSlider } from './bet-slider';
import { formatChips } from './chip-stack';

export interface BuyInSheetProps {
  visible: boolean;
  title: string;
  min: number;
  max: number;
  /** Why the minimum is what it is, when it is not simply the table's. */
  hint?: string;
  /** Offered as a choice when present. */
  freeSeats?: number[];
  confirmLabel: string;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (amount: number, seat: number | undefined) => void;
}

/** Choosing how many chips to bring, for sitting down and for topping up. */
export function BuyInSheet({
  visible,
  title,
  min,
  max,
  hint,
  freeSeats,
  confirmLabel,
  busy = false,
  error,
  onClose,
  onConfirm,
}: BuyInSheetProps) {
  const [amount, setAmount] = useState(min);
  const [text, setText] = useState(String(min));
  const [seat, setSeat] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!visible) return;
    setAmount(min);
    setText(String(min));
    setSeat(undefined);
  }, [visible, min]);

  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next)));
  const choose = (next: number) => {
    const clamped = clamp(next);
    setAmount(clamped);
    setText(String(clamped));
  };

  const affordable = max >= min;
  const presets = [
    { label: 'Min', value: min },
    { label: 'Half', value: Math.round((min + max) / 2) },
    { label: 'Max', value: max },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 items-center justify-center bg-black/60 p-6" onPress={onClose}>
        {/* Stops a tap inside the card from closing the sheet. */}
        <Pressable
          className="dark w-full max-w-[420px] gap-3 rounded-lg border border-border bg-card p-4"
          onPress={() => {}}
        >
          <Text variant="subheading" className="text-white">
            {title}
          </Text>

          {!affordable ? (
            <Text variant="caption" className="text-destructive">
              You need at least {formatChips(min)} chips. Deposit more from your wallet.
            </Text>
          ) : (
            <>
              <View className="flex-row items-center justify-between">
                <Text variant="label" className="text-white/60">
                  {formatChips(min)} – {formatChips(max)}
                </Text>
                <TextInput
                  accessibilityLabel="Amount"
                  value={text}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  onChangeText={(next) => {
                    const digits = next.replace(/[^0-9]/g, '');
                    setText(digits);
                    if (digits !== '') setAmount(Number(digits));
                  }}
                  onBlur={() => choose(amount)}
                  className="w-28 rounded-md border border-white/20 px-2 py-1.5 text-right text-sm font-medium text-white"
                />
              </View>

              <BetSlider min={min} max={max} value={amount} onChange={choose} onDarkSurface />

              <View className="flex-row gap-2">
                {presets.map((preset) => (
                  <Button
                    key={preset.label}
                    variant="outline"
                    size="sm"
                    onPress={() => choose(preset.value)}
                    className="flex-1 border-white/20"
                  >
                    <Text className="text-sm font-medium text-white/80">{preset.label}</Text>
                  </Button>
                ))}
              </View>

              {hint && (
                <Text variant="caption" className="text-white/60">
                  {hint}
                </Text>
              )}

              {freeSeats && freeSeats.length > 0 && (
                <View className="gap-1.5">
                  <Text variant="label" className="text-white/60">
                    Seat
                  </Text>
                  <View className="flex-row flex-wrap gap-1.5">
                    <SeatChoice label="Any" active={seat === undefined} onPress={() => setSeat(undefined)} />
                    {freeSeats.map((number) => (
                      <SeatChoice
                        key={number}
                        label={String(number + 1)}
                        active={seat === number}
                        onPress={() => setSeat(number)}
                      />
                    ))}
                  </View>
                </View>
              )}
            </>
          )}

          {error && (
            <Text variant="caption" className="text-destructive">
              {error}
            </Text>
          )}

          <View className="flex-row gap-2">
            <Button variant="outline" onPress={onClose} className="flex-1 border-white/20">
              <Text className="text-base font-medium text-white">Cancel</Text>
            </Button>
            <Button
              label={confirmLabel}
              loading={busy}
              disabled={!affordable}
              onPress={() => onConfirm(clamp(amount), seat)}
              className="flex-1"
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SeatChoice({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={cn(
        'min-h-[44px] min-w-[44px] items-center justify-center rounded-md border px-2',
        active ? 'border-primary bg-primary/15' : 'border-white/15',
      )}
    >
      <Text variant="caption" className={active ? 'text-white' : 'text-white/70'}>
        {label}
      </Text>
    </Pressable>
  );
}
