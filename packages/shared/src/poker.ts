import { z } from 'zod';

/** A card is two characters: rank then suit, e.g. "As", "Th", "2c". */
export const cardSchema = z.string().regex(/^[23456789TJQKA][cdhs]$/);
export type CardString = z.infer<typeof cardSchema>;

export const streetSchema = z.enum(['preflop', 'flop', 'turn', 'river', 'showdown', 'complete']);
export type Street = z.infer<typeof streetSchema>;

export const actionTypeSchema = z.enum(['fold', 'check', 'call', 'bet', 'raise', 'post_blind']);
export type ActionType = z.infer<typeof actionTypeSchema>;

export const playerStatusSchema = z.enum(['active', 'folded', 'all_in', 'sitting_out']);
export type PlayerStatus = z.infer<typeof playerStatusSchema>;

/**
 * How well a bot plays.
 *
 * easy    — weighted random, ignores its own cards
 * medium  — hand strength against pot odds, never bluffs
 * hard    — Monte Carlo equity, position aware, occasional bluff
 * expert  — hard, plus opponent modelling that shifts its thresholds
 */
export const botDifficultySchema = z.enum(['easy', 'medium', 'hard', 'expert']);
export type BotDifficulty = z.infer<typeof botDifficultySchema>;

// ------------------------------------------------------------------ chips

export const chipTransactionKindSchema = z.enum([
  'deposit',
  'withdrawal',
  'buy_in',
  'cash_out',
  'win',
  'loss',
  'rake',
  'bonus',
  // Chips returned after a payOS payout failed.
  'refund',
]);
export type ChipTransactionKind = z.infer<typeof chipTransactionKindSchema>;

export const chipTransactionSchema = z.object({
  id: z.string(),
  kind: chipTransactionKindSchema,
  amount: z.number().int(),
  balanceAfter: z.number().int().nonnegative(),
  reference: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type ChipTransaction = z.infer<typeof chipTransactionSchema>;

/**
 * Simulated deposit. There is no real money anywhere in this system, so the
 * endpoint simply credits the account. The cap keeps a stuck client from
 * minting an absurd balance.
 */
export const depositBodySchema = z.object({
  amount: z.number().int().min(100).max(100_000),
});
export type DepositBody = z.infer<typeof depositBodySchema>;

export const withdrawBodySchema = z.object({
  amount: z.number().int().min(100).max(1_000_000),
});
export type WithdrawBody = z.infer<typeof withdrawBodySchema>;

export const walletSchema = z.object({
  chips: z.number().int().nonnegative(),
  recentTransactions: z.array(chipTransactionSchema),
});
export type Wallet = z.infer<typeof walletSchema>;

// ---------------------------------------------------------------- friends

export const friendshipStatusSchema = z.enum(['pending', 'accepted', 'blocked']);
export type FriendshipStatus = z.infer<typeof friendshipStatusSchema>;

export const friendSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  status: friendshipStatusSchema,
  /** True when this user sent the request, false when they received it. */
  outgoing: z.boolean(),
  online: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type Friend = z.infer<typeof friendSchema>;

export const friendRequestBodySchema = z.object({
  userId: z.string().min(1),
});
export type FriendRequestBody = z.infer<typeof friendRequestBodySchema>;

/** Someone to add. Carries nothing beyond what a table seat already shows. */
export const userSearchResultSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
});
export type UserSearchResult = z.infer<typeof userSearchResultSchema>;

// ----------------------------------------------------------------- tables

export const tableSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  maxSeats: z.number().int(),
  seatedCount: z.number().int(),
  smallBlind: z.number().int(),
  bigBlind: z.number().int(),
  minBuyIn: z.number().int(),
  maxBuyIn: z.number().int(),
  isPrivate: z.boolean(),
  status: z.enum(['open', 'in_hand', 'closed']),
  /** How many of the seated players are bots. */
  botCount: z.number().int(),
  /** Seat numbers still open, so a player can choose where to sit. */
  freeSeats: z.array(z.number().int()),
  /** Whether the requesting user already holds a seat here. */
  viewerSeated: z.boolean(),
  /**
   * The least this user may sit down with. Above the table minimum when they
   * left recently with a bigger stack, so a win cannot be banked by rejoining.
   */
  viewerMinBuyIn: z.number().int(),
  /** Shown to the table's owner only, so they can pass it on. */
  joinCode: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type TableSummary = z.infer<typeof tableSummarySchema>;

