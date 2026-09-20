import type {
  BanUserBody,
  CreateTableBody,
  Friend,
  HandDetail,
  HandSummary,
  Leaderboard,
  LeaderboardScope,
  ManagedTable,
  ManagedUser,
  TableState,
  TableSummary,
  UserRole,
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

  // Creating a table is a moderator action now — see moderationApi below.

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

export const moderationApi = {
  /** LIVE: GET /api/v1/moderation/tables */
  listTables: () => api.get<{ items: ManagedTable[] }>('/api/v1/moderation/tables'),

  /** LIVE: POST /api/v1/moderation/tables */
  createTable: (body: CreateTableBody) =>
    api.post<ManagedTable>('/api/v1/moderation/tables', body),

  /** LIVE: DELETE /api/v1/moderation/tables/:id */
  closeTable: (tableId: string, reason?: string) =>
    api.request<{ closed: boolean }>(`/api/v1/moderation/tables/${tableId}`, {
      method: 'DELETE',
      // The server reads the reason from the body, not the query string.
      body: reason ? { reason } : undefined,
    }),

  /** LIVE: GET /api/v1/moderation/users */
  listUsers: (query?: string) =>
    api.get<{ items: ManagedUser[] }>('/api/v1/moderation/users', {
      query: query ? { q: query } : undefined,
    }),

  /** LIVE: POST /api/v1/moderation/users/:id/ban */
  ban: (userId: string, body: BanUserBody) =>
    api.post<{ banned: boolean; expiresAt: string | null }>(
      `/api/v1/moderation/users/${userId}/ban`,
      body,
    ),

  /** LIVE: DELETE /api/v1/moderation/users/:id/ban */
  unban: (userId: string) =>
    api.delete<{ banned: boolean }>(`/api/v1/moderation/users/${userId}/ban`),

  /** LIVE: PUT /api/v1/moderation/users/:id/role — admin only */
  setRole: (userId: string, role: UserRole) =>
    api.request<{ role: UserRole }>(`/api/v1/moderation/users/${userId}/role`, {
      method: 'PUT',
      body: { role },
    }),
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
