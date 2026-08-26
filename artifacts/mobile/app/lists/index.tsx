/**
 * @fileOverview Mobile screen role: defines the Expo Router Index screen or route layout.
 * System connection: composed by Expo Router and backed by auth, onboarding, purchases, secure storage, and the shared API.
 */
/**
 * The Learning Lists on this account.
 *
 * The save sheet could make one of these and add to it, and the phone had
 * nowhere to show it: a learner could create "Revision for the mock" from a
 * resource, and then never see it again on the device they study on. A list
 * that cannot be opened is a name in a sheet rather than an ordered set of
 * things to work through.
 *
 * Ordered by what is in them: a list somebody has been filling is more likely
 * the one they came here for than an empty one made last week. Ties go to the
 * most recently created.
 */
import React from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Skeleton } from '@workspace/edu-ds/components/native/skeleton';
import { Empty } from '@workspace/edu-ds/components/native/empty';
import { useListResourceLists } from '@workspace/api-client-react';
import type { ResourceList } from '@workspace/api-client-react';
import { ErrorState } from '@/components/ErrorState';
import { useLanguage } from '@/contexts/LanguageContext';

function byUsefulness(a: ResourceList, b: ResourceList) {
  if (a.itemCount !== b.itemCount) return b.itemCount - a.itemCount;
  return String(b.createdAt).localeCompare(String(a.createdAt));
}

function ListRow({ list, onPress }: { list: ResourceList; onPress: () => void }) {
  const colors = useColors();
  const { t } = useLanguage();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={list.name}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <View style={styles.rowText}>
        <Text
          numberOfLines={2}
          style={[
            styles.rowTitle,
            { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold },
          ]}
        >
          {list.name}
        </Text>
        <Text
          style={[
            styles.rowMeta,
            { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
          ]}
        >
          {list.itemCount} {t('resources')}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

export default function ListsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useLanguage();
  const { data, isLoading, isError, error, isFetching, refetch } =
    useListResourceLists();

  const lists = React.useMemo(
    () => [...(data ?? [])].sort(byUsefulness),
    [data],
  );

  if (isLoading) {
    return (
      <View style={[styles.flex, styles.padded, { backgroundColor: colors.background }]}>
        {[1, 2, 3].map((key) => (
          <Skeleton key={key} width="100%" height={68} borderRadius={12} />
        ))}
      </View>
    );
  }

  // A failure is not an empty library: "no lists yet" beside a dropped request
  // is the app telling somebody their work is gone.
  if (isError && data === undefined) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <ErrorState
          error={error}
          retrying={isFetching}
          onRetry={() => {
            void refetch();
          }}
          style={{ paddingTop: 24 }}
        />
      </View>
    );
  }

  return (
    <FlatList
      style={[styles.flex, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.padded, { paddingBottom: insets.bottom + 24 }]}
      data={lists}
      keyExtractor={(list) => String(list.id)}
      renderItem={({ item }) => (
        <ListRow list={item} onPress={() => router.push(`/lists/${item.id}`)} />
      )}
      refreshControl={
        <RefreshControl
          refreshing={isFetching && !isLoading}
          onRefresh={() => {
            void refetch();
          }}
          tintColor={colors.mutedForeground}
        />
      }
      ListEmptyComponent={
        <Empty
          icon="bookmark"
          title={t('No learning lists yet')}
          description={t('Save a resource and add it to a list to start one.')}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  padded: { padding: 16, gap: 10 },
  row: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    // Above the 44pt touch target both stores ask for.
    minHeight: 68,
  },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 16, letterSpacing: -0.2 },
  rowMeta: { fontSize: 12 },
});
