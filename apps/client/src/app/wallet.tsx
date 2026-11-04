import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import type { ChipTransaction, Payment, PaymentConfig, PaymentStatus, Wallet } from '@app/shared';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Tabs,
  Text,
} from '@/components/ui';
import { formatChips } from '@/components/poker';
import { BankPicker, PaymentList } from '@/components/wallet';
import { paymentsApi, walletApi } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { checkoutReturnUrl, formatVnd, openCheckout } from '@/lib/payos-checkout';
import { useHydrated } from '@/lib/use-hydrated';
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
  refund: 'Refund',
};

const MODES = [
  { value: 'deposit', label: 'Top up' },
  { value: 'withdraw', label: 'Cash out' },
] as const;

type Mode = (typeof MODES)[number]['value'];

/** Statuses that payOS may still change. */
const OPEN: ReadonlySet<PaymentStatus> = new Set(['pending', 'processing']);

const POLL_INTERVAL_MS = 3000;
const POLL_ATTEMPTS = 10;

const NOTICES: Partial<Record<PaymentStatus, string>> = {
  paid: 'Payment confirmed — chips added to your wallet.',
  cancelled: 'Payment cancelled. No chips were added.',
  expired: 'The payment link expired. No chips were added.',
  succeeded: 'Cash-out sent to your bank account.',
  failed: 'That payment failed. Any chips taken have been returned.',
  pending: 'Still waiting for payOS to confirm. Check again in a moment.',
  processing: 'Cash-out submitted. payOS is processing it.',
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function WalletScreen() {
  const hydrated = useHydrated();
  const { token, restoring } = useSession();
  // payOS appends orderCode (and status, cancel, ...) when it sends a web
  // player back here.
  const params = useLocalSearchParams<{ orderCode?: string }>();

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyOrderCode, setBusyOrderCode] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>('deposit');
  const [amount, setAmount] = useState('1000');
  const [bankBin, setBankBin] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const [nextWallet, nextConfig, nextPayments] = await Promise.all([
        walletApi.get(),
        paymentsApi.config(),
        paymentsApi.list(),
      ]);
      if (!mounted.current) return;
      setWallet(nextWallet);
      setConfig(nextConfig);
      setPayments(nextPayments.items);
      setError(null);
    } catch (caught) {
      if (mounted.current) {
        setError(caught instanceof Error ? caught.message : 'Could not load the wallet');
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Asks the server about one order until payOS settles it. The server asks
   * payOS in turn, so this works even when the webhook cannot reach a LAN
   * demo machine.
   */
  const track = useCallback(
    async (orderCode: number) => {
      setBusyOrderCode(orderCode);
      try {
        let status: PaymentStatus = 'pending';
        for (let attempt = 0; attempt < POLL_ATTEMPTS && mounted.current; attempt += 1) {
          const result = await paymentsApi.get(orderCode);
          status = result.payment.status;
          if (!OPEN.has(status)) break;
          await sleep(POLL_INTERVAL_MS);
        }
        if (mounted.current) setNotice(NOTICES[status] ?? null);
      } catch (caught) {
        if (mounted.current) {
          setError(caught instanceof Error ? caught.message : 'Could not check the payment');
        }
      } finally {
        if (mounted.current) setBusyOrderCode(null);
        await refresh();
      }
    },
    [refresh],
  );

  // Back from payOS checkout on web.
  const returnedOrder = params.orderCode ? Number(params.orderCode) : null;
  useEffect(() => {
    if (!hydrated || restoring || !token || !returnedOrder) return;
    router.replace('/wallet');
    void track(returnedOrder);
  }, [hydrated, restoring, token, returnedOrder, track]);

  function parseAmount(): number | null {
    const value = Number(amount);
    if (!Number.isInteger(value) || value <= 0) {
      setError('Enter a whole number of chips above zero');
      return null;
    }
    return value;
  }

  async function deposit() {
    const chips = parseAmount();
    if (chips === null) return;

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (!config?.depositsEnabled) {
        await walletApi.deposit(chips);
        await refresh();
        return;
      }

      const returnUrl = checkoutReturnUrl();
      const { payment, checkoutUrl } = await paymentsApi.createDeposit({ chips, returnUrl });
      await openCheckout(checkoutUrl, returnUrl);
      // Native only: the browser has closed. Web has navigated away.
      await track(payment.orderCode);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not go through');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function withdraw() {
    const chips = parseAmount();
    if (chips === null) return;

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (!config?.withdrawalsEnabled) {
        await walletApi.withdraw(chips);
        await refresh();
        return;
      }

      if (!/^\d{6}$/.test(bankBin)) {
        setError('Choose a bank or enter its six-digit BIN');
        return;
      }
      if (!/^\d{6,19}$/.test(accountNumber)) {
        setError('Enter an account number of 6–19 digits');
        return;
      }

      const result = await paymentsApi.createWithdrawal({ chips, bankBin, accountNumber });
      setNotice(NOTICES[result.payment.status] ?? null);
      await refresh();
      if (OPEN.has(result.payment.status)) void track(result.payment.orderCode);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not go through');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function payPending(payment: Payment) {
    if (!payment.checkoutUrl) return;
    setError(null);
    try {
      await openCheckout(payment.checkoutUrl, checkoutReturnUrl());
      await track(payment.orderCode);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open checkout');
    }
  }

  async function cancelPending(payment: Payment) {
    setBusyOrderCode(payment.orderCode);
    setError(null);
    try {
      const result = await paymentsApi.cancelDeposit(payment.orderCode);
      setNotice(NOTICES[result.payment.status] ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not cancel the payment');
    } finally {
      setBusyOrderCode(null);
      await refresh();
    }
  }

  // Wait for the stored session to be exchanged, or every reload flashes the
  // signed-out view before the token arrives.
  // The prerendered HTML has no session, so deciding before hydration makes
  // the first client render disagree with it (React #418).
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
        <Text tone="muted">Sign in to see your chips.</Text>
        <Button label="Go to lobby" className="mt-4" onPress={() => router.replace('/')} />
      </View>
    );
  }

  const usesPayos = mode === 'deposit' ? config?.depositsEnabled : config?.withdrawalsEnabled;
  const limits = mode === 'deposit' ? config?.deposit : config?.withdraw;
  const chips = Number(amount);
  const priced = config && Number.isInteger(chips) && chips > 0;

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
              <Text variant="display" className="font-mono tabular-nums">
                {formatChips(wallet?.chips ?? 0)}
              </Text>
            )}
            <Text variant="caption" tone="muted">
              {config?.depositsEnabled || config?.withdrawalsEnabled
                ? `Payments by payOS · 1 chip = ${formatVnd(config.vndPerChip)}`
                : 'Play money. Deposits and withdrawals are simulated.'}
            </Text>
          </CardHeader>
        </Card>

        <Card>
          <CardContent className="gap-3 pt-4">
            <Tabs options={MODES} value={mode} onChange={setMode} />

            <Input
              label="Chips"
              value={amount}
              onChangeText={setAmount}
              keyboardType="number-pad"
              hint={
                limits
                  ? `${formatChips(limits.min)}–${formatChips(limits.max)} chips` +
                    (usesPayos && priced ? ` · ${formatVnd(chips * config.vndPerChip)}` : '')
                  : undefined
              }
            />

            {mode === 'withdraw' && config?.withdrawalsEnabled && (
              <BankPicker
                bin={bankBin}
                onBinChange={setBankBin}
                accountNumber={accountNumber}
                onAccountNumberChange={setAccountNumber}
              />
            )}

            {mode === 'deposit' ? (
              <Button
                label={usesPayos ? 'Pay with payOS' : 'Deposit'}
                loading={busy}
                onPress={() => void deposit()}
                block
              />
            ) : (
              <Button
                variant="outline"
                label={usesPayos ? 'Cash out to bank' : 'Withdraw'}
                loading={busy}
                onPress={() => void withdraw()}
                block
              />
            )}

            {notice && (
              <Text variant="caption" tone="muted">
                {notice}
              </Text>
            )}
            {error && (
              <Text variant="caption" tone="destructive">
                {error}
              </Text>
            )}
          </CardContent>
        </Card>

        {payments.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>payOS orders</CardTitle>
            </CardHeader>
            <CardContent className="gap-0">
              <PaymentList
                payments={payments}
                busyOrderCode={busyOrderCode}
                onPay={(payment) => void payPending(payment)}
                onCancel={(payment) => void cancelPending(payment)}
                onRefresh={(payment) => void track(payment.orderCode)}
              />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent activity</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              label="View all"
              onPress={() => router.push('/wallet/transactions')}
            />
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
                      {transaction.amount >= 0 ? '+' : '−'}
                      {formatChips(Math.abs(transaction.amount))}
                    </Text>
                    <Text variant="caption" tone="muted">
                      Balance{' '}
                      <Text variant="numeric" className="text-sm text-muted-foreground">
                        {formatChips(transaction.balanceAfter)}
                      </Text>
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
