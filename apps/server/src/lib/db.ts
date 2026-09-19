import { MongoClient, type Collection, type Db, type Document, type ObjectId } from 'mongodb';
import { config, isProduction } from '../config.js';

/**
 * Single MongoClient for the process. The driver pools connections
 * internally, so one client is the correct shape — creating more would
 * multiply connections rather than share them.
 */
export const mongo = new MongoClient(config.DATABASE_URL, {
  maxPoolSize: isProduction ? 50 : 10,
  minPoolSize: 1,
  serverSelectionTimeoutMS: 10_000,
  retryWrites: true,
});

let connected: Promise<MongoClient> | null = null;

/** Connects once; later calls reuse the same in-flight promise. */
export async function connectDatabase(): Promise<Db> {
  connected ??= mongo.connect();
  await connected;
  return mongo.db();
}

export function db(): Db {
  return mongo.db();
}

// ------------------------------------------------------------- documents

export interface UserDoc extends Document {
  _id: ObjectId;
  email: string;
  passwordHash: string;
  displayName: string;
  role: 'user' | 'admin';
  chips: number;
  createdAt: Date;
  updatedAt?: Date;
}

export interface RefreshTokenDoc extends Document {
  _id: ObjectId;
  userId: ObjectId;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  createdAt: Date;
}

export type ChipTransactionKind =
  | 'deposit'
  | 'withdrawal'
  | 'buy_in'
  | 'cash_out'
  | 'win'
  | 'loss'
  | 'rake'
  | 'bonus';

export interface ChipTransactionDoc extends Document {
  _id: ObjectId;
  userId: ObjectId;
  kind: ChipTransactionKind;
  amount: number;
  balanceAfter: number;
  reference: string | null;
  createdAt: Date;
}

export interface FriendshipDoc extends Document {
  _id: ObjectId;
  requesterId: ObjectId;
  addresseeId: ObjectId;
  status: 'pending' | 'accepted' | 'blocked';
  createdAt: Date;
  updatedAt?: Date;
}

export interface SeatDoc {
  seat: number;
  userId: ObjectId | null;
  /**
   * Denormalised from the user document. Every table broadcast needs it, and
   * looking it up each time would mean a query several times a second during
   * a hand. Names change rarely enough that staleness is not a concern.
   */
  displayName: string | null;
  stack: number;
  sittingOut: boolean;
  joinedAt: Date;
}

export interface PokerTableDoc extends Document {
  _id: ObjectId;
  name: string;
  ownerId: ObjectId | null;
  maxSeats: number;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
  isPrivate: boolean;
  joinCode: string | null;
  status: 'open' | 'in_hand' | 'closed';
  seats: SeatDoc[];
  handNumber: number;
  /** Seat holding the dealer button; advances one occupied seat per hand. */
  buttonSeat: number;
  createdAt: Date;
}

export interface HandPlayerDoc {
  userId: ObjectId;
  displayName: string;
  seat: number;
  holeCards: string[] | null;
  startingStack: number;
  netChips: number;
  handRank: string | null;
}

export interface HandActionDoc {
  sequence: number;
  userId: ObjectId | null;
  street: 'preflop' | 'flop' | 'turn' | 'river';
  action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'post_blind';
  amount: number;
  offsetMs: number;
}

export interface HandDoc extends Document {
  _id: ObjectId;
  tableId: ObjectId;
  handNumber: number;
  buttonSeat: number;
  smallBlind: number;
  bigBlind: number;
  board: string[];
  potTotal: number;
  players: HandPlayerDoc[];
  actions: HandActionDoc[];
  startedAt: Date;
  endedAt: Date | null;
}

export interface ChatMessageDoc extends Document {
  _id: ObjectId;
  tableId: ObjectId;
  userId: ObjectId | null;
  displayName: string;
  body: string;
  createdAt: Date;
}

export interface PlayerStatsDoc extends Document {
  _id: ObjectId;
  userId: ObjectId;
  handsPlayed: number;
  handsWon: number;
  biggestPot: number;
  netChips: number;
  updatedAt: Date;
}

// ----------------------------------------------------------- collections

export const users = (): Collection<UserDoc> => db().collection<UserDoc>('users');
export const refreshTokens = (): Collection<RefreshTokenDoc> =>
  db().collection<RefreshTokenDoc>('refreshTokens');
export const chipTransactions = (): Collection<ChipTransactionDoc> =>
  db().collection<ChipTransactionDoc>('chipTransactions');
export const friendships = (): Collection<FriendshipDoc> =>
  db().collection<FriendshipDoc>('friendships');
export const pokerTables = (): Collection<PokerTableDoc> =>
  db().collection<PokerTableDoc>('pokerTables');
export const hands = (): Collection<HandDoc> => db().collection<HandDoc>('hands');
export const chatMessages = (): Collection<ChatMessageDoc> =>
  db().collection<ChatMessageDoc>('chatMessages');
export const playerStats = (): Collection<PlayerStatsDoc> =>
  db().collection<PlayerStatsDoc>('playerStats');

// -------------------------------------------------------------- lifecycle

export async function pingDatabase(): Promise<boolean> {
  try {
    await db().command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

export async function closeDatabase(): Promise<void> {
  await mongo.close();
}

/** Case-insensitive matching for the unique email index. */
export const EMAIL_COLLATION = { locale: 'en', strength: 2 } as const;

/** Mongo reports a unique-index violation with this code. */
export const DUPLICATE_KEY = 11000;

export function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === DUPLICATE_KEY;
}
