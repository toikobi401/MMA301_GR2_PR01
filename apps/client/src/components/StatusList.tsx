import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Card } from './Card';
import { useTheme } from '@/theme';

export interface ServiceStatus {
  name: string;
  up: boolean;
}

export interface StatusListProps {
  services: ServiceStatus[];
  loading?: boolean;
}

export function StatusList({ services, loading = false }: StatusListProps) {
  const theme = useTheme();

  return (
    <Card>
      <Text
        style={[
          theme.typography.label,
          {
            color: theme.colors.textSecondary,
            padding: theme.spacing.lg,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: theme.colors.border,
            textTransform: 'uppercase',
            letterSpacing: 0.8,
          },
        ]}
      >
        Service status
      </Text>

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

          {loading ? (
            <ActivityIndicator size="small" color={theme.colors.textMuted} />
          ) : (
            <View style={styles.status}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: service.up ? theme.colors.success : theme.colors.border },
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
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
