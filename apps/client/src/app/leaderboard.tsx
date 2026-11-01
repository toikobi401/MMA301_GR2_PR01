import { Link } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View, Pressable } from 'react-native';
import type { LeaderboardCriterion } from '@/lib/leaderboard-mock';
import {
  LeaderboardTabBar,
  LeaderboardRow,
  Podium,
  SectionDivider,
} from '@/components/leaderboard/leaderboard-ui';
import { getMockLeaderboard, leaderboardTabs } from '@/lib/leaderboard-mock';

export default function LeaderboardScreen() {
  const [criterion, setCriterion] = useState<LeaderboardCriterion>('net_chips');

  const entries   = getMockLeaderboard(criterion);
  const top3      = entries.slice(0, 3);
  const rest      = entries.slice(3);
  const activeTab = leaderboardTabs.find((t) => t.id === criterion)!;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="min-h-full items-center px-4 py-8 sm:px-6"
    >
      <View className="w-full max-w-2xl gap-6">

        {/* ── Header ──────────────────────────────────────── */}
        <View className="gap-4">
          <Link href="/" asChild>
            <Pressable accessibilityRole="button" className="self-start rounded-md px-1 py-1">
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
          <Podium top3={top3} criterion={criterion} />

          {/* Divider */}
          <View className="px-4 py-4">
            <SectionDivider label="Tất cả người chơi" />
          </View>

          {/* Rows 4-N */}
          <View className="gap-1 px-3 pb-4">
            {rest.map((entry) => (
              <LeaderboardRow key={entry.userId} entry={entry} criterion={criterion} />
            ))}
          </View>
        </View>

        {/* ── Footer ──────────────────────────────────────── */}
        <Text className="text-center text-xs text-muted-foreground">
          Dữ liệu mẫu trên thiết bị · Dòng vàng là tài khoản của bạn
        </Text>
      </View>
    </ScrollView>
  );
}
