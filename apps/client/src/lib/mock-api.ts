import type {
  Friend,
  HandDetail,
  HandSummary,
  Leaderboard,
  LeaderboardScope,
} from '@app/shared';

/**
 * Stand-ins for endpoints the server does not expose yet.
 *
 * Everything here returns data shaped by the real contracts in
 * `packages/shared`, so swapping a mock for the live call is a one-line change
 * in `src/lib/api-client.ts` and nothing downstream moves.
 *
 * WHAT IS STILL MISSING ON THE SERVER — each of these has a contract already:
 *
 *   GET    /api/v1/friends                  list friends and pending requests
 *   POST   /api/v1/friends                  send a request      (friendRequestBodySchema)
 *   POST   /api/v1/friends/:userId/accept   accept a request
 *   DELETE /api/v1/friends/:userId          remove or decline
 *   GET    /api/v1/users/search?q=          find people to add
 *   GET    /api/v1/hands                    the viewer's hand history
 *   GET    /api/v1/hands/:id                one hand, with every action
 *   GET    /api/v1/leaderboard?scope=       ranking, bots excluded
 *   GET    /api/v1/tables/:id/chat          recent messages for a table
 *
 * Chat *sending* already works over the socket; only the backlog is mocked.
 */

/** Deterministic pseudo-random so the mock data does not jump between renders. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

const NAMES = [
  'Ada',
  'Boris',
  'Cleo',
  'Diego',
  'Elena',
  'Felix',
  'Greta',
  'Hugo',
  'Iris',
  'Jonas',
  'Kira',
  'Luca',
  'Marta',
  'Nikolai',
];

/** Simulates a round trip so loading states are visible while developing. */
async function delay<T>(value: T, ms = 320): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, ms));
  return value;
}

// ---------------------------------------------------------------- friends

// MOCK: replace with GET /api/v1/friends
let friends: Friend[] = [
  {
    userId: 'mock-friend-1',
    displayName: 'Boris',
    status: 'accepted',
    outgoing: true,
    online: true,
    createdAt: isoDaysAgo(12),
  },
  {
    userId: 'mock-friend-2',
    displayName: 'Cleo',
    status: 'accepted',
    outgoing: false,
    online: false,
    createdAt: isoDaysAgo(30),
  },
  {
    userId: 'mock-friend-3',
    displayName: 'Iris',
    status: 'pending',
    outgoing: false,
    online: true,
    createdAt: isoDaysAgo(1),
  },
  {
    userId: 'mock-friend-4',
    displayName: 'Jonas',
    status: 'pending',
    outgoing: true,
    online: false,
    createdAt: isoDaysAgo(2),
  },
];

export const mockFriends = {
  async list(): Promise<Friend[]> {
    return delay([...friends]);
  },

  // MOCK: replace with POST /api/v1/friends
  async request(displayName: string): Promise<Friend> {
    const friend: Friend = {
      userId: `mock-friend-${Date.now()}`,
      displayName,
      status: 'pending',
      outgoing: true,
      online: false,
      createdAt: new Date().toISOString(),
    };
    friends = [...friends, friend];
    return delay(friend);
  },

  // MOCK: replace with POST /api/v1/friends/:userId/accept
  async accept(userId: string): Promise<void> {
    friends = friends.map((friend) =>
      friend.userId === userId ? { ...friend, status: 'accepted' as const } : friend,
    );
    await delay(null, 200);
  },

  // MOCK: replace with DELETE /api/v1/friends/:userId
  async remove(userId: string): Promise<void> {
    friends = friends.filter((friend) => friend.userId !== userId);
    await delay(null, 200);
  },

  // MOCK: replace with GET /api/v1/users/search?q=
  async search(query: string): Promise<Array<{ userId: string; displayName: string }>> {
    const term = query.trim().toLowerCase();
    if (term.length < 2) return delay([], 120);

    const known = new Set(friends.map((friend) => friend.displayName.toLowerCase()));
    const matches = NAMES.filter(
      (name) => name.toLowerCase().includes(term) && !known.has(name.toLowerCase()),
    ).map((name) => ({ userId: `mock-user-${name.toLowerCase()}`, displayName: name }));

    return delay(matches);
  },
};

// ------------------------------------------------------------- leaderboard

