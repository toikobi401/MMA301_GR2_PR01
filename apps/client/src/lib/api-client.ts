import type {
  BotDifficulty,
  ChatMessage,
  CreateDepositBody,
  CreateDepositResult,
  CreateTableBody,
  CreateWithdrawalBody,
  Friend,
  HandDetail,
  HandSummary,
  Leaderboard,
  LeaderboardScope,
  LeaveTableResult,
  Payment,
  PaymentConfig,
  PaymentResult,
  TableHand,
  TableState,
  TableSummary,
  UserSearchResult,
  Wallet,
} from '@app/shared';
import { api } from './api';

/** Every call a screen makes, in one place. */

// ------------------------------------------------------------------ LIVE

export const walletApi = {
  /** LIVE: GET /api/v1/wallet */
  get: () => api.get<Wallet>('/api/v1/wallet'),

  /** LIVE: GET /api/v1/wallet/transactions */
  transactions: (limit = 20, cursor?: string) =>
    api.get<{ items: Wallet['recentTransactions']; nextCursor: string | null }>(
      '/api/v1/wallet/transactions',
      { query: { limit, cursor } },
    ),

  /** LIVE: POST /api/v1/wallet/deposit */
  deposit: (amount: number) =>
    api.post<{ balance: number }>('/api/v1/wallet/deposit', { amount }),

  /** LIVE: POST /api/v1/wallet/withdraw — simulated; closed once payOS payouts are configured */
  withdraw: (amount: number) =>
    api.post<{ balance: number }>('/api/v1/wallet/withdraw', { amount }),
};

export const paymentsApi = {
  /** LIVE: GET /api/v1/payments/config */
  config: () => api.get<PaymentConfig>('/api/v1/payments/config'),

  /** LIVE: GET /api/v1/payments */
  list: (limit = 10) =>
    api.get<{ items: Payment[] }>('/api/v1/payments', { query: { limit } }),

  /** LIVE: POST /api/v1/payments/payos/deposits */
  createDeposit: (body: CreateDepositBody) =>
    api.post<CreateDepositResult>('/api/v1/payments/payos/deposits', body),

  /** LIVE: POST /api/v1/payments/payos/deposits/:orderCode/cancel */
  cancelDeposit: (orderCode: number) =>
    api.post<PaymentResult>(`/api/v1/payments/payos/deposits/${orderCode}/cancel`),

  /** LIVE: POST /api/v1/payments/payos/withdrawals */
  createWithdrawal: (body: CreateWithdrawalBody) =>
    api.post<PaymentResult>('/api/v1/payments/payos/withdrawals', body),

  /** LIVE: GET /api/v1/payments/payos/:orderCode — also settles it if payOS says it is done */
  get: (orderCode: number) => api.get<PaymentResult>(`/api/v1/payments/payos/${orderCode}`),
};

export const tablesApi = {
  /** LIVE: GET /api/v1/tables */
  list: () => api.get<{ items: TableSummary[] }>('/api/v1/tables'),

  /** LIVE: POST /api/v1/tables — moderators only */
  create: (body: CreateTableBody) => api.post<TableSummary>('/api/v1/tables', body),

  /** LIVE: GET /api/v1/tables/code/:code */
  findByCode: (code: string) =>
    api.get<TableSummary>(`/api/v1/tables/code/${encodeURIComponent(code.trim())}`),

  /** LIVE: POST /api/v1/tables/:id/join */
  join: (tableId: string, buyIn: number, options?: { seat?: number; joinCode?: string }) =>
    api.post<TableState>(`/api/v1/tables/${tableId}/join`, { buyIn, ...options }),

  /** LIVE: POST /api/v1/tables/:id/leave */
  leave: (tableId: string) =>
    api.post<LeaveTableResult>(`/api/v1/tables/${tableId}/leave`),

  /** LIVE: POST /api/v1/tables/:id/add-chips */
  addChips: (tableId: string, amount: number) =>
    api.post<TableState>(`/api/v1/tables/${tableId}/add-chips`, { amount }),

  /** LIVE: PUT /api/v1/tables/:id/sitting-out */
  setSittingOut: (tableId: string, sittingOut: boolean) =>
    api.request<TableState>(`/api/v1/tables/${tableId}/sitting-out`, {
      method: 'PUT',
      body: { sittingOut },
    }),

  /** LIVE: PUT /api/v1/tables/:id/auto-rebuy */
  setAutoRebuy: (tableId: string, enabled: boolean) =>
    api.request<TableState>(`/api/v1/tables/${tableId}/auto-rebuy`, {
      method: 'PUT',
      body: { enabled },
    }),

  /** LIVE: GET /api/v1/tables/:id/chat */
  chat: (tableId: string) =>
    api.get<{ items: ChatMessage[] }>(`/api/v1/tables/${tableId}/chat`),

  /** LIVE: POST /api/v1/tables/:id/bots */
  addBot: (tableId: string, seat: number, difficulty: BotDifficulty) =>
    api.post<TableState>(`/api/v1/tables/${tableId}/bots`, { seat, difficulty }),

  /** LIVE: DELETE /api/v1/tables/:id/bots/:seat */
  removeBot: (tableId: string, seat: number) =>
    api.delete<TableState>(`/api/v1/tables/${tableId}/bots/${seat}`),

  /**
   * LIVE: GET /api/v1/tables/:id/hands
   *
   * The table's public log. Readable only by people seated there, so it
   * levels one table rather than exposing how everyone plays everywhere.
   */
  hands: (tableId: string, limit = 25) =>
    api.get<{ items: TableHand[]; nextCursor: string | null }>(
      `/api/v1/tables/${tableId}/hands`,
      { query: { limit } },
    ),
};

export const friendsApi = {
  /** LIVE: GET /api/v1/friends */
  list: () => api.get<{ items: Friend[] }>('/api/v1/friends'),

  /** LIVE: POST /api/v1/friends */
  request: (userId: string) => api.post<Friend>('/api/v1/friends', { userId }),

  /** LIVE: POST /api/v1/friends/:userId/accept */
  accept: (userId: string) =>
    api.post<{ accepted: boolean }>(`/api/v1/friends/${userId}/accept`),

  /** LIVE: DELETE /api/v1/friends/:userId */
  remove: (userId: string) => api.delete<{ removed: boolean }>(`/api/v1/friends/${userId}`),

  /** LIVE: GET /api/v1/users/search */
  search: (query: string) =>
    api.get<{ items: UserSearchResult[] }>('/api/v1/users/search', { query: { q: query } }),
};

export const leaderboardApi = {
  /** LIVE: GET /api/v1/leaderboard */
  get: (scope: LeaderboardScope) =>
    api.get<Leaderboard>('/api/v1/leaderboard', { query: { scope } }),
};

export const handsApi = {
  /** LIVE: GET /api/v1/hands */
  list: () => api.get<{ items: HandSummary[]; nextCursor: string | null }>('/api/v1/hands'),

  /** LIVE: GET /api/v1/hands/:id */
  detail: (id: string) => api.get<HandDetail>(`/api/v1/hands/${id}`),
};
