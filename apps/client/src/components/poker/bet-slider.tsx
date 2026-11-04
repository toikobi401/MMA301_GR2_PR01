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
