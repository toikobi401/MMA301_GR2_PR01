import { ObjectId } from 'mongodb';
import {
  ActionType,
  applyAction,
  InvalidActionError,
  legalActions,
  PlayerStatus,
  startHand,
  Street,
  type HandState,
} from '@app/poker';
import { ACTION_TIMEOUT_SECONDS, type BotDifficulty, type TableState } from '@app/shared';
import { hands, pokerTables, playerStats, users, type PokerTableDoc } from '../lib/db.js';
import { AppError } from '../lib/errors.js';
import { secureRandom } from './random.js';

/**
 * Reads a hand's street without the narrowing TypeScript applies after an
 * earlier comparison. `applyAction` mutates the hand in place, so the narrowed
 * type from the guard above is stale by the time it is checked again.
 */
function streetOf(hand: HandState): string {
  return hand.street;
}

/** Pause between hands, long enough for clients to show the showdown. */
const NEXT_HAND_DELAY_MS = 4000;

/**
 * One live table.
 *
 * The authoritative hand state lives here in memory, not in the database. A
 * hand is short and every action mutates it, so writing each step to Mongo
 * would add latency to the one path that must feel instant. The finished hand
 * is persisted once, which is also all the history screens need.
 *
 * Restarting the server abandons hands in progress. That is an accepted
 * trade-off for a project of this size; the alternative is snapshotting state
 * on every action.
 */
export class Table {
  readonly id: string;
  private doc: PokerTableDoc;
  private hand: HandState | null = null;
  private sequence = 0;
  private actionTimer: NodeJS.Timeout | null = null;
  private actingDeadline: number | null = null;
  private nextHandTimer: NodeJS.Timeout | null = null;

  /**
   * Called when a bot seat is on the clock.
   *
   * A single hook, not a subscriber list: there is one bot driver per
   * process, and a list would invite a second one to act on the same turn.
   */
  onBotTurn: ((table: Table, botId: string, difficulty: BotDifficulty) => void) | null =
    null;

  /**
   * Everything that wants to know when the table changes.
   *
   * A single callback would work until a second observer arrived: the bot
   * driver assigning it would silently delete the socket broadcast, and the
   * table would keep playing while nobody saw it.
   */
  private readonly listeners = new Set<() => void>();

  constructor(doc: PokerTableDoc) {
    this.id = doc._id.toHexString();
    this.doc = doc;
  }

  get currentHand(): HandState | null {
    return this.hand;
  }

  get seq(): number {
    return this.sequence;
  }

  get table(): PokerTableDoc {
    return this.doc;
  }