// MOCK: replace with GET /api/v1/leaderboard?scope=
export const mockLeaderboard = {
  async fetch(scope: LeaderboardScope, viewerName: string): Promise<Leaderboard> {
    const random = seeded(scope.length * 7919);

    const entries = NAMES.slice(0, 10)
      .map((displayName, index) => ({
        rank: 0,
        userId: `mock-user-${index}`,
        displayName,
        score:
          scope === 'net_chips'
            ? Math.round((random() - 0.35) * 40_000)
            : scope === 'hands_won'
              ? Math.round(random() * 400)
              : Math.round(random() * 25_000),
        handsPlayed: 120 + Math.round(random() * 900),
      }))
      .sort((a, b) => b.score - a.score)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));

    return delay({
      scope,
      entries,
      // The viewer sits outside the top ten, which is the case the layout has
      // to handle and the one a short mock list would otherwise hide.
      viewerRank: {
        rank: 24,
        userId: 'viewer',
        displayName: viewerName,
        score: scope === 'net_chips' ? 1450 : scope === 'hands_won' ? 37 : 3200,
        handsPlayed: 82,
      },
      updatedAt: new Date().toISOString(),
    });
  },
};

// ------------------------------------------------------------ hand history

function mockHand(index: number): HandSummary {
  const random = seeded(index * 104_729);
  const boards = [
    ['As', 'Kd', '7c', '2h', '9s'],
    ['Qh', 'Jh', 'Th', '3c', '8d'],
    ['5s', '5d', '9c', 'Kh', '2c'],
    ['7c', '8d', '9h', 'Tc', 'Js'],
  ];

  return {
    id: `mock-hand-${index}`,
    tableId: 'mock-table-1',
    tableName: index % 3 === 0 ? "Friday night" : 'Practice table',
    handNumber: 420 - index,
    board: (boards[index % boards.length] ?? []) as HandSummary['board'],
    potTotal: 200 + Math.round(random() * 3000),
    netChips: Math.round((random() - 0.45) * 1800),
    startedAt: isoDaysAgo(index * 0.3),
  };
}

// MOCK: replace with GET /api/v1/hands
export const mockHands = {
  async list(): Promise<HandSummary[]> {
    return delay(Array.from({ length: 14 }, (_, index) => mockHand(index)));
  },

  // MOCK: replace with GET /api/v1/hands/:id
  async detail(id: string): Promise<HandDetail> {
    const index = Number(id.replace('mock-hand-', '')) || 0;
    const summary = mockHand(index);

    return delay({
      ...summary,
      players: [
        {
          userId: 'viewer',
          displayName: 'You',
          seat: 0,
          holeCards: ['As', 'Kh'] as HandDetail['players'][number]['holeCards'],
          startingStack: 1000,
          netChips: summary.netChips,
          handRank: summary.netChips > 0 ? 'Two pair' : 'High card',
        },
        {
          userId: 'mock-user-1',
          displayName: 'Boris',
          seat: 1,
          holeCards: ['Qd', 'Qc'] as HandDetail['players'][number]['holeCards'],
          startingStack: 1000,
          netChips: -summary.netChips,
          handRank: summary.netChips > 0 ? 'Pair' : 'Three of a kind',
        },
      ],
      actions: [
        { sequence: 0, userId: 'viewer', displayName: 'You', street: 'preflop', action: 'post_blind', amount: 10, offsetMs: 0 },
        { sequence: 1, userId: 'mock-user-1', displayName: 'Boris', street: 'preflop', action: 'post_blind', amount: 20, offsetMs: 0 },
        { sequence: 2, userId: 'viewer', displayName: 'You', street: 'preflop', action: 'raise', amount: 60, offsetMs: 2400 },
        { sequence: 3, userId: 'mock-user-1', displayName: 'Boris', street: 'preflop', action: 'call', amount: 40, offsetMs: 5100 },
        { sequence: 4, userId: 'mock-user-1', displayName: 'Boris', street: 'flop', action: 'check', amount: 0, offsetMs: 8300 },
        { sequence: 5, userId: 'viewer', displayName: 'You', street: 'flop', action: 'bet', amount: 80, offsetMs: 11_200 },
        { sequence: 6, userId: 'mock-user-1', displayName: 'Boris', street: 'flop', action: 'call', amount: 80, offsetMs: 14_000 },
        { sequence: 7, userId: 'mock-user-1', displayName: 'Boris', street: 'turn', action: 'check', amount: 0, offsetMs: 17_500 },
        { sequence: 8, userId: 'viewer', displayName: 'You', street: 'turn', action: 'check', amount: 0, offsetMs: 19_100 },
        { sequence: 9, userId: 'mock-user-1', displayName: 'Boris', street: 'river', action: 'bet', amount: 200, offsetMs: 23_400 },
        { sequence: 10, userId: 'viewer', displayName: 'You', street: 'river', action: 'call', amount: 200, offsetMs: 28_800 },
      ],
    });
  },
};
