import { decideFromEquity, type HardAdjustments } from './hard';
import type { BotContext, BotPolicy, OpponentProfile } from './types';
import type { BotView } from '../bot-view';

/**
 * Below this, a read is noise.
 *
 * Acting on fifteen hands of data is worse than acting on none: a tight
 * player who happened to catch three good hands looks like a maniac, and the
 * bot would adjust in exactly the wrong direction.
 */
const MIN_HANDS = 15;

/** Who has put money in this hand, so far, other than the bot. */
function aggressorsThisHand(view: BotView): Set<string> {
  const aggressive = new Set<string>();
  for (const action of view.actions) {
    if (action.type === 'bet' || action.type === 'raise') {
      if (action.playerId !== view.self.id) aggressive.add(action.playerId);
    }
  }
  return aggressive;
}

/**
 * Turns opponent reads into threshold shifts.
 *
 * Returned as deltas on hard's decision rather than a separate decision
 * function, so expert stays a thin readable layer over hard instead of a copy
 * that drifts.
 */
export function adjustmentsFor(view: BotView, ctx: BotContext): HardAdjustments {
  const opponents = view.players
    .filter((player) => player.id !== view.self.id)
    .map((player) => ctx.opponents.get(player.id))
    .filter((profile): profile is OpponentProfile => profile !== undefined)
    .filter((profile) => profile.handsObserved >= MIN_HANDS);

  if (opponents.length === 0) return {};

  const aggressive = aggressorsThisHand(view);
  const adjustments: HardAdjustments = {};

  let equityShift = 0;
  let callShift = 0;
  let raiseShift = 0;
  let bluffChance: number | undefined;
  let valueBetFraction: number | undefined;

  for (const player of view.players) {
    if (player.id === view.self.id) continue;
    const profile = ctx.opponents.get(player.id);
    if (!profile || profile.handsObserved < MIN_HANDS) continue;

    const isAggressorNow = aggressive.has(player.id);

    // A loose opponent's range is wide, which is roughly what the uniform
    // random simulation already assumes — so no equity correction, but their
    // bets mean less, so call wider and value bet thinner.
    if (profile.vpip > 0.45) {
      callShift -= 0.04;
      raiseShift -= 0.05;
    }

    // A tight opponent's real range is far stronger than random cards. The
    // simulation therefore *overestimates* the bot's equity against them.
    // This is the single most valuable correction and the main reason expert
    // beats hard.
    if (profile.vpip < 0.2 && isAggressorNow) {
      equityShift -= 0.06;
    }

    // A passive player who suddenly bets almost always has it.
    if (profile.aggressionFactor < 0.5 && isAggressorNow) {
      equityShift -= 0.05;
    }

    // Exploitative bluffing is the other half of this tier's identity.
    if (profile.foldToBet > 0.55 && view.liveCount <= 2) {
      bluffChance = Math.max(bluffChance ?? 0, 0.35);
    }

    // A station cannot be bluffed, so stop trying and bet bigger for value.
    if (profile.foldToBet < 0.25) {
      bluffChance = Math.min(bluffChance ?? 1, 0.02);
      valueBetFraction = Math.max(valueBetFraction ?? 0, 0.9);
    }
  }

  if (equityShift !== 0) adjustments.equityShift = equityShift;
  if (callShift !== 0) adjustments.callShift = callShift;
  if (raiseShift !== 0) adjustments.raiseShift = raiseShift;
  if (bluffChance !== undefined) adjustments.bluffChance = bluffChance;
  if (valueBetFraction !== undefined) adjustments.valueBetFraction = valueBetFraction;

  return adjustments;
}

/**
 * The strongest tier: hard's equity decision, corrected by what it has
 * learned about the players at the table.
 *
 * With no reads it plays exactly like hard, which is both correct behaviour
 * and a property worth testing.
 */
export const expertPolicy: BotPolicy = (view, ctx) =>
  decideFromEquity(view, ctx, adjustmentsFor(view, ctx));
