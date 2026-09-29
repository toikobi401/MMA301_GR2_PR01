import { Pressable, View } from 'react-native';
import { cn } from '@/lib/cn';
import { Text } from './text';

export interface TabOption<T extends string> {
  value: T;
  label: string;
  /** Shown as a small indigo pill when greater than zero — something waits on the user. */
  count?: number;
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
              'flex-1 flex-row items-center justify-center gap-1.5 rounded-sm border px-3 py-1.5',
              active ? 'border-border bg-card' : 'border-transparent',
            )}
          >
            <Text
              variant="caption"
              className={cn('font-medium', active ? 'text-foreground' : 'text-muted-foreground')}
            >
              {option.label}
            </Text>
            {option.count !== undefined && option.count > 0 && (
              <View className="min-w-[20px] items-center rounded-full bg-primary px-1.5">
                <Text className="font-mono text-xs tabular-nums text-primary-foreground">
                  {option.count}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
