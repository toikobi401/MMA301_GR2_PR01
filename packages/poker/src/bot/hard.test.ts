import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BotView } from '../bot-view';
import type { Card } from '../cards';
import { seededRandom } from '../test-helpers';
import { ActionType, PlayerStatus, Street, type LegalAction } from '../types';
import { hardPolicy } from './hard';

function view(overrides: Partial<BotView> = {}): BotView {
  const base: BotView = {
    handId: 'h1',
    street: Street.Flop,
    board: ['2c', '7d', 'Ts'] as Card[],
    holeCards: ['As', 'Ad'] as Card[],
    self: { id: 'bot', seat: 0, stack: 1000, committed: 0, totalCommitted: 20 },
    players: [
      {
        id: 'bot',
        seat: 0,
        stack: 1000,
        committed: 0,
        totalCommitted: 20,
        status: PlayerStatus.Active,
      },
      {
        id: 'opp',
        seat: 1,
        stack: 1000,
        committed: 0,
        totalCommitted: 20,
        status: PlayerStatus.Active,
      },
    ],
    buttonSeat: 0,
    currentBet: 0,
    lastRaiseSize: 20,
    smallBlind: 10,
    bigBlind: 20,
    potTotal: 40,
    toCall: 0,
    legalActions: [
      { type: ActionType.Fold },
      { type: ActionType.Check },
      { type: ActionType.Bet, min: 20, max: 1000 },
    ] as LegalAction[],
    actions: [],
    activeCount: 2,
    liveCount: 2,
  };
  return { ...base, ...overrides };
}

const ctx = () => ({ random: seededRandom(5), opponents: new Map() });

test('hard bets a monster', () => {
  // Set over a dry board: a hand that should always be value bet.
  const decision = hardPolicy(
    view({ holeCards: ['Ts', 'Th'] as Card[], board: ['Tc', '7d', '2s'] as Card[] }),
    ctx(),
  );

  assert.equal(decision.type, ActionType.Bet);
  assert.ok(decision.amount >= 20, 'sizing must meet the minimum');
});

test('hard folds a hopeless hand facing a large bet', () => {
  const decision = hardPolicy(
    view({
      holeCards: ['3c', '4d'] as Card[],
      board: ['As', 'Kh', 'Qd'] as Card[],
      currentBet: 400,
      toCall: 400,
      potTotal: 440,
      legalActions: [
        { type: ActionType.Fold },
        { type: ActionType.Call, min: 400 },
      ] as LegalAction[],
    }),
    ctx(),
  );

  assert.equal(decision.type, ActionType.Fold);
});

test('hard calls when the price beats its equity', () => {
  // A flush draw getting a very cheap price.
  const decision = hardPolicy(
    view({
      holeCards: ['9s', '8s'] as Card[],
      board: ['As', '5s', '2d'] as Card[],
      currentBet: 20,
      toCall: 20,
      potTotal: 500,
      legalActions: [
        { type: ActionType.Fold },
        { type: ActionType.Call, min: 20 },
      ] as LegalAction[],
    }),
    ctx(),
  );

  assert.notEqual(decision.type, ActionType.Fold, 'a cheap draw is a call');
});

test('hard bluffs sometimes, but not often', () => {
  const weak = view({
    holeCards: ['3c', '2d'] as Card[],
    board: ['As', 'Kh', 'Qd'] as Card[],
  });

  const random = seededRandom(21);
  let bets = 0;
  const rounds = 200;

  for (let i = 0; i < rounds; i += 1) {
    const decision = hardPolicy(weak, { random, opponents: new Map() });
    if (decision.type === ActionType.Bet) bets += 1;
  }

  const rate = bets / rounds;
  assert.ok(rate > 0.02, `expected some bluffing, saw ${rate}`);
  assert.ok(rate < 0.45, `expected restraint, saw ${rate}`);
});

test('hard never bluffs when it must pay to continue', () => {
  const facingBet = view({
    holeCards: ['3c', '2d'] as Card[],
    board: ['As', 'Kh', 'Qd'] as Card[],
    currentBet: 200,
    toCall: 200,
    potTotal: 240,
    legalActions: [
      { type: ActionType.Fold },
      { type: ActionType.Call, min: 200 },
      { type: ActionType.Raise, min: 400, max: 1000 },
    ] as LegalAction[],
  });

  const random = seededRandom(33);
  for (let i = 0; i < 100; i += 1) {
    const decision = hardPolicy(facingBet, { random, opponents: new Map() });
    assert.notEqual(decision.type, ActionType.Raise, 'bluff-raised a dead hand');
  }
});

test('hard handles preflop, where evaluateHand cannot be used directly', () => {
  const preflop = view({
    street: Street.Preflop,
    board: [],
    holeCards: ['As', 'Ks'] as Card[],
    currentBet: 20,
    toCall: 20,
    potTotal: 30,
    legalActions: [
      { type: ActionType.Fold },
      { type: ActionType.Call, min: 20 },
      { type: ActionType.Raise, min: 40, max: 1000 },
    ] as LegalAction[],
  });

  // Must not throw: the runout completes the board before evaluating.
  const decision = hardPolicy(preflop, ctx());
  assert.notEqual(decision.type, ActionType.Fold, 'ace-king suited is not a fold');
});
