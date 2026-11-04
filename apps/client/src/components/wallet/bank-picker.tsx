import { Pressable, View } from 'react-native';
import { Input, Text } from '@/components/ui';
import { cn } from '@/lib/cn';

/**
 * Common NAPAS BINs. The field below still accepts any six-digit BIN, so a
 * bank missing from this list is a convenience gap rather than a blocker.
 */
export const BANKS = [
  { bin: '970436', name: 'Vietcombank' },
  { bin: '970415', name: 'VietinBank' },
  { bin: '970418', name: 'BIDV' },
  { bin: '970405', name: 'Agribank' },
  { bin: '970422', name: 'MB Bank' },
  { bin: '970407', name: 'Techcombank' },
  { bin: '970416', name: 'ACB' },
  { bin: '970432', name: 'VPBank' },
  { bin: '970423', name: 'TPBank' },
  { bin: '970403', name: 'Sacombank' },
] as const;

export function bankName(bin: string | null): string | null {
  if (!bin) return null;
  return BANKS.find((bank) => bank.bin === bin)?.name ?? `BIN ${bin}`;
}

export interface BankPickerProps {
  bin: string;
  onBinChange: (bin: string) => void;
  accountNumber: string;
  onAccountNumberChange: (value: string) => void;
}

export function BankPicker({ bin, onBinChange, accountNumber, onAccountNumberChange }: BankPickerProps) {
  return (
    <View className="gap-3">
      <View className="gap-1.5">
        <Text variant="caption" className="font-medium text-foreground">
          Bank
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {BANKS.map((bank) => {
            const selected = bank.bin === bin;
            return (
              <Pressable
                key={bank.bin}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onBinChange(bank.bin)}
                className={cn(
                  'rounded-full border px-3 py-1.5',
                  selected ? 'border-primary bg-primary' : 'border-border bg-transparent',
                )}
              >
                <Text
                  variant="caption"
                  className={cn(
                    'font-medium',
                    selected ? 'text-primary-foreground' : 'text-foreground',
                  )}
                >
                  {bank.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Input
        label="Bank BIN"
        value={bin}
        onChangeText={(value) => onBinChange(value.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        hint="Six digits. Pick a bank above or type another."
      />

      <Input
        label="Account number"
        value={accountNumber}
        onChangeText={(value) => onAccountNumberChange(value.replace(/\D/g, '').slice(0, 19))}
        keyboardType="number-pad"
        hint="The account must be in your name."
      />
    </View>
  );
}
