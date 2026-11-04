import { Link } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View, Pressable } from 'react-native';
import type { LeaderboardCriterion } from '@/lib/leaderboard';
import {
  LeaderboardTabBar,
  LeaderboardRow,
  Podium,
  SectionDivider,
} from '@/components/leaderboard/leaderboard-ui';
import { leaderboardTabs, toRow } from '@/lib/leaderboard';
import { useHydrated } from '@/lib/use-hydrated';
import { useLeaderboard } from '@/lib/use-leaderboard';
import { useSession } from '@/lib/session';

export default function LeaderboardScreen() {
  const [criterion, setCriterion] = useState<LeaderboardCriterion>('net_chips');

  const hydrated = useHydrated();
  const { user, token, restoring } = useSession();
  const { leaderboard, error } = useLeaderboard(criterion, token);

  const entries   = (leaderboard?.entries ?? []).map((entry) => toRow(entry, user?.id));
  const top3      = entries.slice(0, 3);
  const rest      = entries.slice(3);
  const activeTab = leaderboardTabs.find((t) => t.id === criterion)!;
  // Someone outside the top entries still wants to know where they stand.
  const viewerBelow =
    leaderboard?.viewerRank && !entries.some((entry) => entry.isCurrentUser)
      ? toRow(leaderboard.viewerRank, user?.id)
      : null;

  // Depends on the session, which the prerendered HTML does not have; deciding
  // earlier makes hydration disagree with it (React #418).
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
        <Text className="text-muted-foreground">Đăng nhập để xem bảng xếp hạng.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="min-h-full items-center px-4 py-8 sm:px-6"
    >
      <View className="w-full max-w-2xl gap-6">

        {/* ── Header ──────────────────────────────────────── */}
        <View className="gap-4">
          <Link href="/" asChild>
            <Pressable
              accessibilityRole="button"
              className="min-h-11 self-start justify-center rounded-md px-1"
            >
              <Text className="font-semibold text-primary">‹  Về sảnh</Text>
            </Pressable>
          </Link>
          <View className="flex-row items-center gap-3">
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary/20">
              <Text className="text-2xl">🏆</Text>
            </View>
            <View className="gap-0.5">
              <Text className="text-3xl font-black text-foreground">Bảng xếp hạng</Text>
              <Text className="text-sm text-muted-foreground">
                Top theo {activeTab.label.toLowerCase()}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Tab bar ─────────────────────────────────────── */}
        <LeaderboardTabBar active={criterion} onChange={setCriterion} />

        {/* ── Main card ───────────────────────────────────── */}
        <View className="overflow-hidden rounded-2xl border border-border bg-card">

          {/* Podium */}
          {top3.length === 3 ? (
            <Podium top3={top3} criterion={criterion} />
          ) : entries.length === 0 ? (
            <Text className="p-6 text-center text-sm text-muted-foreground">
              {leaderboard ? 'Chưa có ai chơi ván nào.' : 'Đang tải…'}
            </Text>
          ) : null}

          {/* Divider */}
          <View className="px-4 py-4">
            <SectionDivider label="Tất cả người chơi" />
          </View>

          {/* Rows 4-N */}
          <View className="gap-1 px-3 pb-4">
            {(top3.length === 3 ? rest : entries).map((entry) => (
              <LeaderboardRow key={entry.userId} entry={entry} criterion={criterion} />
            ))}
            {viewerBelow && (
              <LeaderboardRow entry={viewerBelow} criterion={criterion} />
            )}
          </View>
        </View>

        {/* ── Footer ──────────────────────────────────────── */}
        <Text className="text-center text-xs text-muted-foreground">
          Cập nhật trực tiếp sau mỗi ván · Dòng vàng là tài khoản của bạn
        </Text>
        {error && <Text className="text-center text-xs text-destructive">{error}</Text>}
      </View>
    </ScrollView>
  );
}
