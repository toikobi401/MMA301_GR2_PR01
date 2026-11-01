/**
 * Where each seat sits on screen.
 *
 * Play runs clockwise, and the viewer sits bottom centre on every screen, so
 * the seats are rotated to start from them: the next player sits to their left
 * and play goes up the left side, across the top, and back down the right. In
 * any other order the turn appears to jump around the table.
 *
 * Rows are written left to right on screen, which is why the bottom two are
 * reversed: clockwise along the bottom edge runs right to left.
 */
export interface SeatLayout<T> {
  top: T[];
  bottomLeft: T[];
  bottomRight: T[];
}

export function arrangeSeats<T extends { seat: number }>(
  seats: readonly T[],
  viewerSeat: number | null,
): SeatLayout<T> {
  const ordered = [...seats].sort((a, b) => a.seat - b.seat);
  const start = viewerSeat === null ? -1 : ordered.findIndex((seat) => seat.seat > viewerSeat);
  const clockwise = (
    start === -1 ? ordered : [...ordered.slice(start), ...ordered.slice(0, start)]
  ).filter((seat) => seat.seat !== viewerSeat);

  const perSide = Math.floor(clockwise.length / 4);

  return {
    bottomLeft: clockwise.slice(0, perSide).reverse(),
    top: clockwise.slice(perSide, clockwise.length - perSide),
    bottomRight: clockwise.slice(clockwise.length - perSide).reverse(),
  };
}

/** A seat's place in the deal, which starts left of the button. */
export function dealPosition(
  seat: number,
  occupiedSeats: readonly number[],
  buttonSeat: number | null,
): number {
  const ordered = [...occupiedSeats].sort((a, b) => a - b);
  const start = ordered.findIndex((candidate) => candidate > (buttonSeat ?? -1));
  const clockwise = start === -1 ? ordered : [...ordered.slice(start), ...ordered.slice(0, start)];
  return Math.max(0, clockwise.indexOf(seat));
}
