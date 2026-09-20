import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyAction, legalActions, redactForPlayer, startHand } from './hand';
import { ActionType, PlayerStatus, Street, type HandState } from './types';
import { seededRandom } from './test-helpers';

function threeHandedHand(stacks: [number, number, number] = [1000, 1000, 1000]): HandState {
  return startHand({
    handId: 'h1',
    players: [
      { id: 'p1', seat: 0, stack: stacks[0] },
      { id: 'p2', seat: 1, stack: stacks[1] },
      { id: 'p3', seat: 2, stack: stacks[2] },
    ],
    buttonSeat: 0,
    smallBlind: 10,
    bigBlind: 20,
    random: seededRandom(42),
    now: 0,
  });
}

/**
 * Chips in play.
 *
 * While a hand runs, committed chips have left the stacks, so both halves
 * count. Once it finishes, winnings are already back in the stacks while
 * `totalCommitted` still records what was wagered — counting it again would
 * double it. The street tells us which case we are in.
 */
function totalChips(state: HandState): number {
  const inStacks = state.players.reduce((sum, player) => sum + player.stack, 0);
  if (state.street === Street.Complete) return inStacks;
  const inPot = state.players.reduce((sum, player) => sum + player.totalCommitted, 0);
  return inStacks + inPot;
}

test('deals two hole cards to each player', () => {
  const state = threeHandedHand();
  for (const player of state.players) {
    assert.equal(player.holeCards.length, 2);
  }

  // 52 minus 6 dealt.
  assert.equal(state.deck.length, 46);
});

test('posts blinds and starts action left of the big blind', () => {
  const state = threeHandedHand();

  const p2 = state.players.find((p) => p.id === 'p2');
  const p3 = state.players.find((p) => p.id === 'p3');

  assert.equal(p2?.totalCommitted, 10, 'small blind');
  assert.equal(p3?.totalCommitted, 20, 'big blind');
  assert.equal(state.currentBet, 20);

  // Three-handed, the button acts first preflop.
  assert.equal(state.actingPlayerId, 'p1');
});

test('heads-up: the button posts the small blind and acts first preflop', () => {
  const state = startHand({
    handId: 'hu',
    players: [
      { id: 'btn', seat: 0, stack: 1000 },
      { id: 'bb', seat: 1, stack: 1000 },
    ],
    buttonSeat: 0,
    smallBlind: 10,
    bigBlind: 20,
    random: seededRandom(7),
    now: 0,
  });

  const button = state.players.find((p) => p.id === 'btn');
  const bigBlind = state.players.find((p) => p.id === 'bb');

  assert.equal(button?.totalCommitted, 10, 'button posts the small blind heads-up');
  assert.equal(bigBlind?.totalCommitted, 20);
  assert.equal(state.actingPlayerId, 'btn');
});

test('rejects an action from a player out of turn', () => {
  const state = threeHandedHand();
  assert.throws(
    () => applyAction(state, { playerId: 'p2', type: ActionType.Fold, amount: 0 }, 100),
    /not p2's turn/,
  );
});

test('rejects a check when facing a bet', () => {
  const state = threeHandedHand();
  assert.throws(
    () => applyAction(state, { playerId: 'p1', type: ActionType.Check, amount: 0 }, 100),
    /Cannot check facing a bet/,
  );
});

test('enforces the minimum raise', () => {
  const state = threeHandedHand();
  // Current bet 20, last raise 20, so the minimum raise total is 40.
  assert.throws(
    () => applyAction(state, { playerId: 'p1', type: ActionType.Raise, amount: 30 }, 100),
    /Minimum raise is 40/,
  );
});

test('rejects committing more than the stack holds', () => {
  const state = threeHandedHand([100, 1000, 1000]);
  assert.throws(
    () => applyAction(state, { playerId: 'p1', type: ActionType.Raise, amount: 500 }, 100),
    /stack allows 100/,
  );
});

test('the big blind gets an option to raise after calls', () => {
  const state = threeHandedHand();

  applyAction(state, { playerId: 'p1', type: ActionType.Call, amount: 0 }, 100);
  applyAction(state, { playerId: 'p2', type: ActionType.Call, amount: 0 }, 200);

  // Everyone has matched 20, but the big blind has not acted yet.
  assert.equal(state.street, Street.Preflop, 'street must not advance before the option');
  assert.equal(state.actingPlayerId, 'p3', 'big blind still has the option');

  const options = legalActions(state, 'p3').map((option) => option.type);
  assert.ok(options.includes(ActionType.Check));
  assert.ok(options.includes(ActionType.Raise));
});

test('advances to the flop once the big blind checks', () => {
  const state = threeHandedHand();

  applyAction(state, { playerId: 'p1', type: ActionType.Call, amount: 0 }, 100);
  applyAction(state, { playerId: 'p2', type: ActionType.Call, amount: 0 }, 200);
  applyAction(state, { playerId: 'p3', type: ActionType.Check, amount: 0 }, 300);

  assert.equal(state.street, Street.Flop);
  assert.equal(state.board.length, 3);
  // Commitments reset for the new street.
  assert.ok(state.players.every((player) => player.committed === 0));
});

