import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import type { ChipTransaction } from '@app/shared';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Tabs,
  Text,
} from '@/components/ui';
import { formatChips } from '@/components/poker';
import { walletApi } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { useHydrated } from '@/lib/use-hydrated';
import { useSession } from '@/lib/session';

const PAGE_SIZE = 20;

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

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'in', label: 'Chip in' },
  { value: 'out', label: 'Chip out' },
] as const;

type TransactionFilter = (typeof FILTERS)[number]['value'];

export default function WalletTransactionsScreen() {
  const hydrated = useHydrated();
  const { token, restoring } = useSession();
  const [transactions, setTransactions] = useState<ChipTransaction[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<TransactionFilter>('all');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFirstPage = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const page = await walletApi.transactions(PAGE_SIZE);
      setTransactions(page.items);
      setNextCursor(page.nextCursor);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load transactions');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  async function loadMore() {
    if (!token || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await walletApi.transactions(PAGE_SIZE, nextCursor);
      setTransactions((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load more transactions');
    } finally {
      setLoadingMore(false);
    }
  }

  const visibleTransactions = useMemo(
    () =>
      transactions.filter((transaction) => {
        if (filter === 'in') return transaction.amount > 0;
        if (filter === 'out') return transaction.amount < 0;
        return true;
      }),
    [filter, transactions],
  );

  if (!hydrated || restoring) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="small" />
      </View>
    );
  }

  if (!token) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text tone="muted">Sign in to see your chip transactions.</Text>
        <Button label="Go to lobby" className="mt-4" onPress={() => router.replace('/')} />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="items-center p-6">
      <View className="w-full max-w-[680px] gap-4">
        <View className="gap-1">
          <Text variant="title">Chip transactions</Text>
          <Text tone="muted">A complete record of chip movements in your wallet.</Text>
        </View>

        <Card>
          <CardHeader>
            <CardTitle>Transaction history</CardTitle>
            <Text variant="caption" tone="muted">
              Play chips only. No real-money payments are processed.
            </Text>
          </CardHeader>
          <CardContent className="gap-4">
            <Tabs options={FILTERS} value={filter} onChange={setFilter} />

            {loading ? (
              <View className="py-8">
                <ActivityIndicator size="small" />
              </View>
            ) : error && transactions.length === 0 ? (
              <EmptyState
                title="Could not load transactions"
                description={error}
                actionLabel="Try again"
                onAction={() => void loadFirstPage()}
              />
            ) : visibleTransactions.length === 0 ? (
              <EmptyState
                title={
                  transactions.length === 0 ? 'No transactions yet' : 'No matching transactions'
                }
                description={
                  transactions.length === 0
                    ? 'Deposits, withdrawals, buy-ins, and winnings will appear here.'
                    : 'Try another filter or load more of your transaction history.'
                }
              />
            ) : (
              <View>
                {visibleTransactions.map((transaction, index) => (
                  <View
                    key={transaction.id}
                    className={cn(
                      'flex-row items-center justify-between gap-3 py-3',
                      index > 0 && 'border-t border-border',
                    )}
                  >
                    <View className="min-w-0 flex-1 gap-0.5">
                      <Text className="font-medium">{KINDS[transaction.kind]}</Text>
                      <Text variant="caption" tone="muted">
                        {new Date(transaction.createdAt).toLocaleString()}
                      </Text>
                      {transaction.reference && (
                        <Text variant="caption" tone="muted" numberOfLines={1}>
                          Reference: {transaction.reference}
                        </Text>
                      )}
                    </View>

                    <View className="items-end gap-0.5">
                      <Text
                        variant="numeric"
                        className={cn(
                          'font-medium',
                          transaction.amount >= 0 ? 'text-success' : 'text-destructive',
                        )}
                      >
                        {transaction.amount >= 0 ? '+' : '−'}
                        {formatChips(Math.abs(transaction.amount))}
                      </Text>
                      <Text variant="caption" tone="muted">
                        Balance {formatChips(transaction.balanceAfter)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {error && transactions.length > 0 && (
              <Text variant="caption" tone="destructive">
                {error}
              </Text>
            )}

            {nextCursor && (
              <Button
                variant="outline"
                label="Load more"
                loading={loadingMore}
                onPress={() => void loadMore()}
                block
              />
            )}
          </CardContent>
        </Card>
      </View>
    </ScrollView>
  );
}
