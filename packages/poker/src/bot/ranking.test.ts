import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBotView } from '../bot-view';
import { applyAction, startHand } from '../hand';
import { seededRandom } from '../test-helpers';
import { Street, type HandState } from '../types';
import { easyPolicy } from './easy';
import { hardPolicy } from './hard';
import { mediumPolicy } from './medium';
import { clampDecision } from './strength';
import type { BotPolicy } from './types';

/**
 * Plays a heads-up match and returns what the first policy won.
 *
 * This is the one test that verifies the difficulty tiers actually mean
 * something. Everything else checks a tier does what it was written to do;
 * this checks that doing it is worth anything.
 */
function match(a: BotPolicy, b: BotPolicy, hands: number, seed: number): number {
  const random = seededRandom(seed);
  const stacks = new Map([
    ['a', 10_000],
    ['b', 10_000],
  ]);

  for (let index = 0; index < hands; index += 1) {
    // Top both players back up each hand so one early cooler cannot end the
    // match; we are measuring decision quality per hand, not survival.
    const startA = 2000;
    const startB = 2000;

    const state: HandState = startHand({
      handId: `h${index}`,
      players: [
        { id: 'a', seat: 0, stack: startA },
        { id: 'b', seat: 1, stack: startB },
      ],
      buttonSeat: index % 2,
      smallBlind: 10,
      bigBlind: 20,
      random,
      now: 0,
    });

    let guard = 0;
    while (state.street !== Street.Complete && guard < 100) {
      guard += 1;
      const actingId = state.actingPlayerId;
      if (!actingId) break;

      const policy = actingId === 'a' ? a : b;
      const view = buildBotView(state, actingId);
      const decision = clampDecision(view, policy(view, { random, opponents: new Map() }));

      try {
        applyAction(state, { playerId: actingId, ...decision }, guard * 10);
      } catch {
        break;
      }
    }

    const finalA = state.players.find((player) => player.id === 'a')?.stack ?? startA;
    const finalB = state.players.find((player) => player.id === 'b')?.stack ?? startB;

    stacks.set('a', (stacks.get('a') ?? 0) + finalA - startA);
    stacks.set('b', (stacks.get('b') ?? 0) + finalB - startB);
  }

  return (stacks.get('a') ?? 0) - 10_000;
}

test('medium beats easy over many hands', () => {
  const result = match(mediumPolicy, easyPolicy, 400, 2024);
  assert.ok(result > 0, `medium should profit against easy, netted ${result}`);
});

test('hard beats easy over many hands', () => {
  const result = match(hardPolicy, easyPolicy, 200, 2025);
  assert.ok(result > 0, `hard should profit against easy, netted ${result}`);
});

test('easy loses to both stronger tiers', () => {
  const versusMedium = match(easyPolicy, mediumPolicy, 400, 4242);
  const versusHard = match(easyPolicy, hardPolicy, 200, 4243);

  assert.ok(versusMedium < 0, `easy should lose to medium, netted ${versusMedium}`);
  assert.ok(versusHard < 0, `easy should lose to hard, netted ${versusHard}`);
});
