import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Friend } from '@app/shared';

export function ActionButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={`rounded-lg px-3 py-2 ${variant === 'primary' ? 'bg-primary' : 'bg-secondary'} ${disabled ? 'opacity-50' : ''}`}
      disabled={disabled}
      onPress={onPress}
    >
      <Text
        className={`text-center text-sm font-semibold ${variant === 'primary' ? 'text-primary-foreground' : 'text-secondary-foreground'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View className="items-center gap-2 px-5 py-10">
      <Text className="text-center text-lg font-semibold text-foreground">{title}</Text>
      <Text className="max-w-sm text-center text-sm leading-5 text-muted-foreground">
        {description}
      </Text>
      {actionLabel && onAction && <ActionButton label={actionLabel} onPress={onAction} />}
    </View>
  );
}

export function FriendRow({
  friend,
  onAccept,
  onRemove,
}: {
  friend: Friend;
  onAccept?: () => void;
  onRemove: () => void;
}) {
  const isPending = friend.status === 'pending';
  const subtitle = isPending
    ? friend.outgoing
      ? 'Đang chờ phản hồi'
      : 'Muốn kết bạn với bạn'
    : friend.online
      ? 'Đang trực tuyến'
      : 'Ngoại tuyến';

  return (
    <View className="flex-row items-center justify-between gap-3 border-t border-border py-4">
      <View className="min-w-0 flex-1 flex-row items-center gap-3">
        <View className="relative h-11 w-11 items-center justify-center rounded-full bg-secondary">
          <Text className="font-bold text-secondary-foreground">
            {friend.displayName.slice(0, 1).toUpperCase()}
          </Text>
          {!isPending && friend.online && (
            <View className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-success" />
          )}
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="font-semibold text-card-foreground" numberOfLines={1}>
            {friend.displayName}
          </Text>
          <Text className="text-sm text-muted-foreground" numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </View>
      <View className="flex-row gap-2">
        {onAccept && <ActionButton label="Chấp nhận" onPress={onAccept} />}
        <ActionButton
          label={onAccept ? 'Từ chối' : isPending ? 'Hủy' : 'Xóa'}
          onPress={onRemove}
          variant="secondary"
        />
      </View>
    </View>
  );
}

export function FriendGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View>
      <Text className="text-sm font-semibold text-muted-foreground">{title}</Text>
      {children}
    </View>
  );
}
