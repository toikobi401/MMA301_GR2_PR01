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
