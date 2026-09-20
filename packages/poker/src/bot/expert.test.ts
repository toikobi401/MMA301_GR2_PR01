import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BotView } from '../bot-view';
import type { Card } from '../cards';
import { seededRandom } from '../test-helpers';
import { ActionType, PlayerStatus, Street, type LegalAction } from '../types';
import { adjustmentsFor, expertPolicy } from './expert';
import { hardPolicy } from './hard';
import type { OpponentProfile } from './types';

function view(overrides: Partial<BotView> = {}): BotView {
  const base: BotView = {
    handId: 'h1',
    street: Street.Flop,
    board: ['2c', '7d', 'Ts'] as Card[],
    holeCards: ['Ah', 'Kh'] as Card[],
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

function profile(overrides: Partial<OpponentProfile> = {}): OpponentProfile {
  return {
    handsObserved: 50,
    vpip: 0.3,
    pfr: 0.15,
    aggressionFactor: 1.5,
    foldToBet: 0.4,
    ...overrides,
  };
}

test('expert plays exactly like hard when it has no reads', () => {
  // The defining property: the adjustment layer must be a no-op without
  // data, so any divergence is a bug in the layer rather than a design
  // difference.
  const situations = [
    view(),
    view({ holeCards: ['7c', '2d'] as Card[] }),
    view({
      currentBet: 200,
      toCall: 200,
      potTotal: 240,
      legalActions: [
        { type: ActionType.Fold },
        { type: ActionType.Call, min: 200 },
        { type: ActionType.Raise, min: 400, max: 1000 },
      ] as LegalAction[],
    }),
  ];

  for (const situation of situations) {
    const fromHard = hardPolicy(situation, {
      random: seededRandom(4),
      opponents: new Map(),
    });
    const fromExpert = expertPolicy(situation, {
      random: seededRandom(4),
      opponents: new Map(),
    });
    assert.deepEqual(fromExpert, fromHard);
  }
});

test('a read below the minimum sample size is ignored', () => {
  // Fourteen hands of data is noise, and acting on it is worse than acting on
  // nothing.
  const thin = new Map([['opp', profile({ handsObserved: 14, vpip: 0.9 })]]);
  assert.deepEqual(adjustmentsFor(view(), { random: seededRandom(1), opponents: thin }), {});

  const enough = new Map([['opp', profile({ handsObserved: 15, vpip: 0.9 })]]);
  const adjusted = adjustmentsFor(view(), { random: seededRandom(1), opponents: enough });
  assert.notDeepEqual(adjusted, {}, 'fifteen hands should be enough to act on');
});

test('a tight opponent who is betting shrinks the equity estimate', () => {
  // The simulation deals opponents random cards, so it overestimates the
  // bot's equity against someone who only plays strong hands.
  const tight = new Map([['opp', profile({ vpip: 0.12 })]]);

  const withAggression = adjustmentsFor(
    view({
      actions: [
        { playerId: 'opp', type: ActionType.Bet, amount: 100, street: Street.Flop, at: 10 },
      ],
    }),
    { random: seededRandom(1), opponents: tight },
  );

  assert.ok(
    (withAggression.equityShift ?? 0) < 0,
    'a tight player betting should make the bot more cautious',
  );
});

test('a loose opponent makes the bot call wider', () => {
  const loose = new Map([['opp', profile({ vpip: 0.7 })]]);
  const adjusted = adjustmentsFor(view(), { random: seededRandom(1), opponents: loose });

  assert.ok((adjusted.callShift ?? 0) < 0, 'call threshold should drop');
  assert.ok((adjusted.raiseShift ?? 0) < 0, 'value bets should get thinner');
});

test('a player who folds too much invites more bluffing', () => {
  const folder = new Map([['opp', profile({ foldToBet: 0.7 })]]);
  const adjusted = adjustmentsFor(view(), { random: seededRandom(1), opponents: folder });

  assert.ok((adjusted.bluffChance ?? 0) > 0.18, 'should bluff more than the default');
});

test('a station kills the bluffing and grows the value bets', () => {
  const station = new Map([['opp', profile({ foldToBet: 0.1 })]]);
  const adjusted = adjustmentsFor(view(), { random: seededRandom(1), opponents: station });

  assert.ok((adjusted.bluffChance ?? 1) < 0.05, 'bluffing a station is lighting money on fire');
  assert.ok((adjusted.valueBetFraction ?? 0) >= 0.9, 'bet bigger against someone who calls');
});

test('reads about other tables or other players do not apply', () => {
  const stranger = new Map([['someone-else', profile({ vpip: 0.9 })]]);
  assert.deepEqual(
    adjustmentsFor(view(), { random: seededRandom(1), opponents: stranger }),
    {},
  );
});
