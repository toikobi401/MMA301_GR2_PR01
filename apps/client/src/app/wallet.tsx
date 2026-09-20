import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import type { ChipTransaction, Wallet } from '@app/shared';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Text,
} from '@/components/ui';
import { formatChips } from '@/components/poker';
import { walletApi } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/session';

const KINDS: Record<ChipTransaction['kind'], string> = {
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
  buy_in: 'Buy-in',
  cash_out: 'Cash out',
  win: 'Won',
  loss: 'Lost',
  rake: 'Rake',
  bonus: 'Bonus',
};

export default function WalletScreen() {
  const { token, restoring } = useSession();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState('1000');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      setWallet(await walletApi.get());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the wallet');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function move(direction: 'deposit' | 'withdraw') {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an amount above zero');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (direction === 'deposit') await walletApi.deposit(value);
      else await walletApi.withdraw(value);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not go through');
    } finally {
      setBusy(false);
    }
  }

  // Wait for the stored session to be exchanged, or every reload flashes the
  // signed-out view before the token arrives.
  if (restoring) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="small" />
      </View>
    );
  }

  if (!token) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text tone="muted">Sign in to see your chips.</Text>
        <Button label="Go to lobby" className="mt-4" onPress={() => router.replace('/')} />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="p-6 items-center">
      <View className="w-full max-w-[680px] gap-4">
        <Card>
          <CardHeader className="gap-1">
            <Text variant="label" tone="muted">
              Balance
            </Text>
            {loading ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text variant="display">{formatChips(wallet?.chips ?? 0)}</Text>
            )}
            <Text variant="caption" tone="muted">
              Play money. Nothing here is real currency.
            </Text>
          </CardHeader>

          <CardContent className="gap-3">
            <Input
              label="Amount"
              value={amount}
              onChangeText={setAmount}
              keyboardType="number-pad"
              hint="Between 100 and 100,000"
            />

            <View className="flex-row gap-2">
              <Button
                variant="outline"
                label="Withdraw"
                loading={busy}
                onPress={() => void move('withdraw')}
                className="flex-1"
              />
              <Button
                label="Deposit"
                loading={busy}
                onPress={() => void move('deposit')}
                className="flex-1"
              />
            </View>

            {error && (
              <Text variant="caption" tone="destructive">
                {error}
              </Text>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>

          <CardContent className="gap-0">
            {loading ? (
              <View className="py-6">
                <ActivityIndicator size="small" />
              </View>
            ) : (wallet?.recentTransactions.length ?? 0) === 0 ? (
              <EmptyState
                title="No transactions yet"
                description="Deposits, buy-ins, and winnings all show up here."
              />
            ) : (
              wallet?.recentTransactions.map((transaction, index) => (
                <View
                  key={transaction.id}
                  className={cn(
                    'flex-row items-center justify-between py-3',
                    index > 0 && 'border-t border-border',
                  )}
                >
                  <View className="gap-0.5">
                    <Text>{KINDS[transaction.kind]}</Text>
                    <Text variant="caption" tone="muted">
                      {new Date(transaction.createdAt).toLocaleString()}
                    </Text>
                  </View>

                  <View className="items-end gap-0.5">
                    <Text
                      variant="numeric"
                      className={cn(
                        'font-medium',
                        transaction.amount >= 0 ? 'text-success' : 'text-destructive',
                      )}
                    >
                      {transaction.amount >= 0 ? '+' : ''}
                      {formatChips(transaction.amount)}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {formatChips(transaction.balanceAfter)}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </CardContent>
        </Card>
      </View>
    </ScrollView>
  );
}
