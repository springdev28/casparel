/**
 * @fileOverview Mobile screen role: defines the Expo Router Id screen or route layout.
 * System connection: composed by Expo Router and backed by auth, onboarding, purchases, secure storage, and the shared API.
 */
/**
 * One Learning List, in the order it is meant to be worked through.
 *
 * A Learning List is an ordered set rather than a folder, so the order is the
 * teaching and changing it is the point of this screen. It is two buttons per
 * row rather than a drag handle: a drag is a poor fit for a thumb on a small
 * row, it is unusable with a screen reader, and the product contract asks for
 * a non-drag alternative in any case. Two buttons are that alternative and are
 * also, on a phone, the better primary.
 *
 * Both writes are optimistic, because a row that waits for a round-trip before
 * it moves feels broken on a train. Both are recoverable: the order goes back
 * where it was and the screen says what did not save. The reorder sends the
 * whole order, which is what the endpoint takes and what makes it idempotent
 * -- the same order sent twice is the same order.
 *
 * The third thing this screen does is turn the list into a goal's path, which
 * is the join between organising and studying. It is not optimistic: it makes
 * something new, it takes the learner somewhere else, and the specification
 * asks for a review first -- so the preview sheet shows the steps and the
 * write happens when they say so.
 */
import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Badge } from '@workspace/edu-ds/components/native/badge';
import { Skeleton } from '@workspace/edu-ds/components/native/skeleton';
import { Empty } from '@workspace/edu-ds/components/native/empty';
import {
  getGetResourceListQueryKey,
  getListLearningGoalsQueryKey,
  getReviewListQualityQueryKey,
  getListResourceListsQueryKey,
  useBuildPathFromList,
  useGetResourceList,
  useReviewListQuality,
  useRemoveListItem,
  useReorderListItems,
} from '@workspace/api-client-react';
import type { ListItem, ResourceListWithItems } from '@workspace/api-client-react';
import { ErrorState } from '@/components/ErrorState';
import { PathPreviewSheet } from '@/components/PathPreviewSheet';
import { describeApiFailure } from '@/utils/api-failure';
import { useLanguage } from '@/contexts/LanguageContext';
import { useMotion } from '@/contexts/MotionContext';
import { moveItem } from '@/utils/reorder';
import { describeFinding } from '@/utils/list-quality';

