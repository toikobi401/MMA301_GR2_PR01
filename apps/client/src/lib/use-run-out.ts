import { useEffect, useState } from 'react';
import { RUNOUT_STREET_MS, runOutStreets, type TableState } from '@app/shared';

interface Seen {
  handId: string | null;
  boardLength: number;
  stacks: Map<number, number>;
  live: boolean;
}

const stacksOf = (state: TableState) =>
  new Map(state.seats.map((seat) => [seat.seat, seat.stack]));

/**
 * Spaces out a board dealt all at once.
 *
 * With everyone all in the server finishes the hand in one step, because no
 * more decisions exist. Showing five cards and the winner together throws away
 * the only drama in the hand, so the streets arrive one at a time here. The
 * result is already decided; this is presentation only, as with the deal.
 *
 * The stacks are held back too, or the seats would give away the winner.
 */
export function useRunOut(state: TableState | null) {
  const [seen, setSeen] = useState<Seen>({
    handId: null,
    boardLength: 0,
    stacks: new Map(),
    live: false,
  });
  const [shown, setShown] = useState<number | null>(null);
  const [heldStacks, setHeldStacks] = useState<Map<number, number> | null>(null);

  // Adjusted during render rather than in an effect, so the full board never
  // paints for a frame before the reveal starts.
  if (state && (state.handId !== seen.handId || state.board.length !== seen.boardLength)) {
    const sameHand = state.handId === seen.handId;
    const before = sameHand ? seen.boardLength : 0;
    // `live` is false on a first snapshot: reconnecting to a finished hand
    // shows it as it is rather than replaying it.
    const runningOut =
      seen.live &&
      state.street === 'complete' &&
      runOutStreets(before, state.board.length) > 0;

    setSeen({ handId: state.handId, boardLength: state.board.length, stacks: stacksOf(state), live: true });
    setShown(runningOut ? before : null);
    setHeldStacks(runningOut ? seen.stacks : null);
  } else if (state && state.street !== 'complete' && !seen.live) {
    setSeen((previous) => ({ ...previous, live: true, stacks: stacksOf(state) }));
  } else if (state && state.street !== 'complete' && shown === null) {
    // Tracks bets as they move, so held stacks are the ones just before the end.
    const current = stacksOf(state);
    const changed = state.seats.some((seat) => seen.stacks.get(seat.seat) !== seat.stack);
    if (changed) setSeen((previous) => ({ ...previous, stacks: current }));
  }

  const target = state?.board.length ?? 0;

  useEffect(() => {
    if (shown === null) return;
    if (shown >= target) {
      setShown(null);
      setHeldStacks(null);
      return;
    }

    const timer = setTimeout(
      () => setShown((current) => (current === null ? null : current < 3 ? 3 : current + 1)),
      RUNOUT_STREET_MS,
    );
    return () => clearTimeout(timer);
  }, [shown, target]);

  return {
    board: shown === null ? (state?.board ?? []) : (state?.board ?? []).slice(0, shown),
    revealing: shown !== null,
    /** The stack to display for a seat while the winner is still unknown. */
    stackFor: (seat: number, actual: number) => heldStacks?.get(seat) ?? actual,
  };
}
