/**
 * @fileOverview Native Learning List detail and owner management flow.
 * System connection: reads one generated ResourceListWithItems contract and keeps list caches coherent after writes.
 */
import React from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Button } from '@workspace/edu-ds/components/native/button';
import { Empty } from '@workspace/edu-ds/components/native/empty';
import { Skeleton } from '@workspace/edu-ds/components/native/skeleton';
import type { ListItem } from '@workspace/api-client-react';
import {
  getGetResourceListQueryKey,
  getListResourceListsQueryKey,
  getListSharedResourceListsQueryKey,
  useDeleteResourceList,
  useGetMe,
  useGetResourceList,
  useRemoveListItem,
  useUpdateResourceList,
} from '@workspace/api-client-react';
import { ErrorState } from '@/components/ErrorState';
import { useLanguage } from '@/contexts/LanguageContext';
import { useMotion } from '@/contexts/MotionContext';
import { describeApiFailure } from '@/utils/api-failure';
import { formatLabel } from '@/utils/labels';

function ResourceRow({ item, editable, removing, onOpen, onRemove }: {
  item: ListItem;
  editable: boolean;
  removing: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const colors = useColors();
  const { t } = useLanguage();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.resource.title}, ${t('Open resource')}`}
      onPress={onOpen}
      style={({ pressed }) => [styles.resourceCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, opacity: pressed ? 0.78 : 1 }]}
    >
      <View style={[styles.resourceIcon, { backgroundColor: colors.primary + '16', borderRadius: colors.radius }]}>
        <Feather name="book-open" size={18} color={colors.primary} />
      </View>
      <View style={styles.resourceCopy}>
        <Text numberOfLines={2} style={[styles.resourceTitle, { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }]}>
          {item.resource.title}
        </Text>
        <Text numberOfLines={1} style={[styles.resourceMeta, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
          {formatLabel(item.resource.format, t)} · {item.resource.subject}
        </Text>
      </View>
      {editable ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('Remove from list')}: ${item.resource.title}`}
          disabled={removing}
          onPress={(event) => { event.stopPropagation(); onRemove(); }}
          hitSlop={10}
          style={({ pressed }) => [styles.removeButton, { opacity: removing ? 0.4 : pressed ? 0.6 : 1 }]}
        >
          <Feather name="x" size={19} color={colors.destructiveText} />
        </Pressable>
      ) : (
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      )}
    </Pressable>
  );
}

