import type { LeaderboardEntry, LeaderboardScope } from '@app/shared';

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

/** A row as the leaderboard screen draws it. */
export type LeaderboardRowEntry = {
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

/** `score` is whichever figure the scope ranks by. */
export function toRow(entry: LeaderboardEntry, viewerId: string | undefined): LeaderboardRowEntry {
  return {
    rank: entry.rank,
    userId: entry.userId,
    displayName: entry.displayName,
    chips: entry.score,
    handsWon: entry.handsWon,
    biggestPot: entry.score,
    handsPlayed: entry.handsPlayed,
    winRate: entry.handsPlayed > 0 ? entry.handsWon / entry.handsPlayed : null,
    isCurrentUser: entry.userId === viewerId,
  };
}
