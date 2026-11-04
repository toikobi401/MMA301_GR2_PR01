import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ACTION_TIMEOUT_SECONDS,
  type BotDifficulty,
  type LiveAction,
  type SeatView,
  type TableHand,
} from '@app/shared';
import { Button, Text } from '@/components/ui';
import {
  ActionBar,
  AddBotSheet,
  Board,
  BuyInSheet,
  formatChips,
  HandLog,
  PlayerSeat,
  PotDisplay,
  TableCentre,
  TableChat,
  TableFelt,
} from '@/components/poker';
import { tablesApi, walletApi } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { arrangeSeats, dealPosition } from '@/lib/seat-layout';
import { useHydrated } from '@/lib/use-hydrated';
import { useRunOut } from '@/lib/use-run-out';
import { useSession } from '@/lib/session';
import { useTableSocket } from '@/lib/use-table-socket';
import { useTableSounds } from '@/lib/use-table-sounds';

type PreAction = 'check' | 'check_fold' | 'call_any';

const ACTION_LABEL: Partial<Record<LiveAction['type'], string>> = {
  fold: 'Fold',
  check: 'Check',
  call: 'Call',
  bet: 'Bet',
  raise: 'Raise',
};

const STREET_NAME: Record<string, string> = {
  preflop: 'preflop',
  flop: 'flop',
  turn: 'turn',
  river: 'river',
};

