import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Text } from '@/components/ui';
import {
  ActionBar,
  CardRow,
  PlayerSeat,
  PotDisplay,
  TableCentre,
  TableFelt,
  type LegalAction,
  type SeatStatus,
} from '@/components/poker';

/**
 * Table screen.
 *
 * The server has no table endpoints yet, so this renders a fixed hand to show
 * the layout: seats, board, pot, and the betting controls. Wiring it to the
 * WebSocket replaces the constants below with live state — the components
 * already take the shapes the protocol defines.
 */
const SEATS: Array<{
  seat: number;
  name: string | null;
  stack: number;
  status: SeatStatus;
  committed: number;
  holeCards: (string | null)[];
}> = [
  { seat: 0, name: 'Alice', stack: 8450, status: 'active', committed: 200, holeCards: ['As', 'Kh'] },
  { seat: 1, name: 'Bob', stack: 12300, status: 'active', committed: 200, holeCards: [null, null] },
  { seat: 2, name: 'Carol', stack: 0, status: 'all_in', committed: 3100, holeCards: [null, null] },
  { seat: 3, name: 'Dan', stack: 5600, status: 'folded', committed: 0, holeCards: [null, null] },
  { seat: 4, name: null, stack: 0, status: 'empty', committed: 0, holeCards: [] },
  { seat: 5, name: 'Erin', stack: 9100, status: 'active', committed: 0, holeCards: [null, null] },
];

const BOARD = ['Qd', 'Jc', '9h'];
const POT = 3700;
const TO_CALL = 200;

const LEGAL_ACTIONS: LegalAction[] = [
  { type: 'fold' },
  { type: 'call', min: TO_CALL },
  { type: 'raise', min: 400, max: 8650 },
];

export default function TableScreen() {
  const [lastAction, setLastAction] = useState<string | null>(null);

  const topSeats = SEATS.slice(1, 4);
  // `filter(Boolean)` does not narrow the type, so the predicate is explicit.
  const bottomSeats = [SEATS[5], SEATS[0]].filter(
    (seat): seat is (typeof SEATS)[number] => seat !== undefined,
  );

  return (
    // The table is dark in both themes, so this screen uses fixed colours
    // rather than semantic ones. `dark` still helps on web, where it cascades;
    // on native the components take onDarkSurface instead.
    <SafeAreaView className="dark flex-1 bg-neutral-950" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 py-2">
        <Button variant="ghost" size="sm" onPress={() => router.back()}>
          <Text className="text-sm font-medium text-white">← Lobby</Text>
        </Button>
        <View className="flex-row items-center gap-2">
          <View className="rounded-full border border-white/20 px-2.5 py-0.5">
            <Text className="text-xs font-medium text-white/80">10 / 20</Text>
          </View>
          <Text variant="caption" className="text-white/50">
            Hand #142
          </Text>
        </View>
      </View>

      <View className="flex-1 px-3 pb-3">
        <TableFelt className="flex-1">
          <View className="flex-1 justify-between p-3">
            <View className="flex-row justify-around">
              {topSeats.map((seat) => (
                <PlayerSeat
                  key={seat.seat}
                  seat={seat.seat}
                  name={seat.name}
                  stack={seat.stack}
                  status={seat.status}
                  committed={seat.committed}
                  holeCards={seat.holeCards}
                  isActing={seat.seat === 1}
                  clockRemaining={seat.seat === 1 ? 0.6 : undefined}
                />
              ))}
            </View>

            <TableCentre>
              <PotDisplay amount={POT} />
              <CardRow cards={BOARD} placeholders={5 - BOARD.length} />
            </TableCentre>

            <View className="flex-row justify-around">
              {bottomSeats.map((seat) => (
                <PlayerSeat
                  key={seat.seat}
                  seat={seat.seat}
                  name={seat.name}
                  stack={seat.stack}
                  status={seat.status}
                  committed={seat.committed}
                  holeCards={seat.holeCards}
                  isDealer={seat.seat === 0}
                  isSelf={seat.seat === 0}
                />
              ))}
            </View>
          </View>
        </TableFelt>
      </View>

      <View className="gap-2 border-t border-white/10 bg-neutral-900 px-4 pb-2 pt-3">
        {lastAction && (
          <Text variant="caption" className="text-center text-white/50">
            {lastAction}
          </Text>
        )}

        <ActionBar
          actions={LEGAL_ACTIONS}
          toCall={TO_CALL}
          potSize={POT}
          onDarkSurface
          onAct={(type, amount) =>
            setLastAction(amount > 0 ? `You chose ${type} ${amount}` : `You chose ${type}`)
          }
        />
      </View>
    </SafeAreaView>
  );
}
