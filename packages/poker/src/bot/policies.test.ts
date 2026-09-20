import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BotView } from '../bot-view';
import type { Card } from '../cards';
import { seededRandom } from '../test-helpers';
import { ActionType, PlayerStatus, Street, type LegalAction } from '../types';
import { easyPolicy } from './easy';
import { mediumPolicy } from './medium';
import { betSize, clampDecision, preflopStrength } from './strength';
import type { BotContext } from './types';

const ctx: BotContext = { random: seededRandom(1), opponents: new Map() };

/**
 * Builds a view directly rather than running a hand. `BotView` is a plain
 * interface for exactly this reason: a tier can be tested against an exact
 * situation without arranging a deck that produces it.
 */
function view(overrides: Partial<BotView> = {}): BotView {
  const base: BotView = {
    handId: 'h1',
    street: Street.Preflop,
    board: [],
    holeCards: ['As', 'Ad'] as Card[],
    self: { id: 'bot', seat: 0, stack: 1000, committed: 0, totalCommitted: 0 },
    players: [
      {
        id: 'bot',
        seat: 0,
        stack: 1000,
        committed: 0,
        totalCommitted: 0,
        status: PlayerStatus.Active,
      },
      {
        id: 'opp',
        seat: 1,
        stack: 1000,
        committed: 20,
        totalCommitted: 20,
        status: PlayerStatus.Active,
      },
    ],
    buttonSeat: 0,
    currentBet: 20,
    lastRaiseSize: 20,
    smallBlind: 10,
    bigBlind: 20,
    potTotal: 30,
    toCall: 20,
    legalActions: [
      { type: ActionType.Fold },
      { type: ActionType.Call, min: 20 },
      { type: ActionType.Raise, min: 40, max: 1000 },
    ] as LegalAction[],
    actions: [],
    activeCount: 2,
    liveCount: 2,
  };
  return { ...base, ...overrides };
}

// ------------------------------------------------------------------ Chen

test('preflop strength orders hands the way poker does', () => {
  const aces = preflopStrength(['As', 'Ad'] as Card[]);
  const kings = preflopStrength(['Ks', 'Kd'] as Card[]);
  const akSuited = preflopStrength(['As', 'Ks'] as Card[]);
  const seventyTwo = preflopStrength(['7c', '2d'] as Card[]);

  assert.ok(aces > kings, 'aces beat kings');
  assert.ok(kings > akSuited, 'kings beat ace-king suited');
  assert.ok(akSuited > seventyTwo, 'anything beats seven-deuce');
  assert.ok(seventyTwo >= 0 && aces <= 1, 'stays inside [0, 1]');
});

test('suited beats offsuit for the same ranks', () => {
  assert.ok(
    preflopStrength(['As', 'Ks'] as Card[]) > preflopStrength(['As', 'Kd'] as Card[]),
  );
});

// ------------------------------------------------------------------ easy

test('easy never folds when checking is free', () => {
  const free = view({
    toCall: 0,
    currentBet: 0,
    legalActions: [
      { type: ActionType.Fold },
      { type: ActionType.Check },
      { type: ActionType.Bet, min: 20, max: 1000 },
    ] as LegalAction[],
  });

  const random = seededRandom(7);
  for (let i = 0; i < 2000; i += 1) {
    const decision = easyPolicy(free, { random, opponents: new Map() });
    assert.notEqual(decision.type, ActionType.Fold, 'folded a free check');
  }
});

test('easy ignores its own cards', () => {
  // The same seed against the best and worst starting hands must produce the
  // same action, because this tier does not look at them.
  const aces = view({ holeCards: ['As', 'Ad'] as Card[] });
  const trash = view({ holeCards: ['7c', '2d'] as Card[] });

  const a = easyPolicy(aces, { random: seededRandom(42), opponents: new Map() });
  const b = easyPolicy(trash, { random: seededRandom(42), opponents: new Map() });

  assert.deepEqual(a, b);
});