  /** Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notifies every observer.
   *
   * Iterates a copy because a listener may call `act` synchronously, which
   * re-enters this method — mutating the set mid-iteration would be undefined
   * behaviour. Each listener is isolated so a failing socket broadcast cannot
   * stop the bot driver from being told, or the other way round.
   */
  private emitChange(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        console.error('Table listener failed', error);
      }
    }
  }

  /** Seats occupied by a player with chips behind. */
  private seatedPlayers() {
    return this.doc.seats.filter((seat) => seat.userId !== null && seat.stack > 0);
  }

  /**
   * Starts a hand if one is not running and enough players are seated.
   * Returns true when a hand actually started.
   */
  startHandIfReady(): boolean {
    if (this.hand && this.hand.street !== Street.Complete) return false;

    const seated = this.seatedPlayers();
    if (seated.length < 2) return false;

    // Move the button one occupied seat clockwise from the last hand.
    const seatNumbers = seated.map((seat) => seat.seat).sort((a, b) => a - b);
    const nextButton =
      seatNumbers.find((seat) => seat > this.doc.buttonSeat) ?? seatNumbers[0] ?? 0;

    this.doc.buttonSeat = nextButton;
    this.doc.handNumber += 1;

    this.hand = startHand({
      handId: new ObjectId().toHexString(),
      players: seated.map((seat) => ({
        id: seat.userId?.toHexString() ?? '',
        seat: seat.seat,
        stack: seat.stack,
      })),
      buttonSeat: nextButton,
      smallBlind: this.doc.smallBlind,
      bigBlind: this.doc.bigBlind,
      random: secureRandom,
    });

    this.doc.status = 'in_hand';
    this.sequence += 1;
    this.armActionTimer();
    this.emitChange();
    return true;
  }

  /** Applies one player action, then advances or finishes the hand. */
  act(userId: string, type: string, amount: number): void {
    if (!this.hand || this.hand.street === Street.Complete) {
      throw AppError.badRequest('No hand in progress');
    }
    if (this.hand.actingPlayerId !== userId) {
      throw AppError.badRequest('It is not your turn');
    }

    try {
      applyAction(this.hand, {
        playerId: userId,
        type: type as (typeof ActionType)[keyof typeof ActionType],
        amount,
      });
    } catch (error) {
      if (error instanceof InvalidActionError) {
        throw AppError.badRequest(error.message);
      }
      throw error;
    }

    this.sequence += 1;

    if (streetOf(this.hand) === Street.Complete) {
      void this.finishHand();
    } else {
      this.armActionTimer();
    }

    this.emitChange();
  }

  /**
   * Starts the clock for whoever is to act.
   *
   * Without this one disconnected player freezes the table for everyone else,
   * which is the single most common way an online poker game becomes
   * unplayable. On expiry the server checks if that is free, otherwise folds.
   */
  private armActionTimer(): void {
    this.clearActionTimer();
    const actingId = this.hand?.actingPlayerId;
    if (!actingId) return;

    this.actingDeadline = Date.now() + ACTION_TIMEOUT_SECONDS * 1000;
    this.actionTimer = setTimeout(() => {
      const actingId = this.hand?.actingPlayerId;
      if (!actingId) return;

      const options = legalActions(this.hand!, actingId).map((option) => option.type);
      const fallback = options.includes(ActionType.Check) ? ActionType.Check : ActionType.Fold;

      try {
        this.act(actingId, fallback, 0);
      } catch {
        // The hand moved on between the timer firing and this callback.
      }
    }, ACTION_TIMEOUT_SECONDS * 1000);

    // Do not hold the process open for a pending poker clock.
    this.actionTimer.unref?.();

    // Hand the turn to the bot driver if this seat is played by the server.
    // This is the only place that fires exactly once per new actor, which is
    // why the hook lives here rather than on a change listener — those fire
    // on every state change and would need deduplication to avoid double
    // acting.
    const difficulty = this.botDifficultyFor(actingId);
    if (difficulty && this.onBotTurn) {
      this.onBotTurn(this, actingId, difficulty);
    }
  }

  /** The difficulty of the bot in this seat, or null for a human. */
  botDifficultyFor(userId: string): BotDifficulty | null {
    const seat = this.doc.seats.find((entry) => entry.userId?.toHexString() === userId);
    return seat?.botProfile?.difficulty ?? null;
  }

  private clearActionTimer(): void {
    if (this.actionTimer) clearTimeout(this.actionTimer);
    this.actionTimer = null;
    this.actingDeadline = null;
  }

  /** Writes the finished hand, settles stacks, and updates stats. */
  private async finishHand(): Promise<void> {
    this.clearActionTimer();
    const hand = this.hand;
    if (!hand || !hand.results) return;

    // Carry the final stacks back to the seats so the next hand starts right.
    for (const player of hand.players) {
      const seat = this.doc.seats.find((entry) => entry.userId?.toHexString() === player.id);
      if (seat) seat.stack = player.stack;
    }

    this.doc.status = 'open';

    const potTotal = hand.pots.reduce((sum, pot) => sum + pot.amount, 0);
    const wonBy = new Map<string, number>();
    for (const result of hand.results) {
      wonBy.set(result.playerId, (wonBy.get(result.playerId) ?? 0) + result.amount);
    }

    const names = await this.displayNames(hand.players.map((player) => player.id));

    try {
      await hands().insertOne({
        _id: new ObjectId(hand.handId),
        tableId: this.doc._id,
        handNumber: this.doc.handNumber,
        buttonSeat: hand.buttonSeat,
        smallBlind: hand.smallBlind,
        bigBlind: hand.bigBlind,
        board: hand.board,
        potTotal,
        players: hand.players.map((player) => {
          const won = wonBy.get(player.id) ?? 0;
          const result = hand.results?.find((entry) => entry.playerId === player.id);
          return {
            userId: new ObjectId(player.id),
            displayName: names.get(player.id) ?? 'Unknown',
            seat: player.seat,
            // Cards are recorded only when they were shown at a contested
            // showdown; a mucked hand stays private in the history too.
            holeCards: result?.cards ? player.holeCards : null,
            startingStack: player.stack + player.totalCommitted - won,
            netChips: won - player.totalCommitted,
            handRank: result?.handDescription ?? null,
          };
        }),
        actions: hand.actions.map((action, index) => ({
          sequence: index,
          userId: new ObjectId(action.playerId),
          street: action.street as 'preflop' | 'flop' | 'turn' | 'river',
          action: action.type,
          amount: action.amount,
          offsetMs: action.at,
        })),
        startedAt: new Date(hand.startedAt),
        endedAt: new Date(),
      });

      await this.persistStacks();
      await this.updateStats(hand, wonBy, potTotal);
    } catch (error) {
      // A persistence failure must not wedge the table — the next hand can
      // still be dealt, we just lose this one from the history.
      console.error('Failed to persist hand', error);
    }

    this.sequence += 1;
    this.emitChange();
    this.scheduleNextHand();
  }

  /**
   * Deals the next hand on a delay, when the table is set to run itself.
   *
   * Nothing previously started a new hand: only a join or an explicit deal
   * did. A table of bots would therefore play exactly one hand and sit idle
   * forever. Off by default, so a table of humans keeps deciding for itself.
   *
   * The delay gives clients time to show the showdown before cards vanish.
   */
  private scheduleNextHand(): void {
    if (this.nextHandTimer) clearTimeout(this.nextHandTimer);
    if (!this.doc.autoDeal) return;

    this.nextHandTimer = setTimeout(() => {
      this.nextHandTimer = null;
      this.startHandIfReady();
    }, NEXT_HAND_DELAY_MS);

    this.nextHandTimer.unref?.();
  }

  private async displayNames(userIds: string[]): Promise<Map<string, string>> {
    const docs = await users()
      .find(
        { _id: { $in: userIds.map((id) => new ObjectId(id)) } },
        { projection: { displayName: 1 } },
      )
      .toArray();

    return new Map(docs.map((doc) => [doc._id.toHexString(), doc.displayName]));
  }

  private async persistStacks(): Promise<void> {
    await pokerTables().updateOne(
      { _id: this.doc._id },
      {
        $set: {
          seats: this.doc.seats,
          status: this.doc.status,
          handNumber: this.doc.handNumber,
          buttonSeat: this.doc.buttonSeat,
        },
      },
    );
  }

  /**
   * Updates the leaderboard figures.
   *
   * Bots are skipped: they do not draw from a wallet, so their net chips are
   * not comparable with a human's, and a leaderboard topped by the house
   * tells a player nothing.
   */
  private async updateStats(
    hand: HandState,
    wonBy: Map<string, number>,
    potTotal: number,
  ): Promise<void> {
    const botSeats = new Set(
      this.doc.seats
        .filter((seat) => seat.botProfile != null && seat.userId !== null)
        .map((seat) => seat.userId?.toHexString()),
    );

    const humans = hand.players.filter((player) => !botSeats.has(player.id));

    await Promise.all(
      humans.map((player) => {
        const won = wonBy.get(player.id) ?? 0;
        return playerStats().updateOne(
          { userId: new ObjectId(player.id) },
          {
            $inc: {
              handsPlayed: 1,
              handsWon: won > 0 ? 1 : 0,
              netChips: won - player.totalCommitted,
            },
            $max: { biggestPot: won > 0 ? potTotal : 0 },
            $set: { updatedAt: new Date() },
          },
          { upsert: true },
        );
      }),
    );
  }

  /**
   * The table as one player may see it.
   *
   * Other players' hole cards are removed here, on the server. The client is
   * never sent cards it should not have and asked to hide them — a player
   * reading the socket traffic would see everything.
   */
  viewFor(viewerId: string | null): TableState {
    const hand = this.hand;
    const showdown =
      hand?.street === Street.Complete && (hand.results?.some((r) => r.cards) ?? false);

    const seats = this.doc.seats.map((seat) => {
      const userId = seat.userId?.toHexString() ?? null;
      const player = hand?.players.find((entry) => entry.id === userId);
      const isSelf = userId !== null && userId === viewerId;

      const reveal =
        isSelf || (showdown && player !== undefined && player.status !== PlayerStatus.Folded);

      return {
        seat: seat.seat,
        userId,
        displayName: seat.displayName ?? null,
        stack: player?.stack ?? seat.stack,
        status: (player?.status ?? (seat.userId ? 'sitting_out' : 'sitting_out')) as
          | 'active'
          | 'folded'
          | 'all_in'
          | 'sitting_out',
        committed: player?.committed ?? 0,
        holeCards: reveal ? [...(player?.holeCards ?? [])] : [],
        isActing: hand?.actingPlayerId === userId,
        isBot: seat.botProfile !== null && seat.botProfile !== undefined,
        botDifficulty: seat.botProfile?.difficulty ?? null,
      };
    });

    return {
      tableId: this.id,
      handId: hand?.handId ?? null,
      handNumber: hand ? this.doc.handNumber : null,
      street: hand?.street ?? null,
      board: hand?.board ?? [],
      buttonSeat: hand?.buttonSeat ?? null,
      seats,
      pots: hand?.pots.map((pot) => ({
        amount: pot.amount,
        eligiblePlayerIds: pot.eligiblePlayerIds,
      })) ?? [],
      currentBet: hand?.currentBet ?? 0,
      actingPlayerId: hand?.actingPlayerId ?? null,
      legalActions:
        viewerId && hand?.actingPlayerId === viewerId
          ? legalActions(hand, viewerId).map((option) => ({
              type: option.type,
              min: option.min,
              max: option.max,
            }))
          : [],
      actingDeadline: this.actingDeadline,
    };
  }

  dispose(): void {
    this.clearActionTimer();
    if (this.nextHandTimer) clearTimeout(this.nextHandTimer);
    this.nextHandTimer = null;
    this.onBotTurn = null;
    this.listeners.clear();
  }
}
