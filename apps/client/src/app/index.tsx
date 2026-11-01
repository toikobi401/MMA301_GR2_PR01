import { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { api, apiBaseUrl } from '@/lib/api';

// Placeholder until the lobby lands (task W1-09); proves the client reaches the API.
export default function HomeScreen() {
  const [status, setStatus] = useState('checking…');

  useEffect(() => {
    api
      .get<{ status: string; uptime: number }>('/health')
      .then((health) => setStatus(`${health.status}, uptime ${health.uptime}s`))
      .catch((error: unknown) => setStatus(`unreachable: ${String(error)}`));
  }, []);

  return (
    <View className="flex-1 items-center justify-center gap-2 p-6">
      <Text className="text-xl font-bold">Poker GR2</Text>
      <Text>
        API {apiBaseUrl}: {status}
      </Text>
      <Link href="/friends" asChild>
        <Pressable className="mt-4 rounded-lg bg-primary px-5 py-3">
          <Text className="font-semibold text-primary-foreground">Mở Bạn bè</Text>
        </Pressable>
      </Link>
      <Link href="/leaderboard" asChild>
        <Pressable className="mt-2 rounded-lg bg-secondary px-5 py-3">
          <Text className="font-semibold text-secondary-foreground">🏆 Bảng xếp hạng</Text>
        </Pressable>
      </Link>
    </View>
  );
}