export default function ListDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const { success, warning } = useMotion();
  const params = useLocalSearchParams<{ id: string }>();
  const listId = Number.parseInt(params.id, 10);
  const validId = Number.isFinite(listId) && listId > 0;
  const listQuery = useGetResourceList(validId ? listId : 0, {
    query: {
      queryKey: getGetResourceListQueryKey(validId ? listId : 0),
      enabled: validId,
    },
  });
  const { data: me } = useGetMe();
  const updateList = useUpdateResourceList();
  const deleteList = useDeleteResourceList();
  const removeItem = useRemoveListItem();
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [failure, setFailure] = React.useState<string | null>(null);
  const [removingId, setRemovingId] = React.useState<number | null>(null);

  const list = listQuery.data;
  const editable = Boolean(list && me && list.ownerId === me.id);

  React.useEffect(() => {
    if (!list || editing) return;
    setName(list.name);
    setDescription(list.description ?? '');
  }, [list, editing]);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetResourceListQueryKey(listId) }),
      queryClient.invalidateQueries({ queryKey: getListResourceListsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListSharedResourceListsQueryKey() }),
    ]);
  }

  async function saveChanges() {
    const trimmed = name.trim();
    if (!trimmed || !editable || updateList.isPending) return;
    setFailure(null);
    try {
      await updateList.mutateAsync({ id: listId, data: { name: trimmed, description: description.trim() } });
      await refresh();
      success();
      setEditing(false);
    } catch (error) {
      setFailure(describeApiFailure(error, t('Could not update that learning list. Try again.'), t));
    }
  }

  async function confirmDelete() {
    Alert.alert(
      t('Delete learning list?'),
      t('The list will be deleted. Resources saved in your library will stay there.'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setFailure(null);
              try {
                await deleteList.mutateAsync({ id: listId });
                await refresh();
                success();
                router.replace('/lists');
              } catch (error) {
                warning();
                setFailure(describeApiFailure(error, t('Could not delete that learning list. Try again.'), t));
              }
            })();
          },
        },
      ],
    );
  }

  function confirmRemove(item: ListItem) {
    Alert.alert(
      t('Remove from list?'),
      t('The resource will stay saved in your library.'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Remove'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setRemovingId(item.id);
              setFailure(null);
              try {
                await removeItem.mutateAsync({ id: listId, itemId: item.id });
                await refresh();
                success();
              } catch (error) {
                warning();
                setFailure(describeApiFailure(error, t('Could not remove that resource. Try again.'), t));
              } finally {
                setRemovingId(null);
              }
            })();
          },
        },
      ],
    );
  }

  if (!validId) {
    return <View style={[styles.flex, { backgroundColor: colors.background }]}><Empty icon="alert-circle" title={t('Learning list not found')} /></View>;
  }

  if (listQuery.isLoading) {
    return <View style={[styles.flex, styles.content, { backgroundColor: colors.background }]}><Skeleton width="70%" height={28} /><Skeleton width="100%" height={88} borderRadius={12} /><Skeleton width="100%" height={88} borderRadius={12} /></View>;
  }

  if (listQuery.isError && !list) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <ErrorState error={listQuery.error} retrying={listQuery.isFetching} onRetry={() => { void listQuery.refetch(); }} />
      </View>
    );
  }

  if (!list) {
    return <View style={[styles.flex, { backgroundColor: colors.background }]}><Empty icon="alert-circle" title={t('Learning list not found')} /></View>;
  }

  return (
    <FlatList
      style={[styles.flex, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 36 : 24) }]}
      data={list.items}
      keyExtractor={(item) => String(item.id)}
      refreshControl={<RefreshControl refreshing={listQuery.isFetching && !listQuery.isLoading} onRefresh={() => { void listQuery.refetch(); }} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View style={styles.headerStack}>
          {editing ? (
            <View style={[styles.editCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <TextInput
                value={name}
                onChangeText={setName}
                maxLength={120}
                accessibilityLabel={t('List name')}
                placeholder={t('List name')}
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border, borderRadius: colors.radius, fontFamily: colors.fontFamily.sans }]}
              />
              <TextInput
                value={description}
                onChangeText={setDescription}
                maxLength={500}
                multiline
                accessibilityLabel={t('Description (optional)')}
                placeholder={t('Description (optional)')}
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, styles.descriptionInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border, borderRadius: colors.radius, fontFamily: colors.fontFamily.sans }]}
              />
              <View style={styles.actionRow}>
                <Button variant="outline" style={styles.actionButton} onPress={() => { setFailure(null); setEditing(false); }}>{t('Cancel')}</Button>
                <Button style={styles.actionButton} loading={updateList.isPending} disabled={!name.trim()} onPress={() => { void saveChanges(); }}>{t('Save changes')}</Button>
              </View>
            </View>
          ) : (
            <View style={styles.listHeading}>
              <View style={styles.headingCopy}>
                <Text style={[styles.heading, { color: colors.foreground, fontFamily: colors.fontFamily.sansBold }]}>{list.name}</Text>
                {list.description ? <Text style={[styles.description, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>{list.description}</Text> : null}
                {!editable ? <Text style={[styles.sharedLabel, { color: colors.primary, fontFamily: colors.fontFamily.sansSemiBold }]}>{t('Shared with you')}</Text> : null}
              </View>
              {editable ? (
                <Pressable accessibilityRole="button" accessibilityLabel={t('Edit list')} onPress={() => setEditing(true)} hitSlop={10} style={styles.iconButton}>
                  <Feather name="edit-2" size={19} color={colors.primary} />
                </Pressable>
              ) : null}
            </View>
          )}
          {failure ? <Text accessibilityRole="alert" style={[styles.failure, { color: colors.destructiveText }]}>{failure}</Text> : null}
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sansSemiBold }]}>
            {t('Resources')} · {list.itemCount}
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <ResourceRow
          item={item}
          editable={editable}
          removing={removingId === item.id}
          onOpen={() => router.push(`/resource/${item.resourceId}`)}
          onRemove={() => confirmRemove(item)}
        />
      )}
      ListEmptyComponent={<Empty icon="book-open" title={t('This list is empty')} description={editable ? t('Save a resource, then add it to this list.') : t('No resources have been added to this shared list yet.')} />}
      ListFooterComponent={editable ? (
        <View style={styles.deleteArea}>
          <Button variant="destructive" loading={deleteList.isPending} onPress={() => { void confirmDelete(); }}>{t('Delete learning list')}</Button>
        </View>
      ) : null}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 10 },
  headerStack: { gap: 14, marginBottom: 4 },
  listHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headingCopy: { flex: 1, gap: 6 },
  heading: { fontSize: 23, letterSpacing: -0.4 },
  description: { fontSize: 13, lineHeight: 19 },
  sharedLabel: { fontSize: 12 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  editCard: { borderWidth: 1, padding: 14, gap: 10 },
  input: { minHeight: 44, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  descriptionInput: { minHeight: 76, textAlignVertical: 'top' },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionButton: { flex: 1 },
  failure: { fontSize: 12, lineHeight: 17 },
  sectionTitle: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.7 },
  resourceCard: { minHeight: 78, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
  resourceIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  resourceCopy: { flex: 1, gap: 5 },
  resourceTitle: { fontSize: 14, lineHeight: 19 },
  resourceMeta: { fontSize: 11 },
  removeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  deleteArea: { marginTop: 18 },
});
