import React from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Badge } from '@workspace/edu-ds/components/native/badge';
import { Empty } from '@workspace/edu-ds/components/native/empty';
import { Skeleton } from '@workspace/edu-ds/components/native/skeleton';
import { useListClasses } from '@workspace/api-client-react';
import { ErrorState } from '@/components/ErrorState';
import { Feather } from '@expo/vector-icons';
import type { Class } from '@workspace/api-client-react';

function ClassCard({ item, onPress }: { item: Class; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <View
          style={[
            styles.classIcon,
            { backgroundColor: colors.accent + '15', borderRadius: colors.radius - 2 },
          ]}
        >
          <Feather name="users" size={20} color={colors.accent} />
        </View>
        <View style={styles.cardHeaderText}>
          <Text
            style={[
              styles.className,
              { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold },
            ]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          <View style={styles.badgeRow}>
            <Badge variant="success">{item.subject}</Badge>
            <Badge variant="secondary">{item.gradeLevel}</Badge>
          </View>
        </View>
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      </View>

      {item.description ? (
        <Text
          style={[
            styles.description,
            { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
          ]}
          numberOfLines={2}
        >
          {item.description}
        </Text>
      ) : null}

      <View style={styles.cardFooter}>
        <Feather name="users" size={12} color={colors.mutedForeground} />
        <Text
          style={[
            styles.memberCount,
            { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
          ]}
        >
          {item.memberCount ?? 0} member{(item.memberCount ?? 0) !== 1 ? 's' : ''}
        </Text>
      </View>
    </Pressable>
  );
}

function ClassSkeleton() {
  const colors = useColors();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
      ]}
    >
      <View style={styles.cardHeader}>
        <Skeleton width={44} height={44} borderRadius={8} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width="70%" height={16} />
          <Skeleton width="45%" height={14} />
        </View>
      </View>
    </View>
  );
}

export default function ClassesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data, isLoading, isError, error, isFetching, refetch } = useListClasses();

  // Request failed and nothing is cached: say so instead of rendering
  // "No classes yet", which reads as "your account is empty".
  const failed = isError && data === undefined;

  const [refreshing, setRefreshing] = React.useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
            paddingTop: insets.top + webTopPad + 12,
          },
        ]}
      >
        <Text
          style={[
            styles.headerTitle,
            { color: colors.foreground, fontFamily: colors.fontFamily.sansBold },
          ]}
        >
          Classes
        </Text>
      </View>

      {isLoading ? (
        <FlatList
          data={[1, 2, 3, 4]}
          keyExtractor={(item) => String(item)}
          renderItem={() => <ClassSkeleton />}
          contentContainerStyle={styles.listContent}
          scrollEnabled={false}
        />
      ) : failed ? (
        <ErrorState
          error={error}
          retrying={isFetching}
          onRetry={() => {
            void refetch();
          }}
          style={{ paddingTop: 24 }}
        />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <ClassCard item={item} onPress={() => router.push(`/class/${item.id}`)} />
          )}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 80 },
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <Empty
              icon="users"
              title="No classes yet"
              description="Classes you join or create will appear here"
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  headerTitle: { fontSize: 22, letterSpacing: -0.3 },
  listContent: { padding: 16, gap: 10 },
  card: {
    borderWidth: 1,
    padding: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  classIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardHeaderText: { flex: 1, gap: 6 },
  className: { fontSize: 16 },
  badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  description: { fontSize: 13, lineHeight: 18 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  memberCount: { fontSize: 12 },
});
