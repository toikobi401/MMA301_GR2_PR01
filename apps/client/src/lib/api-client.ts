import type {
  BotDifficulty,
  CreateTableBody,
  TableHand,
  TableState,
  TableSummary,
  Wallet,
} from '@app/shared';
import { api } from './api';

/**
 * Every call a screen makes, in one place.
 *
 * The table and wallet screens use live server endpoints.
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

  /** LIVE: POST /api/v1/tables — moderators only */
  create: (body: CreateTableBody) => api.post<TableSummary>('/api/v1/tables', body),

  /** LIVE: POST /api/v1/tables/:id/join */
  join: (tableId: string, buyIn: number, joinCode?: string) =>
    api.post<TableState>(`/api/v1/tables/${tableId}/join`, { buyIn, joinCode }),

  /** LIVE: POST /api/v1/tables/:id/leave */
  leave: (tableId: string) =>
    api.post<{ left: boolean; refunded: number }>(`/api/v1/tables/${tableId}/leave`),

  /** LIVE: POST /api/v1/tables/:id/deal */
  deal: (tableId: string) => api.post<TableState>(`/api/v1/tables/${tableId}/deal`),

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