export default function TableScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const hydrated = useHydrated();
  const { user, token, restoring } = useSession();
  const tableId = typeof id === 'string' ? id : null;

  const { state, status, dealing, messages, handsFinished, lastResult, act, sendChat, error } =
    useTableSocket(tableId, token);
  const runOut = useRunOut(state);
  const { width } = useWindowDimensions();
  const [dealError, setDealError] = useState<string | null>(null);
  const [addingChips, setAddingChips] = useState(false);
  const [busy, setBusy] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [preAction, setPreAction] = useState<PreAction | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [addingToSeat, setAddingToSeat] = useState<number | null>(null);
  const [addingBot, setAddingBot] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [hands, setHands] = useState<TableHand[]>([]);
  const [loadingHands, setLoadingHands] = useState(false);
  // Unread count resets whenever the log is opened.
  const [readCount, setReadCount] = useState(0);

  const loadHands = useCallback(async () => {
    if (!tableId) return;
    setLoadingHands(true);
    try {
      const page = await tablesApi.hands(tableId);
      setHands(page.items);
    } catch {
      // Not seated yet, or the table has no history. Either way the panel
      // shows its empty state rather than an error nobody can act on.
      setHands([]);
    } finally {
      setLoadingHands(false);
    }
  }, [tableId]);

  // Refetch when a hand finishes: that is the moment it joins the record.
  useEffect(() => {
    if (handsFinished === 0) return;
    void loadHands();
  }, [handsFinished, loadHands]);

  // Clock, recomputed locally between state pushes so the bar drains smoothly
  // instead of jumping once per server message.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!state?.actingDeadline) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [state?.actingDeadline]);

  const selfSeatNow = state?.seats.find((seat) => seat.userId === user?.id);
  const isMyTurnNow = state?.actingPlayerId === user?.id && user?.id !== undefined;
  const toCallNow = Math.max(0, (state?.currentBet ?? 0) - (selfSeatNow?.committed ?? 0));

  useTableSounds({
    enabled: soundOn,
    isMyTurn: isMyTurnNow,
    actionCount: state?.liveActions.length ?? 0,
  });

  // A pre-selected action belongs to one hand, and "check" only to the price
  // it was chosen at: a bet arriving before the turn cancels it, which is the
  // reason to choose it over check/fold.
  useEffect(() => {
    setPreAction(null);
  }, [state?.handId]);

  useEffect(() => {
    if (!isMyTurnNow || !preAction) return;
    const chosen = preAction;
    setPreAction(null);

    if (chosen === 'check' && toCallNow === 0) act('check', 0);
    if (chosen === 'check_fold') act(toCallNow === 0 ? 'check' : 'fold', 0);
    if (chosen === 'call_any') act(toCallNow === 0 ? 'check' : 'call', 0);
    // Runs once per turn: the turn arriving is what fires a pre-selected action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurnNow]);

  // The prerendered HTML has no URL parameters and no session. Branching on
  // either before hydration makes the first client render disagree with the
  // server markup, and React throws it away — error #418. Every branch below
  // depends on one or the other, so they all wait.
  if (!hydrated || restoring) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-neutral-950">
        <ActivityIndicator size="small" />
      </SafeAreaView>
    );
  }

  if (!tableId) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-neutral-950 p-6">
        <Text className="text-center text-white/70">No table selected.</Text>
        <Button variant="outline" className="mt-4" onPress={() => router.back()}>
          <Text className="text-white">Back to lobby</Text>
        </Button>
      </SafeAreaView>
    );
  }

  const activeTableId = tableId;

  if (!token) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-neutral-950 p-6">
        <Text className="text-center text-white/70">Sign in to join a table.</Text>
        <Button className="mt-4" onPress={() => router.replace('/')}>
          <Text className="text-primary-foreground">Go to lobby</Text>
        </Button>
      </SafeAreaView>
    );
  }

  const seats = state?.seats ?? [];
  const selfSeat = selfSeatNow;
  const canManageBots = state?.ownerId === user?.id || user?.role === 'admin';

  const layout = arrangeSeats(seats, selfSeat?.seat ?? null);
  // Wrapping onto a second row would cover the board, so a full table on a
  // phone shrinks its seats instead.
  const compact = width < 600 && seats.length > 6;
  const handActions = state?.liveActions ?? [];
  const dealtSeats = seats
    .filter((seat) => seat.status !== 'sitting_out' || seat.holeCards.length > 0)
    .map((seat) => seat.seat);

  // The first two posts of a hand are the blinds, in that order.
  const blinds = handActions.filter((action) => action.type === 'post_blind');

  const collected = state?.pots.reduce((sum, pot) => sum + pot.amount, 0) ?? 0;
  const bets = seats.reduce((sum, seat) => sum + seat.committed, 0);
  const potTotal = collected + bets;
  const toCall = toCallNow;
  const isMyTurn = isMyTurnNow;

  const clockRemaining =
    state?.actingDeadline != null
      ? Math.max(0, Math.min(1, (state.actingDeadline - now) / (ACTION_TIMEOUT_SECONDS * 1000)))
      : undefined;

  const seatCard = (seat: SeatView, isSelf = false) => {
    const lastOnStreet = [...handActions]
      .reverse()
      .find(
        (action) =>
          action.userId === seat.userId &&
          action.type !== 'post_blind' &&
          (action.street === state?.street || action.type === 'fold'),
      );

    return (
      <SeatCard
        key={seat.seat}
        seat={{ ...seat, stack: runOut.stackFor(seat.seat, seat.stack) }}
        dealing={dealing}
        dealIndex={dealPosition(seat.seat, dealtSeats, state?.buttonSeat ?? null)}
        dealOrderSize={dealtSeats.length}
        buttonSeat={state?.buttonSeat ?? null}
        isSelf={isSelf}
        compact={compact}
        clockRemaining={seat.isActing ? clockRemaining : undefined}
        onTimeBank={seat.isActing && (state?.actingOnTimeBank ?? false)}
        positionLabel={
          blinds[0]?.userId === seat.userId ? 'SB' : blinds[1]?.userId === seat.userId ? 'BB' : null
        }
        actionLabel={lastOnStreet ? (ACTION_LABEL[lastOnStreet.type] ?? null) : null}
        onAddBot={canManageBots ? () => setAddingToSeat(seat.seat) : undefined}
      />
    );
  };

  async function openAddChips() {
    setDealError(null);
    try {
      setBalance((await walletApi.get()).chips);
    } catch {
      // The server still enforces the balance; this only sets the slider's top.
      setBalance(null);
    }
    setAddingChips(true);
  }

  async function addChips(amount: number) {
    setBusy(true);
    setDealError(null);
    try {
      await tablesApi.addChips(activeTableId, amount);
      setAddingChips(false);
    } catch (caught) {
      setDealError(caught instanceof Error ? caught.message : 'Could not add chips');
    } finally {
      setBusy(false);
    }
  }

  async function toggleSittingOut() {
    setDealError(null);
    try {
      await tablesApi.setSittingOut(activeTableId, !selfSeat?.sittingOut);
    } catch (caught) {
      setDealError(caught instanceof Error ? caught.message : 'Could not change that');
    }
  }

  async function toggleAutoRebuy() {
    setDealError(null);
    try {
      await tablesApi.setAutoRebuy(activeTableId, !selfSeat?.autoRebuy);
    } catch (caught) {
      setDealError(caught instanceof Error ? caught.message : 'Could not change that');
    }
  }

  async function addBot(difficulty: BotDifficulty) {
    if (addingToSeat === null) return;
    setAddingBot(true);
    setDealError(null);
    try {
      await tablesApi.addBot(activeTableId, addingToSeat, difficulty);
      setAddingToSeat(null);
      // No refresh needed: seating a bot changes the table, which broadcasts.
    } catch (caught) {
      setDealError(caught instanceof Error ? caught.message : 'Could not add a bot');
    } finally {
      setAddingBot(false);
    }
  }

  async function leaveTable() {
    // Not seated any more, such as after busting and reconnecting: nothing to
    // give up, so this is just the way back.
    if (!selfSeat) {
      router.replace('/');
      return;
    }

    setLeaving(true);
    setDealError(null);
    try {
      await tablesApi.leave(activeTableId);
      router.replace('/');
    } catch (caught) {
      setDealError(caught instanceof Error ? caught.message : 'Could not leave table');
    } finally {
      setLeaving(false);
    }
  }

  const handIdle = state !== null && (state.street === null || state.street === 'complete');
  // All in during a hand also reads as zero, but those chips are still in play.
  const busted =
    selfSeat?.stack === 0 && (handIdle || selfSeat.status === 'sitting_out');

  const maxAdd = (state?.maxBuyIn ?? 0) - (selfSeat?.stack ?? 0);
  const minAdd = Math.max(1, (state?.minBuyIn ?? 1) - (selfSeat?.stack ?? 0));
  const canAddChips =
    selfSeat !== undefined && maxAdd > 0 && (handIdle || selfSeat.status === 'sitting_out');

  const inHandAndWaiting =
    selfSeat?.status === 'active' && !isMyTurn && !handIdle;

  // Held until the board has finished arriving, or it would spoil the result.
  const winners =
    lastResult && lastResult.handId === state?.handId && !runOut.revealing
      ? mergeWinners(lastResult.results)
      : [];

  const latest = [...handActions].reverse().find((action) => action.type !== 'post_blind');
  const latestName = seats.find((seat) => seat.userId === latest?.userId)?.displayName;

  return (
    <SafeAreaView className="dark flex-1 bg-neutral-950" edges={['top', 'bottom']}>
      <View className="flex-row flex-wrap items-center justify-between px-2 py-1 sm:px-4 sm:py-2">
        <Button variant="ghost" size="sm" loading={leaving} onPress={() => void leaveTable()}>
          <Text className="text-sm font-medium text-white">
            {selfSeat ? 'Leave table' : 'Lobby'}
          </Text>
        </Button>

        <View className="flex-row flex-wrap items-center gap-1 sm:gap-2">
          <Button variant="ghost" size="sm" onPress={() => setSoundOn((on) => !on)}>
            <Text className="text-sm font-medium text-white">
              {soundOn ? 'Sound' : 'Muted'}
            </Text>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onPress={() => {
              setLogOpen(true);
              void loadHands();
            }}
          >
            <Text className="text-sm font-medium text-white">History</Text>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onPress={() => {
              setChatOpen(true);
              setReadCount(messages.length);
            }}
          >
            <Text className="text-sm font-medium text-white">
              Chat{messages.length > readCount ? ` (${messages.length - readCount})` : ''}
            </Text>
          </Button>

          {status !== 'open' && (
            <View className="flex-row items-center gap-1.5">
              <ActivityIndicator size="small" />
              <Text variant="caption" className="text-white/50">
                {status === 'reconnecting' ? 'Reconnecting' : 'Connecting'}
              </Text>
            </View>
          )}
          {state?.handNumber ? (
            <Text variant="caption" className="text-white/50">
              Hand #{state.handNumber}
            </Text>
          ) : null}
        </View>
      </View>

      <View className="w-full max-w-[1100px] flex-1 self-center px-3 pb-3">
        <TableFelt className="flex-1">
          <View className="flex-1 justify-between p-3 sm:p-4">
            <View
              className={cn(
                'flex-row items-start justify-around gap-1',
                !compact && 'flex-wrap',
              )}
            >
              {layout.top.map((seat) => seatCard(seat))}
            </View>

            <TableCentre>
              {potTotal > 0 && <PotDisplay amount={potTotal} />}
              <Board cards={runOut.board} size={compact ? 'sm' : 'default'} />

              {winners.length > 0 ? (
                <View className="items-center gap-0.5 rounded-lg bg-black/50 px-4 py-2">
                  {winners.map((winner) => (
                    <Text
                      key={winner.userId}
                      variant="caption"
                      className="text-center font-semibold text-white"
                    >
                      {winner.displayName} wins {formatChips(winner.amount)}
                      {winner.handDescription ? ` with ${winner.handDescription}` : ''}
                    </Text>
                  ))}
                </View>
              ) : latest && latestName && !handIdle ? (
                <Text variant="caption" className="text-center text-white/70">
                  {latestName}: {ACTION_LABEL[latest.type] ?? latest.type}
                  {latest.amount > 0 ? ` ${formatChips(latest.amount)}` : ''}
                  {state?.street ? ` · ${STREET_NAME[state.street] ?? ''}` : ''}
                </Text>
              ) : null}
            </TableCentre>

            <View
              className={cn(
                'flex-row items-end justify-around gap-1',
                !compact && 'flex-wrap',
              )}
            >
              {layout.bottomLeft.map((seat) => seatCard(seat))}
              {selfSeat && seatCard(selfSeat, true)}
              {layout.bottomRight.map((seat) => seatCard(seat))}
            </View>
          </View>
        </TableFelt>
      </View>

      <HandLog
        visible={logOpen}
        hands={hands}
        loading={loadingHands}
        viewerId={user?.id ?? null}
        liveActions={handIdle ? [] : handActions}
        seats={seats}
        onClose={() => setLogOpen(false)}
        onRefresh={() => void loadHands()}
      />

      <TableChat
        visible={chatOpen}
        messages={messages}
        viewerId={user?.id ?? null}
        onSend={sendChat}
        onClose={() => {
          setChatOpen(false);
          setReadCount(messages.length);
        }}
      />

      <AddBotSheet
        visible={addingToSeat !== null}
        busy={addingBot}
        onClose={() => setAddingToSeat(null)}
        onConfirm={(difficulty) => void addBot(difficulty)}
      />

      <BuyInSheet
        visible={addingChips}
        title={busted ? 'Buy back in' : 'Add chips'}
        min={minAdd}
        max={balance === null ? maxAdd : Math.min(maxAdd, balance)}
        confirmLabel={busted ? 'Buy in' : 'Add'}
        busy={busy}
        error={dealError}
        onClose={() => setAddingChips(false)}
        onConfirm={(amount) => void addChips(amount)}
      />

      <View className="gap-2 border-t border-white/10 bg-neutral-900 px-4 pb-2 pt-3">
        {(error ?? dealError) && (
          <Text variant="caption" className="text-center text-destructive">
            {error ?? dealError}
          </Text>
        )}

        {busted && (
          <Text variant="caption" className="text-center text-white/70">
            You are out of chips and will not be dealt in.
          </Text>
        )}

        {selfSeat?.waitingForBigBlind && (
          <Text variant="caption" className="text-center text-white/70">
            You will be dealt in when the big blind reaches you.
          </Text>
        )}

        {selfSeat && (
          <View className="flex-row flex-wrap items-center justify-center gap-2">
            {canAddChips && (
              <Button
                size="sm"
                variant={busted ? 'default' : 'outline'}
                onPress={() => void openAddChips()}
                className={cn(!busted && 'border-white/20')}
              >
                <Text
                  className={cn(
                    'text-sm font-medium',
                    busted ? 'text-primary-foreground' : 'text-white/80',
                  )}
                >
                  {busted ? 'Buy back in' : 'Add chips'}
                </Text>
              </Button>
            )}
            <SmallToggle
              label={selfSeat.sittingOut ? "I'm back" : 'Sit out'}
              active={selfSeat.sittingOut}
              onPress={() => void toggleSittingOut()}
            />
            <SmallToggle
              label="Auto rebuy"
              active={selfSeat.autoRebuy}
              onPress={() => void toggleAutoRebuy()}
            />
          </View>
        )}

        {inHandAndWaiting && (
          <View className="flex-row flex-wrap items-center justify-center gap-2">
            <Text variant="label" className="text-white/50">
              Next turn
            </Text>
            <SmallToggle
              label="Check"
              active={preAction === 'check'}
              onPress={() => setPreAction(preAction === 'check' ? null : 'check')}
            />
            <SmallToggle
              label="Check / Fold"
              active={preAction === 'check_fold'}
              onPress={() => setPreAction(preAction === 'check_fold' ? null : 'check_fold')}
            />
            <SmallToggle
              label="Call any"
              active={preAction === 'call_any'}
              onPress={() => setPreAction(preAction === 'call_any' ? null : 'call_any')}
            />
          </View>
        )}

        <ActionBar
          actions={state?.legalActions.filter((action) => action.type !== 'post_blind') ?? []}
          toCall={toCall}
          potSize={potTotal}
          currentBet={state?.currentBet ?? 0}
          onDarkSurface
          disabled={!isMyTurn || status !== 'open'}
          onAct={(type, amount) => act(type, amount)}
        />
      </View>
    </SafeAreaView>
  );
}

