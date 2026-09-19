import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { StatusList, type ServiceStatus } from '@/components/StatusList';
import { api, apiBaseUrl } from '@/lib/api';
import { useTheme } from '@/theme';

type Readiness = { database: boolean; cache: boolean };
type Phase = 'loading' | 'up' | 'down';

/**
 * One screen for every platform. `npm run web` renders it in the browser,
 * `npm start` renders it on device — same file, same components.
 */
export default function HomeScreen() {
  const theme = useTheme();
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

  const services: ServiceStatus[] = [
    { name: 'API server', up: phase === 'up' },
    { name: 'MongoDB', up: readiness?.database ?? false },
    { name: 'Redis', up: readiness?.cache ?? false },
  ];

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={[styles.content, { padding: theme.spacing.xl }]}
    >
      <View style={styles.inner}>
        <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>MMA301 · GROUP 2</Text>

        <Text
          style={[
            theme.typography.title,
            { color: theme.colors.textPrimary, marginTop: theme.spacing.xs },
          ]}
        >
          Project shell
        </Text>

        <Text
          style={[
            theme.typography.body,
            { color: theme.colors.textSecondary, marginTop: theme.spacing.sm },
          ]}
        >
          One codebase for iOS, Android, and web. Feature screens drop into src/app once the
          group picks a topic.
        </Text>

        <View style={{ marginTop: theme.spacing.xl }}>
          <StatusList services={services} loading={phase === 'loading'} />
        </View>

        <View style={{ marginTop: theme.spacing.lg }}>
          <Button label="Check again" onPress={() => void check()} />
        </View>

        {phase === 'down' && (
          <Text
            style={[
              theme.typography.caption,
              { color: theme.colors.textMuted, marginTop: theme.spacing.md },
            ]}
          >
            Cannot reach {apiBaseUrl}. On a physical device set EXPO_PUBLIC_API_URL to your
            computer's LAN address.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, alignItems: 'center' },
  // Caps line length on desktop while staying full-width on a phone.
  inner: { width: '100%', maxWidth: 680 },
  eyebrow: { fontSize: 12, fontWeight: '500', letterSpacing: 1 },
});
