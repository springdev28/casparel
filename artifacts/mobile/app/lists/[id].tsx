/**
 * @fileOverview Mobile workflow role: shows the durable ordered resources inside one learning list.
 * System connection: reads list detail from the generated API and links list items back to resource credibility screens.
 */
import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Button } from '@workspace/edu-ds/components/native/button';
import { Empty } from '@workspace/edu-ds/components/native/empty';
import { Skeleton } from '@workspace/edu-ds/components/native/skeleton';
import {
  getGetResourceListQueryKey,
  useGetResourceList,
  useReorderListItems,
  type ListItem,
} from '@workspace/api-client-react';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { ErrorState } from '@/components/ErrorState';
import { triggerHaptic } from '@/utils/haptics';
import { moveListItem } from '@/utils/list-order';

function ResourceRow({
  canMoveDown,
  canMoveUp,
  displayPosition,
  item,
  moving,
  onMoveDown,
  onMoveUp,
  onPress,
}: {
  canMoveDown: boolean;
  canMoveUp: boolean;
  displayPosition: number;
  item: ListItem;
  moving: boolean;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.item,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
      ]}
    >
      <AnimatedPressable haptic="selection" onPress={onPress} style={styles.itemMain}>
        <View style={[styles.position, { backgroundColor: colors.primary + '14', borderRadius: 999 }]}>
          <Text style={{ color: colors.primary, fontFamily: colors.fontFamily.sansBold }}>
            {displayPosition}
          </Text>
        </View>
        <View style={styles.itemText}>
          <Text
            numberOfLines={2}
            style={[styles.itemTitle, { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }]}
          >
            {item.resource.title}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }}>
            {item.resource.format} · {item.resource.subject}
          </Text>
          {item.note ? (
            <Text
              numberOfLines={2}
              style={[styles.note, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}
            >
              {item.note}
            </Text>
          ) : null}
        </View>
        <Feather name="chevron-right" color={colors.mutedForeground} size={20} />
      </AnimatedPressable>
      <View style={[styles.reorderControls, { borderLeftColor: colors.border }]}>
        <AnimatedPressable
          accessibilityLabel={`Move ${item.resource.title} earlier`}
          disabled={!canMoveUp || moving}
          haptic="selection"
          onPress={onMoveUp}
          pressedScale={0.9}
          style={[styles.reorderButton, (!canMoveUp || moving) && styles.disabledControl]}
        >
          <Feather name="arrow-up" color={colors.foreground} size={18} />
        </AnimatedPressable>
        <AnimatedPressable
          accessibilityLabel={`Move ${item.resource.title} later`}
          disabled={!canMoveDown || moving}
          haptic="selection"
          onPress={onMoveDown}
          pressedScale={0.9}
          style={[styles.reorderButton, (!canMoveDown || moving) && styles.disabledControl]}
        >
          <Feather name="arrow-down" color={colors.foreground} size={18} />
        </AnimatedPressable>
      </View>
    </View>
  );
}

