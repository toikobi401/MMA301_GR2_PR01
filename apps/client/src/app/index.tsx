import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  StatusDot,
  Text,
} from '@/components/ui';
import { api, apiBaseUrl } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useTheme } from '@/lib/theme';

type Readiness = { database: boolean; cache: boolean };
type Phase = 'loading' | 'up' | 'down';

/** Lobby. Neutral shadcn styling; the felt is reserved for the table. */
export default function HomeScreen() {
  const { isDark, toggle } = useTheme();
  const [phase, setPhase] = useState<Phase>('loading');
  const [readiness, setReadiness] = useState<Readiness | null>(null);

  const check = useCallback(async () => {
    setPhase('loading');
    try {
      const data = await api.get<Readiness>('/health/ready');
      setReadiness(data);
      setPhase('up');
    } catch {
      setReadiness(null);
      setPhase('down');
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const services = [
    { name: 'API server', up: phase === 'up' },
    { name: 'MongoDB', up: readiness?.database ?? false },
    { name: 'Redis', up: readiness?.cache ?? false },
  ];

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="p-6 items-center"
    >
      {/* Capped width so the layout reads as a column on a desktop browser
          rather than stretching across the viewport. */}
      <View className="w-full max-w-[680px] gap-6">
        <View className="flex-row items-start justify-between">
          <View className="gap-1">
            <Text variant="label" tone="muted">
              MMA301 · Group 2
            </Text>
            <Text variant="title">Texas Hold'em</Text>
            <Text tone="muted">Play money. No real currency anywhere.</Text>
          </View>

          <Button
            variant="outline"
            size="icon"
            accessibilityLabel={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            onPress={toggle}
          >
            <Text className="text-base">{isDark ? '☀' : '☾'}</Text>
          </Button>
        </View>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Service status</CardTitle>
            {phase === 'loading' ? (
              <ActivityIndicator size="small" />
            ) : (
              <Badge
                label={phase === 'up' ? 'Online' : 'Offline'}
                variant={phase === 'up' ? 'success' : 'destructive'}
              />
            )}
          </CardHeader>

          <CardContent className="gap-0">
            {services.map((service, index) => (
              <View
                key={service.name}
                className={cn(
                  'flex-row items-center justify-between py-3',
                  index > 0 && 'border-t border-border',
                )}
              >
                <Text>{service.name}</Text>
                <View className="flex-row items-center gap-2">
                  <StatusDot className={service.up ? 'bg-success' : 'bg-muted-foreground'} />
                  <Text variant="caption" tone={service.up ? 'success' : 'muted'}>
                    {service.up ? 'Up' : 'Down'}
                  </Text>
                </View>
              </View>
            ))}
          </CardContent>
        </Card>

        <View className="flex-row gap-2">
          <Button variant="outline" label="Check again" onPress={() => void check()} className="flex-1" />
          <Link href="/table" asChild>
            <Button label="View table" className="flex-1" />
          </Link>
        </View>

        {phase === 'down' && (
          <Text variant="caption" tone="muted">
            Cannot reach {apiBaseUrl}. On a physical device set EXPO_PUBLIC_API_URL to your
            computer's address on the local network.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}
