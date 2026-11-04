import { View } from 'react-native';
import type { Payment, PaymentStatus } from '@app/shared';
import { Badge, Button, Text, type BadgeProps } from '@/components/ui';
import { formatChips } from '@/components/poker';
import { cn } from '@/lib/cn';
import { formatVnd } from '@/lib/payos-checkout';
import { bankName } from './bank-picker';

const STATUS: Record<PaymentStatus, { label: string; variant: BadgeProps['variant'] }> = {
  pending: { label: 'Awaiting payment', variant: 'secondary' },
  paid: { label: 'Paid', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'muted' },
  expired: { label: 'Expired', variant: 'muted' },
  processing: { label: 'Processing', variant: 'secondary' },
  succeeded: { label: 'Sent', variant: 'success' },
  failed: { label: 'Failed', variant: 'destructive' },
};

export interface PaymentListProps {
  payments: Payment[];
  /** Order code of the row whose action is running, if any. */
  busyOrderCode: number | null;
  onPay: (payment: Payment) => void;
  onCancel: (payment: Payment) => void;
  onRefresh: (payment: Payment) => void;
}

export function PaymentList({ payments, busyOrderCode, onPay, onCancel, onRefresh }: PaymentListProps) {
  return (
    <View>
      {payments.map((payment, index) => {
        const status = STATUS[payment.status];
        const busy = busyOrderCode === payment.orderCode;
        const open = payment.status === 'pending' || payment.status === 'processing';

        return (
          <View
            key={payment.orderCode}
            className={cn('gap-2 py-3', index > 0 && 'border-t border-border')}
          >
            <View className="flex-row items-start justify-between gap-3">
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="font-medium">
                  {payment.kind === 'deposit' ? 'Top up' : 'Cash out'} ·{' '}
                  <Text variant="numeric">{formatChips(payment.chips)}</Text> chips
                </Text>
                <Text variant="caption" tone="muted">
                  {formatVnd(payment.amountVnd)} · {new Date(payment.createdAt).toLocaleString()}
                </Text>
                {payment.kind === 'withdrawal' && payment.accountNumber && (
                  <Text variant="caption" tone="muted">
                    {bankName(payment.bankBin)} {payment.accountNumber}
                  </Text>
                )}
                {payment.failureReason && payment.status === 'failed' && (
                  <Text variant="caption" tone="destructive">
                    {payment.failureReason}
                    {payment.kind === 'withdrawal' ? ' — chips refunded' : ''}
                  </Text>
                )}
              </View>
              <Badge label={status.label} variant={status.variant} />
            </View>

            {open && (
              <View className="flex-row gap-2">
                {payment.status === 'pending' && payment.checkoutUrl && (
                  <Button size="sm" label="Pay" disabled={busy} onPress={() => onPay(payment)} />
                )}
                {payment.status === 'pending' && (
                  <Button
                    size="sm"
                    variant="outline"
                    label="Cancel"
                    loading={busy}
                    onPress={() => onCancel(payment)}
                  />
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  label="Check status"
                  loading={busy}
                  onPress={() => onRefresh(payment)}
                />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
