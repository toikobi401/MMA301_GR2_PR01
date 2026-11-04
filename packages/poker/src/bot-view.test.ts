import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBotView, BotViewError } from './bot-view';
import type { Card } from './cards';
import { applyAction, startHand } from './hand';
import { ActionType, type HandState } from './types';
import { seededRandom } from './test-helpers';

function threeHandedHand(): HandState {
  return startHand({
    handId: 'h1',
    players: [
      { id: 'bot', seat: 0, stack: 1000 },
      { id: 'p2', seat: 1, stack: 1000 },
      { id: 'p3', seat: 2, stack: 1000 },
    ],
    buttonSeat: 0,
    smallBlind: 10,
    bigBlind: 20,
    random: seededRandom(99),
    now: 0,
  });
}

/**
 * These are the security tests. A leak here means a bot plays with perfect
 * information and simply looks lucky, which is the hardest kind of bug to
 * notice from the outside.
 */

test('the view never contains an opponent card or a deck card', () => {
  const state = threeHandedHand();
  const view = buildBotView(state, 'bot');

  // Serialise and scan. Checking named fields only catches leaks through
  // fields someone thought to check; scanning catches the ones they did not.
  const serialised = JSON.stringify(view);

  const forbidden: Card[] = [
    ...(state.players.find((p) => p.id === 'p2')?.holeCards ?? []),
    ...(state.players.find((p) => p.id === 'p3')?.holeCards ?? []),
    ...state.deck,
  ];

  const ownCards = new Set(state.players.find((p) => p.id === 'bot')?.holeCards ?? []);

  for (const card of forbidden) {
    // A card the bot legitimately holds may coincide with nothing here, but
    // guard anyway: only assert on cards the bot does not own.
    if (ownCards.has(card)) continue;
    assert.ok(
      !serialised.includes(`"${card}"`),
      `card ${card} leaked into the bot view`,
    );
  }
});

test('the bot sees exactly its own two cards', () => {
  const state = threeHandedHand();
  const view = buildBotView(state, 'bot');
  const own = state.players.find((p) => p.id === 'bot')?.holeCards ?? [];

  assert.equal(view.holeCards.length, 2);
  assert.deepEqual([...view.holeCards], own);
});

test('no player entry carries a holeCards key at all', () => {
  const state = threeHandedHand();
  const view = buildBotView(state, 'bot');

  for (const player of view.players) {
    // Not "is empty" — absent. An empty array would let a policy read it and
    // appear to work, hiding a later regression that stopped redacting.
    assert.ok(
      !('holeCards' in player),
      `${player.id} exposes a holeCards key`,
    );
  }
});

test('the view carries no deck field', () => {
  const state = threeHandedHand();
  const view = buildBotView(state, 'bot');
  assert.ok(!('deck' in view), 'the view exposes the remaining deck');
});

test('mutating the view cannot corrupt the live hand', () => {
  const state = threeHandedHand();
  const view = buildBotView(state, 'bot');

  const boardBefore = [...state.board];
  const actionsBefore = state.actions.length;

  // Cast away readonly the way a buggy policy might.
  (view.board as Card[]).push('As');
  (view.actions as unknown[]).push({});

  assert.deepEqual(state.board, boardBefore, 'board was aliased, not copied');
  assert.equal(state.actions.length, actionsBefore, 'actions were aliased');
});

test('legal actions are populated only on the bot turn', () => {
  const state = threeHandedHand();

  // Three-handed, the button acts first preflop.
  assert.equal(state.actingPlayerId, 'bot');
  assert.ok(buildBotView(state, 'bot').legalActions.length > 0);

  // A player who is not to act sees no options, matching the engine.
  assert.equal(buildBotView(state, 'p2').legalActions.length, 0);
});

test('pot total and to-call reflect the live hand', () => {
  const state = threeHandedHand();
  const view = buildBotView(state, 'bot');

  // Blinds are 10 + 20 and the button has put in nothing yet.
  assert.equal(view.potTotal, 30);
  assert.equal(view.toCall, 20);
});

test('counts distinguish active from live players', () => {
  const state = threeHandedHand();

  applyAction(state, { playerId: 'bot', type: ActionType.Fold, amount: 0 }, 100);

  const view = buildBotView(state, 'p2');
  assert.equal(view.liveCount, 2, 'two players remain in the hand');
  assert.equal(view.activeCount, 2, 'both can still act');
});

test('rejects a player who is not in the hand', () => {
  const state = threeHandedHand();
  assert.throws(() => buildBotView(state, 'nobody'), BotViewError);
});
