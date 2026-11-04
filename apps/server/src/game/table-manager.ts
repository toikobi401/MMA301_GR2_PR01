import { ObjectId } from 'mongodb';
import {
  ActionType,
  applyAction,
  buildPots,
  describeHand,
  evaluateHand,
  foldOutOfTurn,
  InvalidActionError,
  legalActions,
  PlayerStatus,
  startHand,
  Street,
  type HandState,
} from '@app/poker';
import {
  ACTION_TIMEOUT_SECONDS,
  RUNOUT_STREET_MS,
  runOutStreets,
  TIME_BANK_SECONDS,
  type BotDifficulty,
  type TableState,
} from '@app/shared';
import { hands, pokerTables, playerStats, users, type PokerTableDoc } from '../lib/db.js';
import { AppError } from '../lib/errors.js';
import { applyChipChange } from '../routes/wallet.js';
import { recordHand } from './opponent-stats.js';
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

/** Pause after a seat changes, so a client opening the table sees the deal. */
const SEAT_CHANGE_DEAL_DELAY_MS = 1500;

/** Clock expiries in a row before a connected but idle player is sat out. */
const MISSED_TURNS_BEFORE_SIT_OUT = 2;

/** Time bank earned per hand dealt, up to the cap. */
const TIME_BANK_PER_HAND_SECONDS = 3;
const TIME_BANK_CAP_SECONDS = 60;