function Item({
  item,
  index,
  total,
  busy,
  onOpen,
  onMove,
  onRemove,
}: {
  item: ListItem;
  index: number;
  total: number;
  busy: boolean;
  onOpen: () => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const colors = useColors();
  const { t } = useLanguage();
  return (
    <View
      style={[
        styles.item,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
          opacity: busy ? 0.6 : 1,
        },
      ]}
    >
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={item.resource.title}
        // Where it sits is state rather than name: a screen reader that has
        // just been told the list has five items does not need "3." read as
        // part of the title, but it does need to know this is the third.
        accessibilityHint={`${t('Position')} ${index + 1}/${total}`}
        style={({ pressed }) => [styles.itemMain, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Text
          style={[
            styles.position,
            { color: colors.mutedForeground, fontFamily: colors.fontFamily.sansSemiBold },
          ]}
        >
          {index + 1}
        </Text>
        <View style={styles.itemText}>
          <Text
            numberOfLines={2}
            style={[
              styles.itemTitle,
              { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold },
            ]}
          >
            {item.resource.title}
          </Text>
          <Text style={[styles.itemMeta, { color: colors.mutedForeground }]}>
            {item.resource.subject} · {item.resource.format}
          </Text>
        </View>
      </Pressable>
      <View style={styles.itemControls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('Move up')}: ${item.resource.title}`}
          accessibilityState={{ disabled: busy || index === 0 }}
          disabled={busy || index === 0}
          hitSlop={6}
          onPress={() => onMove(-1)}
          style={({ pressed }) => [
            styles.control,
            {
              borderColor: colors.border,
              borderRadius: colors.radius,
              backgroundColor: pressed ? colors.muted : 'transparent',
              opacity: index === 0 ? 0.35 : 1,
            },
          ]}
        >
          <Feather name="arrow-up" size={15} color={colors.foreground} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('Move down')}: ${item.resource.title}`}
          accessibilityState={{ disabled: busy || index === total - 1 }}
          disabled={busy || index === total - 1}
          hitSlop={6}
          onPress={() => onMove(1)}
          style={({ pressed }) => [
            styles.control,
            {
              borderColor: colors.border,
              borderRadius: colors.radius,
              backgroundColor: pressed ? colors.muted : 'transparent',
              opacity: index === total - 1 ? 0.35 : 1,
            },
          ]}
        >
          <Feather name="arrow-down" size={15} color={colors.foreground} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('Remove')}: ${item.resource.title}`}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          hitSlop={6}
          onPress={onRemove}
          style={({ pressed }) => [
            styles.control,
            {
              borderColor: colors.border,
              borderRadius: colors.radius,
              backgroundColor: pressed ? colors.muted : 'transparent',
            },
          ]}
        >
          <Feather name="trash-2" size={15} color={colors.destructiveText} />
        </Pressable>
      </View>
    </View>
  );
}

export default function ListScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { selection, success, warning } = useMotion();
  const { id } = useLocalSearchParams<{ id: string }>();
  const listId = Number(id);

  const { data, isLoading, isError, error, isFetching, refetch } =
    useGetResourceList(listId);
  const reorder = useReorderListItems();
  const remove = useRemoveListItem();

  const [pending, setPending] = React.useState<number | null>(null);
  const [writeError, setWriteError] = React.useState<string | null>(null);
  const [previewing, setPreviewing] = React.useState(false);
  /*
   * The review is asked for rather than shown: a list opens to what is in it,
   * and an unrequested verdict on somebody's choices is not what they came
   * for. Enabled only once they press, so the request is theirs too.
   */
  const [reviewing, setReviewing] = React.useState(false);
  const quality = useReviewListQuality(listId, {
    query: {
      queryKey: getReviewListQualityQueryKey(listId),
      enabled: reviewing && !!listId,
    },
  });
  const [buildFailure, setBuildFailure] = React.useState<string | null>(null);
  const buildPath = useBuildPathFromList();

  const key = getGetResourceListQueryKey(listId);
  const items = data?.items ?? [];

  /** Put the list back the way the server last described it. */
  function restore(previous: ResourceListWithItems | undefined) {
    if (previous) queryClient.setQueryData(key, previous);
  }

  async function move(index: number, delta: number) {
    if (pending !== null || !data) return;
    const moved = moveItem(items, index, delta);
    // A move off either end comes back as the same order; nothing to send.
    if (moved[index] === items[index]) return;
    const item = items[index];
    setPending(item.id);
    setWriteError(null);
    const previous = queryClient.getQueryData<ResourceListWithItems>(key);

    // Move it now; put it back if the server disagrees.
    queryClient.setQueryData<ResourceListWithItems>(key, (current) =>
      current ? { ...current, items: moved } : current,
    );
    selection();

    try {
      await reorder.mutateAsync({
        id: listId,
        data: { itemIds: moved.map((candidate) => candidate.id) },
      });
      await queryClient.invalidateQueries({ queryKey: key });
      success();
    } catch (failure) {
      restore(previous);
      warning();
      setWriteError(
        describeApiFailure(failure, t('That new order could not be saved.'), t),
      );
    } finally {
      setPending(null);
    }
  }

  async function drop(item: ListItem) {
    if (pending !== null || !data) return;
    setPending(item.id);
    setWriteError(null);
    const previous = queryClient.getQueryData<ResourceListWithItems>(key);

    queryClient.setQueryData<ResourceListWithItems>(key, (current) =>
      current
        ? {
            ...current,
            items: current.items.filter((candidate) => candidate.id !== item.id),
            itemCount: Math.max(0, current.itemCount - 1),
          }
        : current,
    );

    try {
      await remove.mutateAsync({ id: listId, itemId: item.id });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: key }),
        // The lists screen shows how many are in each, and it is one back.
        queryClient.invalidateQueries({ queryKey: getListResourceListsQueryKey() }),
      ]);
      success();
    } catch (failure) {
      restore(previous);
      warning();
      setWriteError(
        describeApiFailure(failure, t('That resource could not be removed.'), t),
      );
    } finally {
      setPending(null);
    }
  }

  /**
   * Turn this list into a goal path, and go to it.
   *
   * The server decides whether this list has been built into a path before, so
   * a second tap -- or a second visit next week -- opens the path that exists
   * rather than making another. Either way the learner ends up on the goal,
   * because that is what they asked for; the sheet only closes on success, so
   * a failure keeps the steps they were looking at on screen.
   */
  async function build() {
    if (!data || buildPath.isPending) return;
    setBuildFailure(null);
    try {
      const goal = await buildPath.mutateAsync({ id: listId, data: {} });
      await queryClient.invalidateQueries({
        queryKey: getListLearningGoalsQueryKey(),
      });
      success();
      setPreviewing(false);
      router.push(`/goals/${goal.id}`);
    } catch (failure) {
      warning();
      setBuildFailure(
        describeApiFailure(failure, t('That path could not be built. Try again.'), t),
      );
    }
  }

  if (isLoading) {
    return (
      <View style={[styles.flex, styles.padded, { backgroundColor: colors.background }]}>
        <Skeleton width="70%" height={24} />
        <Skeleton width="35%" height={16} />
        {[1, 2, 3].map((skeleton) => (
          <Skeleton key={skeleton} width="100%" height={72} borderRadius={12} />
        ))}
      </View>
    );
  }

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

  if (!data) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <Empty
          icon="bookmark"
          title={t('List not found')}
          description={t('It may have been deleted, or it belongs to another account.')}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.padded,
        {
          paddingBottom: insets.bottom + 24,
          ...(Platform.OS === 'web' ? { paddingTop: 16 } : {}),
        },
      ]}
    >
      <Text
        style={[
          styles.title,
          { color: colors.foreground, fontFamily: colors.fontFamily.sansBold },
        ]}
      >
        {data.name}
      </Text>
      <View style={styles.badges}>
        <Badge variant="secondary">{`${data.itemCount} ${t('resources')}`}</Badge>
      </View>
      {data.description ? (
        <Text
          style={[
            styles.description,
            { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
          ]}
        >
          {data.description}
        </Text>
      ) : null}

      {writeError ? (
        <View
          accessibilityRole="alert"
          style={[
            styles.notice,
            {
              backgroundColor: colors.destructive + '12',
              borderColor: colors.destructive,
              borderRadius: colors.radius,
            },
          ]}
        >
          <Feather name="alert-circle" size={16} color={colors.destructiveText} />
          <Text style={[styles.noticeText, { color: colors.foreground }]}>{writeError}</Text>
        </View>
      ) : null}

      {items.length === 0 ? (
        <Empty
          icon="bookmark"
          title={t('Nothing in this list yet')}
          description={t('Save a resource and add it to this list.')}
        />
      ) : (
        <View style={styles.items}>
          {items.map((item, index) => (
            <Item
              key={item.id}
              item={item}
              index={index}
              total={items.length}
              busy={pending === item.id}
              onOpen={() => router.push(`/resource/${item.resourceId}`)}
              onMove={(delta) => {
                void move(index, delta);
              }}
              onRemove={() => {
                void drop(item);
              }}
            />
          ))}
          {pending !== null ? (
            <View style={styles.savingRow}>
              <ActivityIndicator size="small" color={colors.mutedForeground} />
              <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
                {t('Saving…')}
              </Text>
            </View>
          ) : null}

          {reviewing ? (
            <View
              style={[
                styles.review,
                { borderColor: colors.border, borderRadius: colors.radius },
              ]}
            >
              <Text
                style={[
                  styles.reviewTitle,
                  { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold },
                ]}
              >
                {t('How this list looks')}
              </Text>
              {quality.isLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : quality.isError ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={quality.isFetching}
                  onPress={() => void quality.refetch()}
                >
                  <Text style={{ color: colors.primary, fontSize: 13 }}>
                    {quality.isFetching ? t('Loading…') : t('Retry')}
                  </Text>
                </Pressable>
              ) : (
                <>
                  {(quality.data?.findings ?? [])
                    .map((finding) => describeFinding(finding, t))
                    .filter((sentence): sentence is string => sentence !== null)
                    .map((sentence) => (
                      <View key={sentence} style={styles.reviewRow}>
                        <Feather name="info" size={14} color={colors.mutedForeground} />
                        <Text
                          style={[
                            styles.reviewText,
                            { color: colors.foreground, fontFamily: colors.fontFamily.sans },
                          ]}
                        >
                          {sentence}
                        </Text>
                      </View>
                    ))}
                  {(quality.data?.findings ?? []).length === 0 ? (
                    <Text style={[styles.reviewText, { color: colors.mutedForeground }]}>
                      {t('Nothing stands out.')}
                    </Text>
                  ) : null}
                  {/* What was looked at, so the absence of a finding is not
                      read as a claim about everything. */}
                  <Text style={[styles.reviewFootnote, { color: colors.mutedForeground }]}>
                    {t('Checked for one site, one format, repeated links and level. Whether the list is complete is your call.')}
                  </Text>
                </>
              )}
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Check this list')}
              onPress={() => setReviewing(true)}
              style={({ pressed }) => [styles.checkList, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Feather name="search" size={15} color={colors.primary} />
              <Text
                style={[
                  styles.checkListText,
                  { color: colors.primary, fontFamily: colors.fontFamily.sansSemiBold },
                ]}
              >
                {t('Check this list')}
              </Text>
            </Pressable>
          )}

          {/* The way out of organising and into studying. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Build a learning path')}
            disabled={pending !== null}
            onPress={() => {
              setBuildFailure(null);
              setPreviewing(true);
            }}
            style={({ pressed }) => [
              styles.buildPath,
              {
                borderColor: colors.primary,
                borderRadius: colors.radius,
                backgroundColor: pressed ? colors.muted : 'transparent',
                opacity: pending !== null ? 0.5 : 1,
              },
            ]}
          >
            <Feather name="target" size={16} color={colors.primary} />
            <Text
              style={[
                styles.buildPathText,
                { color: colors.primary, fontFamily: colors.fontFamily.sansSemiBold },
              ]}
            >
              {t('Build a learning path')}
            </Text>
          </Pressable>
        </View>
      )}

      <PathPreviewSheet
        visible={previewing}
        listName={data.name}
        items={items}
        building={buildPath.isPending}
        failure={buildFailure}
        onClose={() => setPreviewing(false)}
        onBuild={() => {
          void build();
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  padded: { padding: 16, gap: 12 },
  title: { fontSize: 22, letterSpacing: -0.3 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  description: { fontSize: 14, lineHeight: 20 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    padding: 10,
  },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 17 },
  items: { gap: 8 },
  item: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 72,
  },
  itemMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  position: { fontSize: 13, minWidth: 16, textAlign: 'center' },
  itemText: { flex: 1, gap: 2 },
  itemTitle: { fontSize: 15, lineHeight: 20 },
  itemMeta: { fontSize: 12 },
  itemControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  control: {
    width: 32,
    height: 32,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 2 },
  buildPath: {
    marginTop: 6,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  buildPathText: { fontSize: 15 },
  checkList: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingTop: 4,
  },
  checkListText: { fontSize: 14 },
  review: { borderWidth: 1, padding: 12, gap: 8, marginTop: 4 },
  reviewTitle: { fontSize: 14 },
  reviewRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  reviewText: { flex: 1, fontSize: 13, lineHeight: 18 },
  reviewFootnote: { fontSize: 12, lineHeight: 16 },
});
