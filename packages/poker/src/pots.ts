import { PlayerStatus, type Player, type Pot } from './types';

/**
 * Builds the main pot and any side pots from what each player committed.
 *
 * The rule: a player can only win chips up to the amount they themselves put
 * in, from every opponent. So when someone is all in for less than the others,
 * the excess forms a side pot that only the deeper players can win.
 *
 * Worked example — three players commit 50, 200, and 200:
 *   Main pot  150 = 50 x 3, all three eligible
 *   Side pot  300 = 150 x 2, only the two deep players eligible
 *
 * Folded players' chips stay in the pot but they win nothing, which is why
 * they count toward the amount and not toward eligibility.
 */
export function buildPots(players: readonly Player[]): Pot[] {
  const contributors = players.filter((player) => player.totalCommitted > 0);
  if (contributors.length === 0) return [];

  // Each distinct commitment level marks the top of one pot layer.
  const levels = [...new Set(contributors.map((player) => player.totalCommitted))].sort(
    (a, b) => a - b,
  );

  const pots: Pot[] = [];
  let previousLevel = 0;

  for (const level of levels) {
    const layerSize = level - previousLevel;
    if (layerSize <= 0) continue;

    // Everyone who reached this level pays into this layer, folded included.
    const payers = contributors.filter((player) => player.totalCommitted >= level);
    const amount = layerSize * payers.length;
    if (amount <= 0) continue;

    // Only players still live can actually win it.
    const eligiblePlayerIds = payers
      .filter((player) => player.status !== PlayerStatus.Folded)
      .map((player) => player.id);

    const previous = pots[pots.length - 1];

    // Merge into the previous layer when nobody new became ineligible —
    // otherwise a table with no all-ins would produce several identical pots.
    if (
      previous &&
      previous.eligiblePlayerIds.length === eligiblePlayerIds.length &&
      previous.eligiblePlayerIds.every((id) => eligiblePlayerIds.includes(id))
    ) {
      previous.amount += amount;
    } else {
      pots.push({ amount, eligiblePlayerIds });
    }

    previousLevel = level;
  }

  return pots;
}

/**
 * Splits `amount` between winners.
 *
 * Chips are indivisible, so a three-way split of 100 cannot be 33.33 each.
 * The odd chips go to the earliest seats after the button, which is the
 * standard rule. `orderedPlayerIds` must already be in that order.
 */
export function splitPot(
  amount: number,
  winnerIds: readonly string[],
  orderedPlayerIds: readonly string[],
): Map<string, number> {
  const payouts = new Map<string, number>();
  if (winnerIds.length === 0) return payouts;

  const share = Math.floor(amount / winnerIds.length);
  let remainder = amount - share * winnerIds.length;

  for (const id of winnerIds) {
    payouts.set(id, share);
  }

  // Hand out odd chips in seat order rather than arbitrarily.
  const ordered = orderedPlayerIds.filter((id) => winnerIds.includes(id));
  for (const id of ordered) {
    if (remainder <= 0) break;
    payouts.set(id, (payouts.get(id) ?? 0) + 1);
    remainder -= 1;
  }

  return payouts;
}