export default function LearningListDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const listId = Number(id);
  const validListId = Number.isSafeInteger(listId) && listId > 0;
  const query = useGetResourceList(listId, {
    query: { enabled: validListId, queryKey: getGetResourceListQueryKey(listId) },
  });
  const failed = query.isError && query.data === undefined;
  const reorder = useReorderListItems();
  const [orderedItems, setOrderedItems] = React.useState<ListItem[]>([]);
  const [reorderError, setReorderError] = React.useState('');
  const [refreshing, setRefreshing] = React.useState(false);

  React.useEffect(() => {
    if (query.data) setOrderedItems(query.data.items);
  }, [query.data]);

  async function refresh() {
    setRefreshing(true);
    await query.refetch();
    setRefreshing(false);
  }

  async function moveItem(index: number, direction: -1 | 1) {
    if (reorder.isPending) return;
    const previous = orderedItems;
    const next = moveListItem(orderedItems, index, direction);
    if (!next) return;
    setOrderedItems(next);
    setReorderError('');

    try {
      await reorder.mutateAsync({
        id: listId,
        data: { itemIds: next.map((item) => item.id) },
      });
      await queryClient.invalidateQueries({ queryKey: getGetResourceListQueryKey(listId) });
    } catch (error) {
      setOrderedItems(previous);
      setReorderError(
        error instanceof Error && error.message
          ? error.message
          : 'The new order could not be saved. Please try again.',
      );
      void triggerHaptic('error');
    }
  }

  if (!validListId) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Empty icon="alert-circle" title="Invalid learning-list link" />
      </View>
    );
  }

  if (query.isLoading) {
    return (
      <View style={[styles.loadingStack, { backgroundColor: colors.background }]}>
        <Skeleton width="72%" height={28} />
        <Skeleton width="100%" height={86} borderRadius={8} />
        <Skeleton width="100%" height={86} borderRadius={8} />
      </View>
    );
  }

  if (failed) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ErrorState
          error={query.error}
          retrying={query.isFetching}
          onRetry={() => {
            void query.refetch();
          }}
        />
      </View>
    );
  }

  if (!query.data) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Empty icon="alert-circle" title="Learning list not found" />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      showsVerticalScrollIndicator={false}
      style={{ backgroundColor: colors.background }}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: colors.fontFamily.sansBold }]}>
          {query.data.name}
        </Text>
        {query.data.description ? (
          <Text style={{ color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }}>
            {query.data.description}
          </Text>
        ) : null}
        <Text style={{ color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }}>
          {query.data.itemCount} {query.data.itemCount === 1 ? 'resource' : 'resources'} in saved order
        </Text>
        {query.data.items.length > 1 ? (
          <Text style={{ color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }}>
            Use the arrow controls to choose the order learners will follow.
          </Text>
        ) : null}
      </View>

      {reorderError ? (
        <View
          accessibilityRole="alert"
          style={[
            styles.writeError,
            {
              backgroundColor: colors.destructive + '12',
              borderColor: colors.destructive,
              borderRadius: colors.radius,
            },
          ]}
        >
          <Feather name="alert-circle" color={colors.destructiveText} size={16} />
          <Text style={{ color: colors.destructiveText, flex: 1, fontFamily: colors.fontFamily.sans }}>
            {reorderError}
          </Text>
        </View>
      ) : null}

      {query.data.items.length === 0 ? (
        <Empty
          icon="bookmark"
          title="This list is empty"
          description="Save a resource here before turning it into a learning path."
        />
      ) : (
        <View style={styles.items}>
          {orderedItems.map((item, index) => (
            <ResourceRow
              canMoveDown={index < orderedItems.length - 1}
              canMoveUp={index > 0}
              displayPosition={index + 1}
              item={item}
              key={item.id}
              moving={reorder.isPending}
              onMoveDown={() => {
                void moveItem(index, 1);
              }}
              onMoveUp={() => {
                void moveItem(index, -1);
              }}
              onPress={() => router.push(`/resource/${item.resourceId}`)}
            />
          ))}
        </View>
      )}

      {query.data.items.length > 0 ? (
        <Button onPress={() => router.push(`/lists/${listId}/path-review`)} size="lg">
          Review as a learning path
        </Button>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center' },
  loadingStack: { flex: 1, gap: 12, padding: 16 },
  content: { gap: 18, padding: 16 },
  header: { gap: 6 },
  title: { fontSize: 24, letterSpacing: -0.4 },
  items: { gap: 10 },
  item: { borderWidth: 1, flexDirection: 'row', overflow: 'hidden' },
  itemMain: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 12, padding: 13 },
  position: { alignItems: 'center', height: 34, justifyContent: 'center', width: 34 },
  itemText: { flex: 1, gap: 3 },
  itemTitle: { fontSize: 15, lineHeight: 20 },
  note: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  reorderControls: { borderLeftWidth: StyleSheet.hairlineWidth, justifyContent: 'center' },
  reorderButton: { alignItems: 'center', height: 40, justifyContent: 'center', width: 42 },
  disabledControl: { opacity: 0.3 },
  writeError: { alignItems: 'flex-start', borderWidth: 1, flexDirection: 'row', gap: 8, padding: 10 },
});
