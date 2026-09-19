import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SeatView } from '@app/shared';
import { Button, Text } from '@/components/ui';
import {
  ActionBar,
  Board,
  PlayerSeat,
  PotDisplay,
  TableCentre,
  TableFelt,
  type LegalAction,
  type SeatStatus,
} from '@/components/poker';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useTableSocket } from '@/lib/use-table-socket';

export default function TableScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user, token } = useSession();
  const tableId = typeof id === 'string' ? id : null;

  const { state, status, dealing, act, error } = useTableSocket(tableId, token);
  const [dealError, setDealError] = useState<string | null>(null);

  // Clock, recomputed locally between state pushes so the bar drains smoothly
  // instead of jumping once per server message.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!state?.actingDeadline) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [state?.actingDeadline]);

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
  const selfSeat = seats.find((seat) => seat.userId === user?.id);
  const others = seats.filter((seat) => seat.userId !== user?.id);

  // The viewer always sits at the bottom; everyone else spreads across the top.
  const half = Math.ceil(others.length / 2);
  const topSeats = others.slice(0, half);
  const sideSeats = others.slice(half);

  const potTotal = state?.pots.reduce((sum, pot) => sum + pot.amount, 0) ?? 0;
  const toCall = Math.max(0, (state?.currentBet ?? 0) - (selfSeat?.committed ?? 0));
  const isMyTurn = state?.actingPlayerId === user?.id;

  const clockRemaining =
    state?.actingDeadline != null
      ? Math.max(0, Math.min(1, (state.actingDeadline - now) / 30_000))
      : undefined;

  async function deal() {
    setDealError(null);
    try {
      await api.post(`/api/v1/tables/${tableId}/deal`);
    } catch (caught) {
      setDealError(caught instanceof Error ? caught.message : 'Could not deal');
    }
  }

  const handIdle = state !== null && (state.street === null || state.street === 'complete');

  return (
    <SafeAreaView className="dark flex-1 bg-neutral-950" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 py-2">
        <Button variant="ghost" size="sm" onPress={() => router.back()}>
          <Text className="text-sm font-medium text-white">← Lobby</Text>
        </Button>

        <View className="flex-row items-center gap-2">
          {status !== 'open' && (
            <View className="flex-row items-center gap-1.5">
              <ActivityIndicator size="small" color="#9AA3B4" />
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

      <View className="flex-1 px-3 pb-3">
        <TableFelt className="flex-1">
          <View className="flex-1 justify-between p-3">
            <View className="flex-row justify-around">
              {topSeats.map((seat, index) => (
                <SeatCard
                  key={seat.seat}
                  seat={seat}
                  dealing={dealing}
                  dealIndex={index}
                  buttonSeat={state?.buttonSeat ?? null}
                  clockRemaining={seat.isActing ? clockRemaining : undefined}
                />
              ))}
            </View>

            <TableCentre>
              {potTotal > 0 && <PotDisplay amount={potTotal} />}
              <Board cards={state?.board ?? []} />
              {handIdle && (
                <Button size="sm" onPress={() => void deal()} className="mt-2">
                  <Text className="text-sm font-medium text-primary-foreground">Deal</Text>
                </Button>
              )}
            </TableCentre>

            <View className="flex-row items-end justify-around">
              {sideSeats.map((seat, index) => (
                <SeatCard
                  key={seat.seat}
                  seat={seat}
                  dealing={dealing}
                  dealIndex={topSeats.length + index}
                  buttonSeat={state?.buttonSeat ?? null}
                  clockRemaining={seat.isActing ? clockRemaining : undefined}
                />
              ))}

              {selfSeat && (
                <SeatCard
                  seat={selfSeat}
                  dealing={dealing}
                  dealIndex={others.length}
                  buttonSeat={state?.buttonSeat ?? null}
                  isSelf
                  clockRemaining={selfSeat.isActing ? clockRemaining : undefined}
                />
              )}
            </View>
          </View>
        </TableFelt>
      </View>

      <View className="gap-2 border-t border-white/10 bg-neutral-900 px-4 pb-2 pt-3">
        {(error ?? dealError) && (
          <Text variant="caption" className="text-center text-destructive">
            {error ?? dealError}
          </Text>
        )}

        <ActionBar
          actions={(state?.legalActions ?? []) as LegalAction[]}
          toCall={toCall}
          potSize={potTotal}
          onDarkSurface
          disabled={!isMyTurn || status !== 'open'}
          onAct={(type, amount) => act(type, amount)}
        />
      </View>
    </SafeAreaView>
  );
}

function SeatCard({
  seat,
  dealing,
  dealIndex,
  buttonSeat,
  isSelf = false,
  clockRemaining,
}: {
  seat: SeatView;
  dealing: boolean;
  dealIndex: number;
  buttonSeat: number | null;
  isSelf?: boolean;
  clockRemaining?: number;
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
      status={(seat.userId ? seat.status : 'empty') as SeatStatus}
      committed={seat.committed}
      holeCards={holeCards}
      dealing={dealing}
      dealIndex={dealIndex}
      isActing={seat.isActing}
      isDealer={buttonSeat === seat.seat}
      isSelf={isSelf}
      clockRemaining={clockRemaining}
    />
  );
}