test('awards the pot uncontested when everyone folds', () => {
  const state = threeHandedHand();
  const startingChips = totalChips(state);

  applyAction(state, { playerId: 'p1', type: ActionType.Fold, amount: 0 }, 100);
  applyAction(state, { playerId: 'p2', type: ActionType.Fold, amount: 0 }, 200);

  assert.equal(state.street, Street.Complete);
  assert.equal(state.results?.length, 1);
  assert.equal(state.results?.[0]?.playerId, 'p3');
  assert.equal(state.results?.[0]?.amount, 30, 'blinds only');
  assert.equal(state.results?.[0]?.cards, null, 'no showdown means no cards shown');

  assert.equal(totalChips(state), startingChips, 'chips are conserved');
});

test('runs the board out when everyone is all in', () => {
  const state = threeHandedHand([200, 200, 200]);
  const startingChips = totalChips(state);

  applyAction(state, { playerId: 'p1', type: ActionType.Raise, amount: 200 }, 100);
  applyAction(state, { playerId: 'p2', type: ActionType.Call, amount: 0 }, 200);
  applyAction(state, { playerId: 'p3', type: ActionType.Call, amount: 0 }, 300);

  assert.equal(state.street, Street.Complete);
  assert.equal(state.board.length, 5, 'the full board must be dealt');
  assert.ok((state.results?.length ?? 0) >= 1);
  assert.equal(totalChips(state), startingChips, 'chips are conserved');
});

test('a short stack all in creates a side pot the short stack cannot win', () => {
  // p1 can only cover 50 while the others have full stacks.
  const state = threeHandedHand([50, 1000, 1000]);
  const startingChips = totalChips(state);

  applyAction(state, { playerId: 'p1', type: ActionType.Raise, amount: 50 }, 100);
  applyAction(state, { playerId: 'p2', type: ActionType.Raise, amount: 300 }, 200);
  applyAction(state, { playerId: 'p3', type: ActionType.Call, amount: 0 }, 300);

  const p1 = state.players.find((player) => player.id === 'p1');
  assert.equal(p1?.status, PlayerStatus.AllIn);

  // Play it out.
  while (state.street !== Street.Complete) {
    const actingId = state.actingPlayerId;
    if (!actingId) break;
    applyAction(state, { playerId: actingId, type: ActionType.Check, amount: 0 }, 400);
  }

  assert.equal(state.street, Street.Complete);
  assert.ok(state.pots.length >= 2, 'a side pot must exist');

  const sidePot = state.pots[1];
  assert.ok(sidePot);
  assert.ok(!sidePot.eligiblePlayerIds.includes('p1'), 'short stack cannot win the side pot');

  assert.equal(totalChips(state), startingChips, 'chips are conserved');
});

test('redaction removes other players hole cards and the deck', () => {
  const state = threeHandedHand();
  const view = redactForPlayer(state, 'p1');

  assert.equal(view.deck.length, 0, 'the deck reveals the rest of the shuffle');

  const self = view.players.find((player) => player.id === 'p1');
  assert.equal(self?.holeCards.length, 2, 'the viewer sees their own cards');

  for (const player of view.players) {
    if (player.id === 'p1') continue;
    assert.equal(player.holeCards.length, 0, `${player.id} cards must be hidden`);
  }
});

test('redaction reveals cards at a contested showdown', () => {
  const state = threeHandedHand([200, 200, 200]);

  applyAction(state, { playerId: 'p1', type: ActionType.Raise, amount: 200 }, 100);
  applyAction(state, { playerId: 'p2', type: ActionType.Call, amount: 0 }, 200);
  applyAction(state, { playerId: 'p3', type: ActionType.Call, amount: 0 }, 300);

  assert.equal(state.street, Street.Complete);

  const view = redactForPlayer(state, 'p1');
  const others = view.players.filter((player) => player.id !== 'p1');
  assert.ok(
    others.every((player) => player.holeCards.length === 2),
    'showdown reveals live players cards',
  );
});

test('records every action for replay', () => {
  const state = threeHandedHand();

  applyAction(state, { playerId: 'p1', type: ActionType.Call, amount: 0 }, 100);
  applyAction(state, { playerId: 'p2', type: ActionType.Fold, amount: 0 }, 250);

  const blinds = state.actions.filter((action) => action.type === ActionType.PostBlind);
  assert.equal(blinds.length, 2);

  const call = state.actions.find((action) => action.type === ActionType.Call);
  assert.equal(call?.playerId, 'p1');
  assert.equal(call?.amount, 20);
  assert.equal(call?.street, Street.Preflop);
  assert.equal(call?.at, 100, 'timestamps are relative to the hand start');
});
