import { View, Text, Pressable } from 'react-native';
import type { MockLeaderboardEntry, LeaderboardCriterion } from '@/lib/leaderboard-mock';
import { leaderboardTabs } from '@/lib/leaderboard-mock';

const AVATAR_COLORS = [
  'bg-amber-600', 'bg-emerald-700', 'bg-sky-700',
  'bg-violet-700', 'bg-rose-700', 'bg-teal-700',
  'bg-orange-700', 'bg-indigo-700',
];
function avatarBg(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length] ?? 'bg-secondary';
}

// ── Tab bar ───────────────────────────────────────────────────────────────────
export function LeaderboardTabBar({
  active,
  onChange,
}: {
  active: LeaderboardCriterion;
  onChange: (tab: LeaderboardCriterion) => void;
}) {
  return (
    <View
      accessibilityRole="tablist"
      className="flex-row rounded-2xl border border-border bg-card p-1.5"
    >
      {leaderboardTabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            className={`min-h-11 flex-1 items-center justify-center rounded-xl px-2 py-2 ${
              selected ? 'bg-primary' : ''
            }`}
            onPress={() => onChange(tab.id)}
          >
            <Text
              className={`text-center text-xs font-black ${
                selected ? 'text-primary-foreground' : 'text-muted-foreground'
              }`}
              numberOfLines={1}
            >
              {tab.shortLabel}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Score formatting ──────────────────────────────────────────────────────────
function formatScore(entry: MockLeaderboardEntry, criterion: LeaderboardCriterion): string {
  if (criterion === 'net_chips') {
    return entry.chips >= 1000
      ? `${(entry.chips / 1000).toFixed(1)}K ♠`
      : `${entry.chips} ♠`;
  }
  if (criterion === 'hands_won') return `${entry.handsWon} ván`;
  return entry.biggestPot >= 1000
    ? `${(entry.biggestPot / 1000).toFixed(1)}K ♠`
    : `${entry.biggestPot} ♠`;
}

function scoreLabel(criterion: LeaderboardCriterion): string {
  if (criterion === 'net_chips')   return 'chips';
  if (criterion === 'hands_won')   return 'thắng';
  return 'pot lớn';
}

// ── Rank badge ────────────────────────────────────────────────────────────────
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return (
    <View className="h-9 w-9 items-center justify-center">
      <Text className="text-2xl">🥇</Text>
    </View>
  );
  if (rank === 2) return (
    <View className="h-9 w-9 items-center justify-center rounded-full bg-slate-600">
      <Text className="text-sm font-black text-white">2</Text>
    </View>
  );
  if (rank === 3) return (
    <View className="h-9 w-9 items-center justify-center rounded-full bg-amber-700">
      <Text className="text-sm font-black text-white">3</Text>
    </View>
  );
  return (
    <View className="h-9 w-9 items-center justify-center">
      <Text className="text-sm font-bold text-muted-foreground">#{rank}</Text>
    </View>
  );
}

// ── Single list row ───────────────────────────────────────────────────────────
export function LeaderboardRow({
  entry,
  criterion,
}: {
  entry: MockLeaderboardEntry;
  criterion: LeaderboardCriterion;
}) {
  const me = entry.isCurrentUser;
  const bg = avatarBg(entry.displayName);

  return (
    <View
      accessibilityLabel={`Hạng ${entry.rank}: ${entry.displayName}`}
      className={`flex-row items-center gap-3 rounded-2xl px-3 py-3 ${
        me ? 'border border-primary/50 bg-primary/10' : 'border border-transparent'
      }`}
    >
      {/* Rank */}
      <RankBadge rank={entry.rank} />

      {/* Avatar */}
      <View className={`h-10 w-10 items-center justify-center rounded-full ${me ? 'bg-primary' : bg}`}>
        <Text className={`font-black ${me ? 'text-primary-foreground' : 'text-white'}`}>
          {entry.displayName.slice(0, 1).toUpperCase()}
        </Text>
      </View>

      {/* Name + stats */}
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text
            className={`text-sm font-bold ${me ? 'text-primary' : 'text-foreground'}`}
            numberOfLines={1}
          >
            {entry.displayName}
          </Text>
          {me && (
            <View className="rounded-full bg-primary px-1.5 py-0.5">
              <Text className="text-[9px] font-black text-primary-foreground">BẠN</Text>
            </View>
          )}
        </View>
        <Text className="text-xs text-muted-foreground">
          {entry.handsPlayed} ván
          {entry.winRate !== null ? ` · ${(entry.winRate * 100).toFixed(1)}% thắng` : ''}
        </Text>
      </View>

      {/* Score */}
      <View className="items-end gap-0.5">
        <Text className={`text-base font-black ${me ? 'text-primary' : 'text-foreground'}`}>
          {formatScore(entry, criterion)}
        </Text>
        <Text className="text-xs text-muted-foreground">{scoreLabel(criterion)}</Text>
      </View>
    </View>
  );
}

// ── Section divider ───────────────────────────────────────────────────────────
export function SectionDivider({ label }: { label: string }) {
  return (
    <View className="flex-row items-center gap-2 px-1">
      <View className="h-px flex-1 bg-border" />
      <Text className="text-xs font-semibold text-muted-foreground">{label}</Text>
      <View className="h-px flex-1 bg-border" />
    </View>
  );
}

// ── Podium card ───────────────────────────────────────────────────────────────
function PodiumCard({
  entry,
  criterion,
  size,
}: {
  entry: MockLeaderboardEntry;
  criterion: LeaderboardCriterion;
  size: 'sm' | 'md' | 'lg';
}) {
  const colH = size === 'lg' ? 'h-28' : size === 'md' ? 'h-20' : 'h-14';
  const me   = entry.isCurrentUser;
  const bg   = me ? 'bg-primary' : avatarBg(entry.displayName);

  const colBg =
    entry.rank === 1 ? 'bg-amber-500' : entry.rank === 2 ? 'bg-slate-500' : 'bg-amber-800';
  const colText =
    entry.rank === 1 ? 'text-amber-900' : entry.rank === 2 ? 'text-slate-100' : 'text-amber-100';

  return (
    <View className="flex-1 items-center gap-1.5">
      {/* Avatar */}
      <View
        className={`h-12 w-12 items-center justify-center rounded-full border-2 ${
          me ? 'border-primary ' + bg : 'border-border ' + bg
        }`}
      >
        <Text className={`text-lg font-black ${me ? 'text-primary-foreground' : 'text-white'}`}>
          {entry.displayName.slice(0, 1).toUpperCase()}
        </Text>
      </View>

      {/* Name */}
      <Text
        className={`text-xs font-bold ${me ? 'text-primary' : 'text-foreground'}`}
        numberOfLines={1}
      >
        {entry.displayName}
      </Text>

      {/* Score */}
      <Text className="text-xs font-semibold text-muted-foreground">
        {formatScore(entry, criterion)}
      </Text>

      {/* Column */}
      <View className={`w-full ${colH} items-center justify-center rounded-t-2xl ${colBg}`}>
        <Text className={`text-xl font-black ${colText}`}>
          {entry.rank === 1 ? '🏆' : entry.rank === 2 ? '2' : '3'}
        </Text>
      </View>
    </View>
  );
}

export function Podium({
  top3,
  criterion,
}: {
  top3: MockLeaderboardEntry[];
  criterion: LeaderboardCriterion;
}) {
  if (top3.length < 3) return null;
  const [first, second, third] = top3;
  return (
    <View className="flex-row items-end gap-3 px-4 pt-6 pb-0">
      <PodiumCard entry={second!} criterion={criterion} size="md" />
      <PodiumCard entry={first!}  criterion={criterion} size="lg" />
      <PodiumCard entry={third!}  criterion={criterion} size="sm" />
    </View>
  );
}
