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