function mergeWinners(
  results: { userId: string; displayName: string; amount: number; handDescription: string | null }[],
) {
  // One entry per pot share, so a player winning a side pot appears twice.
  const merged = new Map<string, (typeof results)[number]>();
  for (const result of results) {
    const existing = merged.get(result.userId);
    merged.set(
      result.userId,
      existing ? { ...existing, amount: existing.amount + result.amount } : { ...result },
    );
  }
  return [...merged.values()];
}

function SmallToggle({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={cn(active ? 'border-primary bg-primary/15' : 'border-white/20')}
    >
      <Text className={cn('text-sm font-medium', active ? 'text-white' : 'text-white/70')}>
        {label}
      </Text>
    </Button>
  );
}

function SeatCard({
  seat,
  dealing,
  dealIndex,
  dealOrderSize,
  buttonSeat,
  isSelf = false,
  compact = false,
  clockRemaining,
  onTimeBank,
  positionLabel,
  actionLabel,
  onAddBot,
}: {
  seat: SeatView;
  dealing: boolean;
  dealIndex: number;
  dealOrderSize: number;
  buttonSeat: number | null;
  isSelf?: boolean;
  compact?: boolean;
  clockRemaining?: number;
  onTimeBank?: boolean;
  positionLabel?: string | null;
  actionLabel?: string | null;
  onAddBot?: () => void;
}) {
  const inHand = seat.status !== 'sitting_out' || seat.holeCards.length > 0;

  // Face-down placeholders for opponents still in the hand: the server sends
  // no cards for them, but the table should show that they hold two.
  const holeCards =
    seat.holeCards.length > 0
      ? seat.holeCards
      : inHand && seat.userId && !isSelf
        ? [null, null]
        : [];

  return (
    <PlayerSeat
      seat={seat.seat}
      name={seat.displayName}
      stack={seat.stack}
      status={seat.userId ? seat.status : 'empty'}
      committed={seat.committed}
      holeCards={holeCards}
      dealing={dealing}
      dealIndex={dealIndex}
      dealOrderSize={dealOrderSize}
      isActing={seat.isActing}
      isDealer={buttonSeat === seat.seat}
      isSelf={isSelf}
      isBot={seat.isBot}
      botDifficulty={seat.botDifficulty}
      isBanned={seat.isBanned}
      positionLabel={positionLabel}
      actionLabel={actionLabel}
      statusNote={
        seat.isAway ? 'Away' : seat.waitingForBigBlind ? 'Waiting for BB' : null
      }
      handDescription={seat.handDescription}
      onTimeBank={onTimeBank}
      compact={compact}
      clockRemaining={clockRemaining}
      onAddBot={seat.userId === null ? onAddBot : undefined}
    />
  );
}