/** How long a player's departing stack sets their minimum to come back. */
const REJOIN_WINDOW_MS = 30 * 60 * 1000;

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
   * Players banned while this hand is running.
   *
   * They keep their seat until the hand ends, because pulling someone out
   * mid-hand would strand the chips they already committed and leave the pot
   * short. Their actions are refused and they are removed at showdown.
   */
  private readonly bannedThisHand = new Set<string>();

  /** Users with a socket watching this table right now. */
  private readonly connected = new Set<string>();

  /**
   * Seated humans who are not here, and so are not dealt in until they return.
   *
   * Tracked apart from `connected` because joining happens over REST before
   * the socket opens: having no socket yet must not cost a player the hand
   * their join just started.
   */
  private readonly away = new Set<string>();

  /** The hand number when each away player left, to tell if they missed one. */
  private readonly awaySinceHand = new Map<string, number>();

  /**
   * Not dealt in until the big blind reaches them.
   *
   * Otherwise sitting down just after your blind, or leaving before it and
   * coming back, plays hands without ever paying for them.
   */
  private readonly waitingForBigBlind = new Set<string>();

  /** Asked to leave during a hand they were dealt into. */
  private readonly leavingAfterHand = new Set<string>();

  /**
   * shortcut: per-process, so a server restart forgets these. Fine for one
   * machine and a demo; move to Mongo if the server ever restarts mid-session.
   */
  private readonly autoRebuy = new Set<string>();
  private readonly recentDepartures = new Map<string, { stack: number; at: number }>();

  private readonly timeBanks = new Map<string, number>();
  private readonly missedTurns = new Map<string, number>();
  private onTimeBank = false;

  /** Board size before the latest action, to spot a board run out at once. */
  private boardBeforeAction = 0;

  /** True while a finished hand is being written; no new hand may start. */
  private finishing = false;

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

  /**
   * Called once when a hand ends with a result.
   *
   * Separate from the change listeners because a finished hand is a discrete
   * event, not another state push: it is the moment the hand becomes part of
   * the table's public record, and the only moment a client needs to refetch
   * that record.
   */
  private readonly handFinishedListeners = new Set<(hand: HandState) => void>();

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

  /** Whether this user holds cards in the hand being played, folded or not. */
  isInCurrentHand(userId: string): boolean {
    return (
      this.hand !== null &&
      this.hand.street !== Street.Complete &&
      this.hand.players.some((player) => player.id === userId)
    );
  }

  /**
   * Gives up the seat, returning the chips to hand back.
   *
   * During a hand they were dealt into, the seat stack is not settled yet, so
   * they are folded now and paid out when it ends. Null means that happened.
   */
  leave(userId: string): number | null {
    const seat = this.doc.seats.find((entry) => entry.userId?.toHexString() === userId);
    if (!seat) throw AppError.badRequest('You are not seated at this table');

    if (this.isInCurrentHand(userId)) {
      this.leavingAfterHand.add(userId);
      this.foldInHand(userId);
      return null;
    }

    const refund = seat.stack;
    this.noteDeparture(userId, refund);
    this.clearSeat(seat);
    this.seatChanged();
    return refund;
  }

  /** The least this user may sit down with right now. */
  minBuyInFor(userId: string): number {
    const departure = this.recentDepartures.get(userId);
    if (!departure || Date.now() - departure.at > REJOIN_WINDOW_MS) return this.doc.minBuyIn;
    return Math.min(this.doc.maxBuyIn, Math.max(this.doc.minBuyIn, departure.stack));
  }

  private noteDeparture(userId: string, stack: number): void {
    this.recentDepartures.set(userId, { stack, at: Date.now() });
  }

  private clearSeat(seat: PokerTableDoc['seats'][number]): void {
    const userId = seat.userId?.toHexString();
    if (userId) {
      this.away.delete(userId);
      this.waitingForBigBlind.delete(userId);
      this.autoRebuy.delete(userId);
    }
    seat.userId = null;
    seat.displayName = null;
    seat.stack = 0;
    seat.sittingOut = false;
    seat.botProfile = null;
  }

  /** Called when a human sits down, before `seatChanged`. */
  seatTaken(userId: string): void {
    this.waitingForBigBlind.add(userId);
  }

  /** Tells watchers a seat changed, and deals if that made a hand possible. */
  seatChanged(): void {
    this.sequence += 1;
    this.emitChange();
    this.scheduleDeal(SEAT_CHANGE_DEAL_DELAY_MS);
  }

  setSittingOut(userId: string, sittingOut: boolean): void {
    const seat = this.doc.seats.find((entry) => entry.userId?.toHexString() === userId);
    if (!seat) throw AppError.badRequest('You are not seated at this table');

    seat.sittingOut = sittingOut;
    this.missedTurns.delete(userId);
    if (sittingOut) this.awaySinceHand.set(userId, this.doc.handNumber);
    else this.waitIfBlindsWereMissed(userId);
    this.seatChanged();
  }

  setAutoRebuy(userId: string, enabled: boolean): void {
    if (enabled) this.autoRebuy.add(userId);
    else this.autoRebuy.delete(userId);

    this.sequence += 1;
    this.emitChange();
  }

  private waitIfBlindsWereMissed(userId: string): void {
    const since = this.awaySinceHand.get(userId);
    this.awaySinceHand.delete(userId);
    if (since !== undefined && this.doc.handNumber > since) this.waitingForBigBlind.add(userId);
  }

  playerConnected(userId: string): void {
    this.connected.add(userId);
    if (this.away.delete(userId)) this.waitIfBlindsWereMissed(userId);
    this.scheduleDeal(SEAT_CHANGE_DEAL_DELAY_MS);
  }

  /** Called when the user's last socket on this table has gone. */
  playerDisconnected(userId: string): void {
    this.connected.delete(userId);

    const seat = this.doc.seats.find((entry) => entry.userId?.toHexString() === userId);
    if (!seat) return;

    this.away.add(userId);
    this.awaySinceHand.set(userId, this.doc.handNumber);

    // A stack is only zero between hands; mid-hand it holds the starting stack.
    // An empty stack that has gone away only blocks the seat from someone else.
    if (seat.stack === 0) {
      const number = seat.seat;
      this.clearSeat(seat);
      this.sequence += 1;
      this.emitChange();
      void this.persistReleasedSeat(number, userId);
    }
  }

  private async persistReleasedSeat(seat: number, userId: string): Promise<void> {
    try {
      await pokerTables().updateOne(
        {
          _id: this.doc._id,
          // Guarded: they may already have sat back down in this seat's place.
          seats: { $elemMatch: { seat, userId: new ObjectId(userId), stack: 0 } },
        },
        {
          $set: {
            'seats.$.userId': null,
            'seats.$.displayName': null,
            'seats.$.sittingOut': false,
          },
        },
      );
    } catch (error) {
      console.error('Failed to release seat', error);
    }
  }

  /** Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Fires once per finished hand. Returns an unsubscribe function. */
  onHandFinished(listener: (hand: HandState) => void): () => void {
    this.handFinishedListeners.add(listener);
    return () => {
      this.handFinishedListeners.delete(listener);
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

  /** Seats occupied by a player with chips behind who is at the table. */
  private seatedPlayers() {
    return this.doc.seats.filter(
      (seat) =>
        seat.userId !== null &&
        seat.stack > 0 &&
        !seat.sittingOut &&
        !this.away.has(seat.userId.toHexString()),
    );
  }

  /**
   * Picks the button and who plays this hand.
   *
   * Established players play. A newcomer plays only if the big blind lands on
   * them, which is the moment they start paying their way. With fewer than two
   * established players there is no game to wait for, so everyone plays.
   */
  private chooseHandPlayers(seated: ReturnType<Table['seatedPlayers']>) {
    const isWaiting = (seat: (typeof seated)[number]) =>
      this.waitingForBigBlind.has(seat.userId?.toHexString() ?? '');
    const ordered = [...seated].sort((a, b) => a.seat - b.seat);
    const established = ordered.filter((seat) => !isWaiting(seat));

    const pool = established.length >= 2 ? established : ordered;

    // Move the button one occupied seat clockwise from the last hand.
    const button =
      pool.find((seat) => seat.seat > this.doc.buttonSeat)?.seat ?? pool[0]?.seat ?? 0;

    if (established.length < 2) {
      this.waitingForBigBlind.clear();
      return { button, players: ordered };
    }

    const start = ordered.findIndex((seat) => seat.seat > button);
    const clockwise = start === -1 ? ordered : [...ordered.slice(start), ...ordered.slice(0, start)];
    const smallBlindAt = clockwise.findIndex((seat) => !isWaiting(seat));
    const bigBlind = clockwise[(smallBlindAt + 1) % clockwise.length];

    if (bigBlind && isWaiting(bigBlind)) {
      this.waitingForBigBlind.delete(bigBlind.userId?.toHexString() ?? '');
      return {
        button,
        players: ordered.filter((seat) => seat === bigBlind || established.includes(seat)),
      };
    }

    return { button, players: established };
  }

  /**
   * Starts a hand if one is not running and enough players are seated.
   * Returns true when a hand actually started.
   */
  startHandIfReady(): boolean {
    if (this.finishing) return false;
    if (this.hand && this.hand.street !== Street.Complete) return false;

    const seated = this.seatedPlayers();
    if (seated.length < 2) return false;

    if (this.nextHandTimer) clearTimeout(this.nextHandTimer);
    this.nextHandTimer = null;

    const { button, players } = this.chooseHandPlayers(seated);

    this.doc.buttonSeat = button;
    this.doc.handNumber += 1;

    for (const seat of players) {
      const id = seat.userId?.toHexString() ?? '';
      const bank = this.timeBanks.get(id) ?? TIME_BANK_SECONDS - TIME_BANK_PER_HAND_SECONDS;
      this.timeBanks.set(id, Math.min(TIME_BANK_CAP_SECONDS, bank + TIME_BANK_PER_HAND_SECONDS));
    }

    this.boardBeforeAction = 0;
    this.hand = startHand({
      handId: new ObjectId().toHexString(),
      players: players.map((seat) => ({
        id: seat.userId?.toHexString() ?? '',
        seat: seat.seat,
        stack: seat.stack,
      })),
      buttonSeat: button,
      smallBlind: this.doc.smallBlind,
      bigBlind: this.doc.bigBlind,
      random: secureRandom,
    });

    this.doc.status = 'in_hand';
    this.sequence += 1;

    // The blinds alone can put everyone all in, finishing the hand on the deal.
    if (streetOf(this.hand) === Street.Complete) {
      void this.finishHand();
    } else {
      this.armActionTimer();
    }

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
    if (this.bannedThisHand.has(userId)) {
      throw AppError.forbidden('Your account is banned');
    }

    this.boardBeforeAction = this.hand.board.length;
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

    this.missedTurns.delete(userId);
    this.sequence += 1;

    if (streetOf(this.hand) === Street.Complete) {
      void this.finishHand();
    } else {
      this.armActionTimer();
    }

    this.emitChange();
  }

  /**
   * Folds a player out of the running hand, whether or not it is their turn.
   *
   * Their committed chips stay in the pot: they were lost fairly, and clawing
   * them back would short everyone else. An all-in player cannot be folded and
   * stays eligible for what they already put in.
   */
  private foldInHand(userId: string): void {
    const hand = this.hand;
    if (!hand || hand.street === Street.Complete) return;

    const wasActing = hand.actingPlayerId === userId;
    this.boardBeforeAction = hand.board.length;

    try {
      foldOutOfTurn(hand, userId);
    } catch (error) {
      if (!(error instanceof InvalidActionError)) throw error;
    }

    this.sequence += 1;
    if (streetOf(hand) === Street.Complete) void this.finishHand();
    else if (wasActing) this.armActionTimer();
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

    this.startClock(ACTION_TIMEOUT_SECONDS);

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

  private startClock(seconds: number): void {
    this.actingDeadline = Date.now() + seconds * 1000;
    this.actionTimer = setTimeout(() => this.clockExpired(), seconds * 1000);

    // Do not hold the process open for a pending poker clock.
    this.actionTimer.unref?.();
  }

  private clockExpired(): void {
    const actingId = this.hand?.actingPlayerId;
    if (!actingId) return;

    const isHuman = !this.botDifficultyFor(actingId);
    const here = this.connected.has(actingId);

    // Someone watching the table gets their reserve before the server decides.
    const bank = this.timeBanks.get(actingId) ?? 0;
    if (isHuman && here && bank > 0 && !this.onTimeBank) {
      this.timeBanks.set(actingId, 0);
      this.onTimeBank = true;
      this.startClock(bank);
      this.sequence += 1;
      this.emitChange();
      return;
    }

    const options = legalActions(this.hand!, actingId).map((option) => option.type);
    const fallback = options.includes(ActionType.Check) ? ActionType.Check : ActionType.Fold;

    if (isHuman && !here) {
      // Covers a seat whose socket never opened, such as after a server
      // restart. Without this they would slow every hand until they bust.
      this.away.add(actingId);
      this.awaySinceHand.set(actingId, this.doc.handNumber);
    }

    const missed = (this.missedTurns.get(actingId) ?? 0) + 1;

    try {
      this.act(actingId, fallback, 0);
    } catch {
      // The hand moved on between the timer firing and this callback.
    }

    // After `act`, which clears the count for a player who chose to act.
    this.missedTurns.set(actingId, missed);
    if (isHuman && here && missed >= MISSED_TURNS_BEFORE_SIT_OUT) {
      this.setSittingOut(actingId, true);
    }
  }

  /**
   * Marks a seated player as banned and folds them out of the current hand.
   *
   * Their committed chips stay in the pot: they lost them fairly before the
   * ban, and clawing them back would short every other player in the hand.
   * The seat is vacated once the hand finishes.
   *
   * Returns true if the player was seated here.
   */
  banSeatedPlayer(userId: string): boolean {
    const seat = this.doc.seats.find((entry) => entry.userId?.toHexString() === userId);
    if (!seat) return false;

    this.bannedThisHand.add(userId);
    this.foldInHand(userId);
    this.emitChange();
    return true;
  }

  /** Whether this seat is banned for the rest of the hand. */
  isSeatBanned(userId: string): boolean {
    return this.bannedThisHand.has(userId);
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
    this.onTimeBank = false;
  }

  /**
   * Pays out players who left during this hand.
   *
   * The seat is cleared only after the credit succeeds. If it fails they stay
   * seated with their chips and can leave again, rather than losing them.
   */
  private async settleDepartures(): Promise<void> {
    for (const userId of [...this.leavingAfterHand]) {
      this.leavingAfterHand.delete(userId);
      const seat = this.doc.seats.find((entry) => entry.userId?.toHexString() === userId);
      if (!seat) continue;

      try {
        if (seat.stack > 0) {
          await applyChipChange(new ObjectId(userId), 'cash_out', seat.stack, `table:${this.id}`);
        }
        this.noteDeparture(userId, seat.stack);
        this.clearSeat(seat);
      } catch (error) {
        console.error('Failed to pay out a departing player', error);
      }
    }
  }

  /** Tops up seats that asked for it; turns the option off if the wallet can't. */
  private async applyAutoRebuys(): Promise<void> {
    for (const seat of this.doc.seats) {
      const userId = seat.userId?.toHexString();
      if (!userId || seat.stack !== 0 || !this.autoRebuy.has(userId)) continue;

      try {
        await applyChipChange(
          new ObjectId(userId),
          'buy_in',
          -this.doc.minBuyIn,
          `table:${this.id}`,
        );
        seat.stack = this.doc.minBuyIn;
      } catch {
        this.autoRebuy.delete(userId);
      }
    }
  }

  /** Writes the finished hand, settles stacks, and updates stats. */
  private async finishHand(): Promise<void> {
    this.clearActionTimer();
    const hand = this.hand;
    if (!hand || !hand.results) return;
    this.finishing = true;

    // Carry the final stacks back to the seats so the next hand starts right.
    for (const player of hand.players) {
      const seat = this.doc.seats.find((entry) => entry.userId?.toHexString() === player.id);
      if (seat) seat.stack = player.stack;
    }

    this.doc.status = 'open';

    // Fold this hand into the opponent reads before anything else, so the
    // expert tier has it for the next hand even if persistence fails.
    recordHand(this.id, hand);

    // Now the hand is over, banned players can leave without stranding a pot.
    // Their chips stay on the table: they were lost fairly before the ban, and
    // clawing them back would short every other player in the hand.
    if (this.bannedThisHand.size > 0) {
      for (const seat of this.doc.seats) {
        const seatUser = seat.userId?.toHexString();
        if (!seatUser || !this.bannedThisHand.has(seatUser)) continue;
        seat.userId = null;
        seat.displayName = null;
        seat.stack = 0;
        seat.botProfile = null;
      }
      this.bannedThisHand.clear();
    }

    for (const seat of this.doc.seats) {
      const seatUser = seat.userId?.toHexString();
      // Bots never top up, so one that has busted would hold the seat forever.
      const gone = seatUser && (this.away.has(seatUser) || seat.botProfile);
      if (gone && seat.stack === 0) this.clearSeat(seat);
    }

    await this.settleDepartures();
    await this.applyAutoRebuys();

    const potTotal = hand.pots.reduce((sum, pot) => sum + pot.amount, 0);
    const wonBy = new Map<string, number>();
    for (const result of hand.results) {
      wonBy.set(result.playerId, (wonBy.get(result.playerId) ?? 0) + result.amount);
    }

    try {
      const names = await this.displayNames(hand.players.map((player) => player.id));

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

    this.finishing = false;
    this.sequence += 1;
    this.emitChange();

    // After persistence, so a client that refetches on this signal finds the
    // hand rather than racing the write.
    for (const listener of [...this.handFinishedListeners]) {
      try {
        listener(hand);
      } catch (error) {
        console.error('Hand-finished listener failed', error);
      }
    }

    const streets = runOutStreets(this.boardBeforeAction, hand.board.length);
    this.scheduleDeal(NEXT_HAND_DELAY_MS + streets * RUNOUT_STREET_MS);
  }

  /**
   * Deals the next hand on a delay.
   *
   * Every table runs itself, as at any poker room: nobody should have to ask
   * for cards. The delay gives clients time to show the showdown first. A
   * timer already pending wins, so a seat change cannot cut a showdown short.
   *
   * Nothing deals with nobody watching, or a table of bots would play on
   * forever. Whoever opens the table next starts it again.
   */
  private scheduleDeal(delayMs: number): void {
    if (this.finishing || this.nextHandTimer) return;
    if (this.hand && this.hand.street !== Street.Complete) return;

    this.nextHandTimer = setTimeout(() => {
      this.nextHandTimer = null;
      if (this.connected.size > 0) this.startHandIfReady();
    }, delayMs);

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
    // Once settled the seat is the truth: a rebuy changes it after the hand.
    const settled = hand?.street === Street.Complete;
    // This street's bets sit in front of the seats until the street ends, so
    // the middle shows only what has already been gathered.
    const pots = settled
      ? hand.pots
      : buildPots(
          (hand?.players ?? []).map((player) => ({
            ...player,
            totalCommitted: player.totalCommitted - player.committed,
          })),
        );

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
        stack: settled ? seat.stack : (player?.stack ?? seat.stack),
        status: (player?.status ?? (seat.userId ? 'sitting_out' : 'sitting_out')) as
          | 'active'
          | 'folded'
          | 'all_in'
          | 'sitting_out',
        committed: settled ? 0 : (player?.committed ?? 0),
        holeCards: reveal ? [...(player?.holeCards ?? [])] : [],
        isActing: hand?.actingPlayerId === userId,
        isBot: seat.botProfile !== null && seat.botProfile !== undefined,
        botDifficulty: seat.botProfile?.difficulty ?? null,
        isBanned: userId !== null && this.bannedThisHand.has(userId),
        isAway: userId !== null && (this.away.has(userId) || seat.sittingOut === true),
        waitingForBigBlind: userId !== null && this.waitingForBigBlind.has(userId),
        sittingOut: isSelf && seat.sittingOut === true,
        autoRebuy: isSelf && userId !== null && this.autoRebuy.has(userId),
        handDescription:
          isSelf && player && player.status !== PlayerStatus.Folded && hand && hand.board.length >= 3
            ? describeHand(evaluateHand([...player.holeCards, ...hand.board]))
            : null,
      };
    });

    return {
      tableId: this.id,
      ownerId: this.doc.ownerId?.toHexString() ?? null,
      minBuyIn: this.doc.minBuyIn,
      maxBuyIn: this.doc.maxBuyIn,
      handId: hand?.handId ?? null,
      handNumber: hand ? this.doc.handNumber : null,
      street: hand?.street ?? null,
      board: hand?.board ?? [],
      buttonSeat: hand?.buttonSeat ?? null,
      seats,
      pots: pots.map((pot) => ({
        amount: pot.amount,
        eligiblePlayerIds: pot.eligiblePlayerIds,
      })),
      currentBet: hand?.currentBet ?? 0,
      liveActions: (hand?.actions ?? []).map((action) => ({
        userId: action.playerId,
        type: action.type,
        amount: action.amount,
        street: action.street,
      })),
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
      actingOnTimeBank: this.onTimeBank,
    };
  }

  dispose(): void {
    this.clearActionTimer();
    if (this.nextHandTimer) clearTimeout(this.nextHandTimer);
    this.nextHandTimer = null;
    this.onBotTurn = null;
    this.listeners.clear();
    this.handFinishedListeners.clear();
  }
}
