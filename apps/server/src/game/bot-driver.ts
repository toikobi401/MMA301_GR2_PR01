import {
  buildBotView,
  clampDecision,
  easyPolicy,
  hardPolicy,
  mediumPolicy,
  type BotDecision,
  type BotPolicy,
} from '@app/poker';
import type { BotDifficulty } from '@app/shared';
import type { Table } from './table-manager.js';
import { secureRandom } from './random.js';

const POLICIES: Record<BotDifficulty, BotPolicy> = {
  easy: easyPolicy,
  medium: mediumPolicy,
  hard: hardPolicy,
  // Expert arrives in a later step; until then it plays like hard rather than
  // being unavailable.
  expert: hardPolicy,
};

interface PendingTurn {
  timer: NodeJS.Timeout;
  handId: string;
  botId: string;
  /** Table sequence when the turn was scheduled. */
  seq: number;
}

/** One pending decision per table, always. */
const pending = new Map<string, PendingTurn>();

/** Client-side deal animation runs for this long; do not act over it. */
const DEAL_ANIMATION_MS = 1200;

const MIN_DELAY_MS = 600;
const MAX_DELAY_MS = 3000;

/**
 * How long to appear to think.
 *
 * Computed after the policy has already run, from its decision — so a slow
 * Monte Carlo eats into the delay rather than adding to it, and a bot never
 * takes longer than the theatre allows.
 */
function thinkingDelay(
  decision: BotDecision,
  difficulty: BotDifficulty,
  isFirstActionOfHand: boolean,
  random: () => number,
): number {
  let delay = MIN_DELAY_MS + random() * 900;

  // Aggression reads as deliberation.
  if (decision.type === 'bet' || decision.type === 'raise') delay += 500;

  // Acting during the deal animation makes cards jump mid-flight.
  if (isFirstActionOfHand) delay += DEAL_ANIMATION_MS - MIN_DELAY_MS;

  // Free characterisation: the weak bot is impulsive, the strong one careful.
  if (difficulty === 'easy') delay *= 0.7;
  if (difficulty === 'expert') delay *= 1.25;

  return Math.round(Math.max(MIN_DELAY_MS, Math.min(MAX_DELAY_MS, delay)));
}

/** Cancels any pending decision for a table. */
export function cancelPendingTurn(tableId: string): void {
  const entry = pending.get(tableId);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(tableId);
}

/**
 * Decides and schedules a bot's action.
 *
 * Wired to `Table.onBotTurn`, which fires exactly once per new actor.
 */
export function handleBotTurn(table: Table, botId: string, difficulty: BotDifficulty): void {
  cancelPendingTurn(table.id);

  const hand = table.currentHand;
  if (!hand) return;

  const policy = POLICIES[difficulty] ?? mediumPolicy;

  let decision: BotDecision;
  try {
    // The only legitimate use of `currentHand` here: it goes straight into
    // the redactor, and the policy never sees the raw state.
    const view = buildBotView(hand, botId);
    decision = clampDecision(view, policy(view, { random: secureRandom, opponents: new Map() }));
  } catch (error) {
    // A crashed policy must not make the table wait out the full 30-second
    // clock. Act immediately with the safest legal option instead.
    console.error(`Bot policy failed for ${botId} (${difficulty})`, error);
    try {
      table.act(botId, 'check', 0);
    } catch {
      try {
        table.act(botId, 'fold', 0);
      } catch {
        // The hand moved on; nothing to do.
      }
    }
    return;
  }

  // Preflop with no voluntary action yet means the deal just finished.
  const isFirstActionOfHand =
    hand.street === 'preflop' &&
    hand.actions.every((action) => action.type === 'post_blind');

  const delay = thinkingDelay(decision, difficulty, isFirstActionOfHand, secureRandom);

  const entry: PendingTurn = {
    handId: hand.handId,
    botId,
    seq: table.seq,
    timer: setTimeout(() => {
      pending.delete(table.id);

      // Re-validate rather than trying to cancel from every path that could
      // invalidate this. The sequence check is the strongest guard and
      // subsumes the others; the rest make the failure modes explicit.
      const current = table.currentHand;
      if (!current) return;
      if (current.handId !== entry.handId) return;
      if (current.actingPlayerId !== entry.botId) return;
      if (table.seq !== entry.seq) return;

      try {
        table.act(entry.botId, decision.type, decision.amount);
      } catch (error) {
        console.error(`Bot action rejected for ${entry.botId}`, error);
      }
    }, delay),
  };

  entry.timer.unref?.();
  pending.set(table.id, entry);
}

/** Exposed for tests. */
export function pendingCount(): number {
  return pending.size;
}
