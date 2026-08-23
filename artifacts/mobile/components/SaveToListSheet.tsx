/**
 * @fileOverview Mobile UI role: turns a successful resource save into an optional Learning List or goal action.
 * System connection: opened by resource detail, backed by generated list hooks, and coordinated with user-library cache state.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Button } from '@workspace/edu-ds/components/native/button';
import type { Resource } from '@workspace/api-client-react';
import {
  getGetResourceListQueryKey,
  getGetUserLibraryQueryKey,
  getListResourceListsQueryKey,
  useAddListItem,
  useCreateResourceList,
  useListResourceLists,
} from '@workspace/api-client-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useMotion } from '@/contexts/MotionContext';
import { describeApiFailure } from '@/utils/api-failure';

type SaveToListSheetProps = {
  visible: boolean;
  resource: Resource | null;
  userId: number;
  onClose: () => void;
  onViewGoals: () => void;
};

export function SaveToListSheet({ visible, resource, userId, onClose, onViewGoals }: SaveToListSheetProps) {
  const { t } = useLanguage();
  const colors = useColors();
  const queryClient = useQueryClient();
  const { reduceMotion, selection, success, warning } = useMotion();
  const [newListName, setNewListName] = useState('');
  const [addingListId, setAddingListId] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [retryListId, setRetryListId] = useState<number | null>(null);

  const lists = useListResourceLists({
    query: {
      queryKey: getListResourceListsQueryKey(),
      enabled: visible,
    },
  });
  const addItem = useAddListItem();
  const createList = useCreateResourceList();

  useEffect(() => {
    if (!visible) return;
    setConfirmation(null);
    setFailure(null);
    setRetryListId(null);
  }, [visible, resource?.id]);

  async function refreshListState(listId: number) {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: getListResourceListsQueryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: getGetResourceListQueryKey(listId),
      }),
      queryClient.invalidateQueries({
        queryKey: getGetUserLibraryQueryKey(userId),
      }),
    ]);
  }

  async function addToList(listId: number) {
    if (!resource || addingListId !== null) return;
    setAddingListId(listId);
    setRetryListId(listId);
    setFailure(null);
    setConfirmation(null);
    try {
      const item = await addItem.mutateAsync({
        id: listId,
        data: { resourceId: resource.id },
      });
      await refreshListState(listId);
      if (item.alreadyPresent) {
        setConfirmation(t('Already in this list'));
        warning();
      } else {
        setConfirmation(t('Added to list'));
        success();
      }
      setRetryListId(null);
    } catch (error) {
      setFailure(describeApiFailure(error, t('Could not add this resource to the list. Try again.'), t));
    } finally {
      setAddingListId(null);
    }
  }

  async function createAndAdd() {
    const name = newListName.trim();
    if (!resource || !name || createList.isPending || addingListId !== null) return;
    setFailure(null);
    setConfirmation(null);
    // A creation failure cannot be retried as an add to an unrelated list
    // selected during an earlier attempt.
    setRetryListId(null);
    try {
      const created = await createList.mutateAsync({ data: { name } });
      setNewListName('');
      selection();
      // If the second write fails, Retry targets this already-created list;
      // it never repeats list creation and therefore cannot duplicate it.
      await addToList(created.id);
    } catch (error) {
      setFailure(describeApiFailure(error, t('Could not create that learning list. Try again.'), t));
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'fade' : 'slide'}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Close saved resource options')}
          style={styles.backdrop}
          onPress={onClose}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderTopLeftRadius: colors.radius * 2,
              borderTopRightRadius: colors.radius * 2,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.headingRow}>
            <View
              style={[
                styles.successIcon,
                {
                  backgroundColor: colors.primary + '1A',
                  borderRadius: colors.radius * 2,
                },
              ]}
            >
              <Feather name="check" size={20} color={colors.primary} />
            </View>
            <View style={styles.headingText}>
              <Text
                style={[
                  styles.title,
                  {
                    color: colors.foreground,
                    fontFamily: colors.fontFamily.sansBold,
                  },
                ]}
              >
                {t('Saved to your library')}
              </Text>
              <Text
                style={[
                  styles.description,
                  {
                    color: colors.mutedForeground,
                    fontFamily: colors.fontFamily.sans,
                  },
                ]}
              >
                {t('Add it to a learning list now, or finish and organize it later.')}
              </Text>
            </View>
          </View>

          {confirmation ? (
            <View
              accessibilityRole="alert"
              style={[
                styles.notice,
                {
                  backgroundColor: colors.primary + '12',
                  borderColor: colors.primary + '55',
                },
              ]}
            >
              <Feather name="check-circle" size={16} color={colors.primary} />
              <Text style={[styles.noticeText, { color: colors.foreground }]}>{confirmation}</Text>
            </View>
          ) : null}

          {failure ? (
            <View
              accessibilityRole="alert"
              style={[
                styles.notice,
                {
                  backgroundColor: colors.destructive + '12',
                  borderColor: colors.destructive,
                },
              ]}
            >
              <Feather name="alert-circle" size={16} color={colors.destructiveText} />
              <Text style={[styles.noticeText, { color: colors.foreground }]}>{failure}</Text>
              {retryListId !== null ? (
                <Pressable onPress={() => void addToList(retryListId)}>
                  <Text style={[styles.retryText, { color: colors.primary }]}>{t('Retry')}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <Text
            style={[
              styles.sectionLabel,
              {
                color: colors.foreground,
                fontFamily: colors.fontFamily.sansSemiBold,
              },
            ]}
          >
            {t('Your learning lists')}
          </Text>
          <ScrollView style={styles.listScroller} contentContainerStyle={styles.listStack}>
            {lists.isLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : lists.isError ? (
              <View accessibilityRole="alert" style={styles.listLoadFailure}>
                <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
                  {t('Could not load your learning lists.')}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={lists.isFetching}
                  onPress={() => void lists.refetch()}
                >
                  <Text style={[styles.retryText, { color: colors.primary }]}>
                    {lists.isFetching ? t('Loading…') : t('Retry')}
                  </Text>
                </Pressable>
              </View>
            ) : lists.data?.length ? (
              lists.data.map((list) => (
                <Pressable
                  key={list.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('Add to')} ${list.name}`}
                  disabled={addingListId !== null}
                  onPress={() => void addToList(list.id)}
                  style={({ pressed }) => [
                    styles.listRow,
                    {
                      borderColor: colors.border,
                      backgroundColor: pressed ? colors.muted : colors.background,
                      borderRadius: colors.radius,
                    },
                  ]}
                >
                  <View style={styles.listText}>
                    <Text
                      numberOfLines={1}
                      style={{
                        color: colors.foreground,
                        fontFamily: colors.fontFamily.sansSemiBold,
                      }}
                    >
                      {list.name}
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                      {list.itemCount} {t('resources')}
                    </Text>
                  </View>
                  {addingListId === list.id ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Feather name="plus" size={18} color={colors.primary} />
                  )}
                </Pressable>
              ))
            ) : (
              <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{t('No learning lists yet')}</Text>
            )}
          </ScrollView>

          <View style={styles.createRow}>
            <TextInput
              value={newListName}
              onChangeText={setNewListName}
              accessibilityLabel={t('Learning list title')}
              placeholder={t('List purpose or title')}
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="done"
              onSubmitEditing={() => void createAndAdd()}
              style={[
                styles.input,
                {
                  color: colors.foreground,
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  borderRadius: colors.radius,
                  fontFamily: colors.fontFamily.sans,
                },
              ]}
            />
            <Button
              size="sm"
              onPress={() => void createAndAdd()}
              disabled={!newListName.trim() || addingListId !== null}
              loading={createList.isPending}
            >
              {t('Create and add')}
            </Button>
          </View>

          <View style={styles.footerRow}>
            {/* Resource-to-goal linking is a later workflow slice. This label
                is deliberately honest: today this opens the existing goals
                area without claiming the resource has been connected. */}
            <Button variant="ghost" onPress={onViewGoals}>
              {t('View goals')}
            </Button>
            <Button onPress={onClose}>{t('Done')}</Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  sheet: {
    borderWidth: 1,
    padding: 18,
    paddingBottom: 28,
    gap: 14,
    maxHeight: '86%',
  },
  handle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 2,
  },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  successIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headingText: { flex: 1, gap: 3 },
  title: { fontSize: 18 },
  description: { fontSize: 13, lineHeight: 18 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    padding: 10,
  },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 17 },
  retryText: { fontSize: 13, fontWeight: '700' },
  sectionLabel: { fontSize: 14 },
  listScroller: { maxHeight: 170 },
  listStack: { gap: 8 },
  listLoadFailure: { gap: 8, alignItems: 'flex-start' },
  listRow: {
    minHeight: 50,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  listText: { flex: 1, gap: 2 },
  createRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
});
