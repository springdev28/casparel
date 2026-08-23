/**
 * @fileOverview Mobile workflow role: lists the learner's persistent resource collections.
 * System connection: reads the generated list API and links each collection to its native detail route.
 */
import React from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Empty } from '@workspace/edu-ds/components/native/empty';
import { Skeleton } from '@workspace/edu-ds/components/native/skeleton';
import { useListResourceLists, type ResourceList } from '@workspace/api-client-react';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { ErrorState } from '@/components/ErrorState';

function ListCard({ item, onPress }: { item: ResourceList; onPress: () => void }) {
  const colors = useColors();
  return (
    <AnimatedPressable
      haptic="selection"
      onPress={onPress}
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: colors.primary + '14', borderRadius: colors.radius }]}>
        <Feather name="list" color={colors.primary} size={20} />
      </View>
      <View style={styles.cardText}>
        <Text
          numberOfLines={1}
          style={[styles.cardTitle, { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }]}
        >
          {item.name}
        </Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }}>
          {item.itemCount} {item.itemCount === 1 ? 'resource' : 'resources'}
        </Text>
      </View>
      <Feather name="chevron-right" color={colors.mutedForeground} size={20} />
    </AnimatedPressable>
  );
}

export default function LearningListsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const query = useListResourceLists();
  const failed = query.isError && query.data === undefined;
  const [refreshing, setRefreshing] = React.useState(false);

  async function refresh() {
    setRefreshing(true);
    await query.refetch();
    setRefreshing(false);
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: colors.fontFamily.sansBold }]}>Learning lists</Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }}>
          Saved resources become ordered learning paths here.
        </Text>
      </View>

      {query.isLoading ? (
        <View style={styles.loadingStack}>
          {[1, 2, 3].map((item) => <Skeleton key={item} width="100%" height={72} borderRadius={8} />)}
        </View>
      ) : failed ? (
        <ErrorState
          error={query.error}
          retrying={query.isFetching}
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : (
        <FlatList
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
          data={query.data ?? []}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={
            <Empty
              icon="bookmark"
              title="No learning lists yet"
              description="Open a resource and save it to create your first list."
            />
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
          renderItem={({ item }) => (
            <ListCard item={item} onPress={() => router.push(`/lists/${item.id}`)} />
          )}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { gap: 5, paddingBottom: 12, paddingHorizontal: 16, paddingTop: 16 },
  title: { fontSize: 24, letterSpacing: -0.4 },
  loadingStack: { gap: 10, padding: 16 },
  listContent: { gap: 10, padding: 16 },
  card: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', gap: 12, padding: 14 },
  icon: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  cardText: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 16 },
});
