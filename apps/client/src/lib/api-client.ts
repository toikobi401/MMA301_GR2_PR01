import type {
  Friend,
  HandDetail,
  HandSummary,
  Leaderboard,
  LeaderboardScope,
  TableState,
  TableSummary,
  Wallet,
} from '@app/shared';
import { api } from './api';
import { mockFriends, mockHands, mockLeaderboard } from './mock-api';

/**
 * Every call a screen makes, in one place.
 *
 * Calls marked LIVE hit the server. Calls marked MOCK return fixtures from
 * `mock-api.ts` because the endpoint does not exist yet — the contract does,
 * so replacing one is a single line here and no screen changes.
 */

// ------------------------------------------------------------------ LIVE

export const walletApi = {
  /** LIVE: GET /api/v1/wallet */
  get: () => api.get<Wallet>('/api/v1/wallet'),

  /** LIVE: POST /api/v1/wallet/deposit */
  deposit: (amount: number) =>
    api.post<{ balance: number }>('/api/v1/wallet/deposit', { amount }),

  /** LIVE: POST /api/v1/wallet/withdraw */
  withdraw: (amount: number) =>
    api.post<{ balance: number }>('/api/v1/wallet/withdraw', { amount }),
};

export const tablesApi = {
  /** LIVE: GET /api/v1/tables */
  list: () => api.get<{ items: TableSummary[] }>('/api/v1/tables'),

  /** LIVE: POST /api/v1/tables */
  create: (body: {
    name: string;
    maxSeats: number;
    smallBlind: number;
    bigBlind: number;
    minBuyIn: number;
    maxBuyIn: number;
    isPrivate: boolean;
  }) => api.post<TableSummary & { joinCode: string | null }>('/api/v1/tables', body),

  /** LIVE: POST /api/v1/tables/:id/join */
  join: (tableId: string, buyIn: number, joinCode?: string) =>
    api.post<TableState>(`/api/v1/tables/${tableId}/join`, { buyIn, joinCode }),

  /** LIVE: POST /api/v1/tables/:id/leave */
  leave: (tableId: string) =>
    api.post<{ left: boolean; refunded: number }>(`/api/v1/tables/${tableId}/leave`),

  /** LIVE: POST /api/v1/tables/:id/deal */
  deal: (tableId: string) => api.post<TableState>(`/api/v1/tables/${tableId}/deal`),

  /** LIVE: POST /api/v1/tables/:id/bots */
  addBot: (tableId: string, seat: number, difficulty: string) =>
    api.post<TableState>(`/api/v1/tables/${tableId}/bots`, { seat, difficulty }),

  /** LIVE: DELETE /api/v1/tables/:id/bots/:seat */
  removeBot: (tableId: string, seat: number) =>
    api.delete<TableState>(`/api/v1/tables/${tableId}/bots/${seat}`),
};

// ------------------------------------------------------------------ MOCK

export const friendsApi = {
  /** MOCK: needs GET /api/v1/friends */
  list: (): Promise<Friend[]> => mockFriends.list(),

  /** MOCK: needs POST /api/v1/friends */
  request: (displayName: string): Promise<Friend> => mockFriends.request(displayName),

  /** MOCK: needs POST /api/v1/friends/:userId/accept */
  accept: (userId: string): Promise<void> => mockFriends.accept(userId),

  /** MOCK: needs DELETE /api/v1/friends/:userId */
  remove: (userId: string): Promise<void> => mockFriends.remove(userId),

  /** MOCK: needs GET /api/v1/users/search?q= */
  search: (query: string) => mockFriends.search(query),
};

export const leaderboardApi = {
  /** MOCK: needs GET /api/v1/leaderboard?scope= */
  fetch: (scope: LeaderboardScope, viewerName: string): Promise<Leaderboard> =>
    mockLeaderboard.fetch(scope, viewerName),
};

export const handsApi = {
  /** MOCK: needs GET /api/v1/hands */
  list: (): Promise<HandSummary[]> => mockHands.list(),

  /** MOCK: needs GET /api/v1/hands/:id */
  detail: (id: string): Promise<HandDetail> => mockHands.detail(id),
};
