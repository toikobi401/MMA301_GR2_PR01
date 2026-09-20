import { ActionType } from '../types';
import { betSize, can, passiveDecision, potOdds, raiseOption } from './strength';
import type { BotPolicy } from './types';

/**
 * The beginner tier.
 *
 * Picks from the legal actions at weighted random and **ignores its own
 * cards entirely** — that is the tier's identity, and it makes easy trivially
 * distinguishable from medium in testing.
 *
 * Two corrections stop it looking broken rather than merely weak:
 * it never folds when checking is free, because no human ever does that, and
 * it folds less often when the price is cheap.
 */
export const easyPolicy: BotPolicy = (view, ctx) => {
  if (view.legalActions.length === 0) return passiveDecision(view);

  const free = view.toCall <= 0;
  const cheap = potOdds(view) < 0.15;

  const weights: Array<{ decision: ReturnType<BotPolicy>; weight: number }> = [];

  if (can(view, ActionType.Fold) && !free) {
    // Folding a free check is a tell no player gives, so it is excluded
    // above rather than merely made unlikely.
    weights.push({ decision: { type: ActionType.Fold, amount: 0 }, weight: cheap ? 0.075 : 0.15 });
  }

  if (can(view, ActionType.Check)) {
    weights.push({ decision: { type: ActionType.Check, amount: 0 }, weight: 0.45 });
  }

  if (can(view, ActionType.Call)) {
    weights.push({ decision: { type: ActionType.Call, amount: 0 }, weight: 0.3 });
  }

  const raise = raiseOption(view);
  if (raise) {
    // Bet size is random too — this tier has no concept of sizing.
    const fraction = 0.4 + ctx.random() * 0.4;
    weights.push({
      decision: { type: raise.type, amount: betSize(view, fraction) },
      weight: 0.1,
    });
  }

  const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) return passiveDecision(view);

  let roll = ctx.random() * total;
  for (const entry of weights) {
    roll -= entry.weight;
    if (roll <= 0) return entry.decision;
  }

  return weights[weights.length - 1]?.decision ?? passiveDecision(view);
};