export const createTableBodySchema = z
  .object({
    name: z.string().min(1).max(64),
    maxSeats: z.number().int().min(2).max(9).default(6),
    smallBlind: z.number().int().min(1).max(10_000),
    bigBlind: z.number().int().min(2).max(20_000),
    minBuyIn: z.number().int().min(1),
    maxBuyIn: z.number().int().min(1),
    isPrivate: z.boolean().default(false),
  })
  .refine((body) => body.bigBlind > body.smallBlind, {
    message: 'bigBlind must exceed smallBlind',
    path: ['bigBlind'],
  })
  .refine((body) => body.maxBuyIn >= body.minBuyIn, {
    message: 'maxBuyIn must be at least minBuyIn',
    path: ['maxBuyIn'],
  });
export type CreateTableBody = z.infer<typeof createTableBodySchema>;

export const joinTableBodySchema = z.object({
  seat: z.number().int().min(0).max(8).optional(),
  buyIn: z.number().int().positive(),
  joinCode: z.string().optional(),
});
export type JoinTableBody = z.infer<typeof joinTableBodySchema>;

export const addChipsBodySchema = z.object({
  amount: z.number().int().positive(),
});
export type AddChipsBody = z.infer<typeof addChipsBodySchema>;

export const setSittingOutBodySchema = z.object({
  sittingOut: z.boolean(),
});
export type SetSittingOutBody = z.infer<typeof setSittingOutBodySchema>;

export const setAutoRebuyBodySchema = z.object({
  enabled: z.boolean(),
});
export type SetAutoRebuyBody = z.infer<typeof setAutoRebuyBodySchema>;

export const leaveTableResultSchema = z.object({
  left: z.boolean(),
  refunded: z.number().int(),
  /** Dealt into the running hand: folded now, chips return when it ends. */
  pending: z.boolean(),
});
export type LeaveTableResult = z.infer<typeof leaveTableResultSchema>;

export const addBotBodySchema = z.object({
  /** Omit to take the first free seat. */
  seat: z.number().int().min(0).max(8).optional(),
  difficulty: botDifficultySchema,
  /** Defaults to the table's minimum buy-in. Bots never top up beyond this. */
  buyIn: z.number().int().positive().optional(),
});
export type AddBotBody = z.infer<typeof addBotBodySchema>;

export const closeTableBodySchema = z.object({
  /** Shown to anyone seated when the table shuts. */
  reason: z.string().min(1).max(280).optional(),
});
export type CloseTableBody = z.infer<typeof closeTableBodySchema>;

/** A table as a moderator sees it, with the detail a player does not need. */
export const managedTableSchema = tableSummarySchema.extend({
  ownerName: z.string().nullable(),
  handNumber: z.number().int(),
  autoDeal: z.boolean(),
  autoFillBots: z.boolean(),
  joinCode: z.string().nullable(),
  seatedPlayers: z.array(
    z.object({
      seat: z.number().int(),
      userId: z.string(),
      displayName: z.string(),
      stack: z.number().int(),
      isBot: z.boolean(),
    }),
  ),
});
export type ManagedTable = z.infer<typeof managedTableSchema>;

export const setAutoFillBodySchema = z.object({
  enabled: z.boolean(),
  /** Difficulty used for seats the table fills on its own. */
  difficulty: botDifficultySchema.default('medium'),
});
export type SetAutoFillBody = z.infer<typeof setAutoFillBodySchema>;

// ------------------------------------------------------------- table state

