import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api, apiBaseUrl } from './src/lib/api';
import { useTheme } from './src/theme';

type Readiness = { database: boolean; cache: boolean };
type Status = 'loading' | 'up' | 'down';

export default function App() {
  const theme = useTheme();
  const [status, setStatus] = useState<Status>('loading');
  const [readiness, setReadiness] = useState<Readiness | null>(null);

  const check = useCallback(async () => {
    setStatus('loading');
    try {
      const data = await api.get<Readiness>('/health/ready');
      setReadiness(data);
      setStatus('up');
    } catch {
      setReadiness(null);
      setStatus('down');
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const services = [
    { name: 'API server', up: status === 'up' },
    { name: 'PostgreSQL', up: readiness?.database ?? false },
    { name: 'Redis', up: readiness?.cache ?? false },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />

      <View style={[styles.container, { padding: theme.spacing.xl }]}>
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
          Shared infrastructure is wired up. Feature screens drop in once the group picks a topic.
        </Text>

        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
              marginTop: theme.spacing.xl,
            },
          ]}
        >
          {services.map((service, index) => (
            <View
              key={service.name}
              style={[
                styles.row,
                {
                  padding: theme.spacing.lg,
                  borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                  borderTopColor: theme.colors.border,
                },
              ]}
            >
              <Text style={[theme.typography.body, { color: theme.colors.textPrimary }]}>
                {service.name}
              </Text>

              {status === 'loading' ? (
                <ActivityIndicator size="small" color={theme.colors.textMuted} />
              ) : (
                <View style={styles.statusGroup}>
                  <View
                    style={[
                      styles.dot,
                      {
                        backgroundColor: service.up ? theme.colors.success : theme.colors.border,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      theme.typography.caption,
                      { color: service.up ? theme.colors.success : theme.colors.textMuted },
                    ]}
                  >
                    {service.up ? 'Up' : 'Down'}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>

        <Pressable
          onPress={() => void check()}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: theme.colors.accent,
              borderRadius: theme.radius.md,
              marginTop: theme.spacing.lg,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={[theme.typography.bodyStrong, { color: theme.colors.onAccent }]}>
            Check again
          </Text>
        </Pressable>

        {status === 'down' && (
          <Text
            style={[
              theme.typography.caption,
              { color: theme.colors.textMuted, marginTop: theme.spacing.md },
            ]}
          >
            Cannot reach {apiBaseUrl}. On a real device set EXPO_PUBLIC_API_URL to your computer's
            LAN address.
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1 },
  eyebrow: { fontSize: 12, fontWeight: '500', letterSpacing: 1 },
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  button: { alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
});