test('easy produces a mix of actions, not one', () => {
  const random = seededRandom(3);
  const seen = new Set<string>();

  for (let i = 0; i < 500; i += 1) {
    seen.add(easyPolicy(view(), { random, opponents: new Map() }).type);
  }

  assert.ok(seen.size >= 3, `expected variety, saw ${[...seen].join(', ')}`);
});

// ---------------------------------------------------------------- medium

test('medium raises a premium hand preflop', () => {
  const decision = mediumPolicy(view({ holeCards: ['As', 'Ad'] as Card[] }), ctx);
  assert.equal(decision.type, ActionType.Raise);
  assert.ok(decision.amount >= 40, 'raise must meet the minimum');
});

test('medium folds trash facing a large bet', () => {
  const decision = mediumPolicy(
    view({
      holeCards: ['7c', '2d'] as Card[],
      currentBet: 300,
      toCall: 300,
      potTotal: 330,
      legalActions: [
        { type: ActionType.Fold },
        { type: ActionType.Call, min: 300 },
      ] as LegalAction[],
    }),
    ctx,
  );

  assert.equal(decision.type, ActionType.Fold);
});

test('medium calls a cheap price with a hand it would otherwise fold', () => {
  // Pot odds of 20 into 980 is about 2%: almost any hand is worth a call.
  const cheap = view({
    holeCards: ['9c', '4d'] as Card[],
    potTotal: 980,
    toCall: 20,
    currentBet: 20,
    legalActions: [
      { type: ActionType.Fold },
      { type: ActionType.Call, min: 20 },
    ] as LegalAction[],
  });

  assert.equal(mediumPolicy(cheap, ctx).type, ActionType.Call, 'the pot-odds gate');

  // The same hand at a steep price should fold.
  const steep = view({
    holeCards: ['9c', '4d'] as Card[],
    potTotal: 40,
    toCall: 200,
    currentBet: 200,
    legalActions: [
      { type: ActionType.Fold },
      { type: ActionType.Call, min: 200 },
    ] as LegalAction[],
  });

  assert.equal(mediumPolicy(steep, ctx).type, ActionType.Fold);
});

test('medium is deterministic — it never bluffs', () => {
  const situation = view({ holeCards: ['Jh', '9h'] as Card[] });
  const first = mediumPolicy(situation, { random: seededRandom(1), opponents: new Map() });
  const second = mediumPolicy(situation, { random: seededRandom(999), opponents: new Map() });
  assert.deepEqual(first, second, 'different seeds must not change the decision');
});

test('medium takes a free card rather than betting a weak hand', () => {
  const free = view({
    holeCards: ['7c', '2d'] as Card[],
    street: Street.Flop,
    board: ['Kh', 'Qd', '3s'] as Card[],
    toCall: 0,
    currentBet: 0,
    legalActions: [
      { type: ActionType.Fold },
      { type: ActionType.Check },
      { type: ActionType.Bet, min: 20, max: 1000 },
    ] as LegalAction[],
  });

  assert.equal(mediumPolicy(free, ctx).type, ActionType.Check);
});

// ------------------------------------------------------- sizing and safety

test('bet sizing lands inside the legal range', () => {
  for (const fraction of [0.25, 0.5, 0.75, 1, 2]) {
    const amount = betSize(view(), fraction);
    assert.ok(amount >= 40, `${fraction} pot fell below the minimum raise`);
    assert.ok(amount <= 1000, `${fraction} pot exceeded the stack`);
  }
});

test('clamping rescues an out-of-range raise', () => {
  const clamped = clampDecision(view(), { type: ActionType.Raise, amount: 999_999 });
  assert.equal(clamped.type, ActionType.Raise);
  assert.equal(clamped.amount, 1000, 'clamped to the maximum');
});

test('clamping replaces an illegal action with a safe one', () => {
  // Checking is not legal facing a bet.
  const clamped = clampDecision(view(), { type: ActionType.Check, amount: 0 });
  assert.equal(clamped.type, ActionType.Fold, 'no check available, so fold');
});

test('clamping rescues a non-finite amount', () => {
  const clamped = clampDecision(view(), { type: ActionType.Raise, amount: Number.NaN });
  assert.equal(clamped.amount, 40, 'fell back to the minimum');
});
