/**
 * Client-side leaderboard mock data.
 *
 * The shared schema (`poker.ts`) stores a generic `score` field.  The client
 * presents three named criteria that map to that score depending on the scope.
 * Extended fields (chips, handsWon, winRate, isCurrentUser) are client-only
 * until the real endpoint ships.
 */
import type { LeaderboardScope } from '@app/shared';

/** The userId we treat as "the current user" for highlight purposes in mock mode. */
export const MOCK_CURRENT_USER_ID = 'mock-user-you';

/** Human-readable criterion descriptor used by the tab bar. */
export type LeaderboardCriterion = LeaderboardScope;

export const leaderboardTabs: {
  id: LeaderboardCriterion;
  label: string;
  shortLabel: string;
  unit: string;
}[] = [
  { id: 'net_chips',   label: 'Chips nhiều nhất',  shortLabel: 'Chips',   unit: '♠' },
  { id: 'hands_won',   label: 'Ván thắng nhiều',   shortLabel: 'Thắng',  unit: 'ván' },
  { id: 'biggest_pot', label: 'Pot lớn nhất giành được', shortLabel: 'Pot lớn', unit: '♠' },
];

/** Extended entry used only on the client (mock mode). */
export type MockLeaderboardEntry = {
  rank: number;
  userId: string;
  displayName: string;
  /** Net chips (used when criterion === 'net_chips'). */
  chips: number;
  /** Hands won (used when criterion === 'hands_won'). */
  handsWon: number;
  /** Biggest single pot won (used when criterion === 'biggest_pot'). */
  biggestPot: number;
  handsPlayed: number;
  /** Win-rate as a fraction in [0,1]; null when handsPlayed === 0. */
  winRate: number | null;
  isCurrentUser: boolean;
};

/** Raw player data (unsorted, unranked). */
const RAW_PLAYERS: Omit<MockLeaderboardEntry, 'rank' | 'isCurrentUser' | 'winRate'>[] = [
  { userId: 'mock-user-you',    displayName: 'Bạn',          chips: 48_200,  handsWon: 134, biggestPot: 18_000,  handsPlayed: 310 },
  { userId: 'mock-user-ace',    displayName: 'AceKing_VN',   chips: 125_000, handsWon: 387, biggestPot: 62_000,  handsPlayed: 610 },
  { userId: 'mock-user-boris',  displayName: 'Boris',        chips: 98_500,  handsWon: 241, biggestPot: 45_000,  handsPlayed: 500 },
  { userId: 'mock-user-cleo',   displayName: 'Cleo',         chips: 84_700,  handsWon: 198, biggestPot: 38_500,  handsPlayed: 320 },
  { userId: 'mock-user-diego',  displayName: 'Diego_Pro',    chips: 76_300,  handsWon: 155, biggestPot: 29_000,  handsPlayed: 280 },
  { userId: 'mock-user-elena',  displayName: 'Elena',        chips: 61_100,  handsWon: 312, biggestPot: 22_000,  handsPlayed: 610 },
  { userId: 'mock-user-felix',  displayName: 'Felix88',      chips: 57_400,  handsWon: 103, biggestPot: 51_000,  handsPlayed: 145 },
  { userId: 'mock-user-greta',  displayName: 'Greta_Bluff',  chips: 44_200,  handsWon: 89,  biggestPot: 33_000,  handsPlayed: 200 },
  { userId: 'mock-user-hugo',   displayName: 'Hugo',         chips: 39_800,  handsWon: 75,  biggestPot: 14_500,  handsPlayed: 190 },
  { userId: 'mock-user-iris',   displayName: 'Iris',         chips: 35_500,  handsWon: 267, biggestPot: 11_000,  handsPlayed: 540 },
  { userId: 'mock-user-jonas',  displayName: 'Jonas',        chips: 29_700,  handsWon: 44,  biggestPot: 9_800,   handsPlayed: 120 },
  { userId: 'mock-user-kira',   displayName: 'KiraRaise',    chips: 22_000,  handsWon: 60,  biggestPot: 7_200,   handsPlayed: 98  },
  { userId: 'mock-user-luca',   displayName: 'Luca_AllIn',   chips: 18_300,  handsWon: 33,  biggestPot: 6_000,   handsPlayed: 88  },
  { userId: 'mock-user-marta',  displayName: 'Marta',        chips: 14_100,  handsWon: 21,  biggestPot: 4_400,   handsPlayed: 75  },
  { userId: 'mock-user-niko',   displayName: 'Nikolai',      chips: 10_500,  handsWon: 15,  biggestPot: 3_200,   handsPlayed: 60  },
];

function buildEntry(
  raw: (typeof RAW_PLAYERS)[number],
  rank: number,
): MockLeaderboardEntry {
  return {
    ...raw,
    rank,
    isCurrentUser: raw.userId === MOCK_CURRENT_USER_ID,
    winRate: raw.handsPlayed > 0 ? raw.handsWon / raw.handsPlayed : null,
  };
}

function sortAndRank(criterion: LeaderboardCriterion): MockLeaderboardEntry[] {
  const sorted = [...RAW_PLAYERS].sort((a, b) => {
    if (criterion === 'net_chips')   return b.chips      - a.chips;
    if (criterion === 'hands_won')   return b.handsWon   - a.handsWon;
    /* biggest_pot */                return b.biggestPot - a.biggestPot;
  });
  return sorted.map((p, i) => buildEntry(p, i + 1));
}

export function getMockLeaderboard(criterion: LeaderboardCriterion): MockLeaderboardEntry[] {
  return sortAndRank(criterion);
}
