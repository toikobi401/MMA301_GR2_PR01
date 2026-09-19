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