export const seatViewSchema = z.object({
  seat: z.number().int(),
  userId: z.string().nullable(),
  displayName: z.string().nullable(),
  stack: z.number().int(),
  status: playerStatusSchema,
  committed: z.number().int(),
  /**
   * Empty for opponents before showdown. The server removes the cards; it
   * does not rely on the client to hide them.
   */
  holeCards: z.array(cardSchema),
  isActing: z.boolean(),
  /** True when this seat is played by the server rather than a person. */
  isBot: z.boolean(),
  /** Null for human seats. */
  botDifficulty: botDifficultySchema.nullable(),
  /**
   * Banned mid-hand.
   *
   * They keep their seat until the hand ends so the pot they contributed to
   * is not stranded, but every action is refused and the table marks them.
   */
  isBanned: z.boolean(),
  /** Not dealt in: disconnected, or chose to sit out. */
  isAway: z.boolean(),
  /** New to the table: not dealt in until the big blind reaches them. */
  waitingForBigBlind: z.boolean(),
  /** Whether this seat chose to sit out. False for anyone but the viewer. */
  sittingOut: z.boolean(),
  /** Tops up when the stack runs out. False for anyone but the viewer. */
  autoRebuy: z.boolean(),
  /** The viewer's own hand so far, e.g. "Two pair". Null for anyone else. */
  handDescription: z.string().nullable(),
});
export type SeatView = z.infer<typeof seatViewSchema>;

/**
 * One action in the hand being played.
 *
 * Public: it happened in front of everyone at the table, and the same broadcast
 * already moves the chips. Used for seat labels and the live log.
 */
export const liveActionSchema = z.object({
  userId: z.string(),
  type: actionTypeSchema,
  amount: z.number().int(),
  street: streetSchema,
});
export type LiveAction = z.infer<typeof liveActionSchema>;

export const potViewSchema = z.object({
  amount: z.number().int(),
  eligiblePlayerIds: z.array(z.string()),
});
export type PotView = z.infer<typeof potViewSchema>;

export const legalActionSchema = z.object({
  type: actionTypeSchema,
  min: z.number().int().optional(),
  max: z.number().int().optional(),
});
export type LegalActionView = z.infer<typeof legalActionSchema>;

/** Everything one player is allowed to know about the table right now. */
export const tableStateSchema = z.object({
  tableId: z.string(),
  ownerId: z.string().nullable(),
  minBuyIn: z.number().int(),
  maxBuyIn: z.number().int(),
  handId: z.string().nullable(),
  handNumber: z.number().int().nullable(),
  street: streetSchema.nullable(),
  board: z.array(cardSchema),
  buttonSeat: z.number().int().nullable(),
  seats: z.array(seatViewSchema),
  /** Chips already gathered in the middle; bets on this street sit on the seats. */
  pots: z.array(potViewSchema),
  currentBet: z.number().int(),
  liveActions: z.array(liveActionSchema),
  actingPlayerId: z.string().nullable(),
  /** Populated only for the player whose turn it is. */
  legalActions: z.array(legalActionSchema),
  /** Unix milliseconds when the acting player's clock expires. */
  actingDeadline: z.number().int().nullable(),
  /** The acting player's normal clock ran out and they are on their reserve. */
  actingOnTimeBank: z.boolean(),
});
export type TableState = z.infer<typeof tableStateSchema>;

export const playerActionBodySchema = z.object({
  type: actionTypeSchema.exclude(['post_blind']),
  /** Total commitment for the street, not the increment. Bet and raise only. */
  amount: z.number().int().nonnegative().default(0),
});
export type PlayerActionBody = z.infer<typeof playerActionBodySchema>;

// ----------------------------------------------------------- hand history

export const handActionRecordSchema = z.object({
  sequence: z.number().int(),
  userId: z.string().nullable(),
  displayName: z.string().nullable(),
  street: z.enum(['preflop', 'flop', 'turn', 'river']),
  action: actionTypeSchema,
  amount: z.number().int(),
  offsetMs: z.number().int(),
});
export type HandActionRecord = z.infer<typeof handActionRecordSchema>;

export const handPlayerRecordSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  seat: z.number().int(),
  holeCards: z.array(cardSchema).nullable(),
  startingStack: z.number().int(),
  netChips: z.number().int(),
  handRank: z.string().nullable(),
});
export type HandPlayerRecord = z.infer<typeof handPlayerRecordSchema>;

export const handSummarySchema = z.object({
  id: z.string(),
  tableId: z.string(),
  tableName: z.string(),
  handNumber: z.number().int(),
  board: z.array(cardSchema),
  potTotal: z.number().int(),
  /** The signed result for the requesting user. */
  netChips: z.number().int(),
  startedAt: z.iso.datetime(),
});
export type HandSummary = z.infer<typeof handSummarySchema>;

export const handDetailSchema = handSummarySchema.extend({
  players: z.array(handPlayerRecordSchema),
  actions: z.array(handActionRecordSchema),
});
export type HandDetail = z.infer<typeof handDetailSchema>;

// ------------------------------------------------- public table history

/**
 * One player's part in a finished hand, as everyone at the table may see it.
 *
 * This is deliberately narrower than `handPlayerRecordSchema`, which is the
 * private view: it carries only what the player themselves revealed. Someone
 * who folded shows no cards, because they never showed them.
 */
export const tableHandPlayerSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  seat: z.number().int(),
  /**
   * Populated only when the hand went to a contested showdown and this player
   * was still in it. Null for anyone who folded or mucked.
   */
  revealedCards: z.array(cardSchema).nullable(),
  handRank: z.string().nullable(),
  /** Signed result. Public because the stacks moved in front of everyone. */
  netChips: z.number().int(),
  /** True when this player took the pot, or a share of it. */
  won: z.boolean(),
});
export type TableHandPlayer = z.infer<typeof tableHandPlayerSchema>;

/**
 * A finished hand at a table, readable by anyone seated there.
 *
 * The point is that betting is public information: everyone watched the
 * actions happen, so making them reviewable afterwards levels the table
 * between someone taking notes and someone who is not. Cards stay private
 * unless they were actually shown.
 *
 * Written once, when a hand ends with a winner. There is no partial record of
 * a hand in progress — that would leak the shape of live betting to someone
 * who had already folded.
 */
export const tableHandSchema = z.object({
  id: z.string(),
  handNumber: z.number().int(),
  board: z.array(cardSchema),
  potTotal: z.number().int(),
  buttonSeat: z.number().int(),
  players: z.array(tableHandPlayerSchema),
  actions: z.array(handActionRecordSchema),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
});
export type TableHand = z.infer<typeof tableHandSchema>;

// ---------------------------------------------------------------- chat

export const chatMessageSchema = z.object({
  id: z.string(),
  tableId: z.string(),
  userId: z.string().nullable(),
  displayName: z.string(),
  body: z.string().min(1).max(500),
  createdAt: z.iso.datetime(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const sendChatBodySchema = z.object({
  body: z.string().min(1).max(500),
});
export type SendChatBody = z.infer<typeof sendChatBodySchema>;

// --------------------------------------------------------- leaderboard

export const leaderboardScopeSchema = z.enum(['net_chips', 'hands_won', 'biggest_pot']);
export type LeaderboardScope = z.infer<typeof leaderboardScopeSchema>;

export const leaderboardEntrySchema = z.object({
  rank: z.number().int().positive(),
  userId: z.string(),
  displayName: z.string(),
  score: z.number().int(),
  handsPlayed: z.number().int(),
  handsWon: z.number().int(),
});
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;

export const leaderboardSchema = z.object({
  scope: leaderboardScopeSchema,
  entries: z.array(leaderboardEntrySchema),
  /** The requesting user's own rank, even when outside the top entries. */
  viewerRank: leaderboardEntrySchema.nullable(),
  updatedAt: z.iso.datetime(),
});
export type Leaderboard = z.infer<typeof leaderboardSchema>;
