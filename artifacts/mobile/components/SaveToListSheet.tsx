/**
 * @fileOverview Mobile UI role: turns a successful resource save into an optional Learning List or goal action.
 * System connection: opened by resource detail, backed by generated list and goal hooks, and coordinated with user-library cache state.
 */
/**
 * What a save is for.
 *
 * Saving a resource is not the end of anything; it is the moment somebody has
 * decided this is worth their time, and the two things they can do with that
 * decision are put it in a Learning List and attach it to what they are
 * actually trying to learn. This sheet offers both without leaving the
 * resource, because navigating away to organise is how a save becomes a pile.
 *
 * The goal half used to be a button that opened the goals screen and left the
 * connecting to the reader. It attaches the resource now: the goal's path
 * grows a step that carries it, so the step opens the resource rather than
 * describing a search for one.
 *
 * Both writes are idempotent at the server, which is what makes a second tap
 * safe on a connection where the first one's answer has not arrived. This
 * screen still has to say which of the two happened -- "added" and "already
 * there" are different sentences, and a duplicate is not an error.
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
  getListLearningGoalsQueryKey,
  getListResourceListsQueryKey,
  useAddListItem,
  useCreateResourceList,
  useLinkGoalResource,
  useListLearningGoals,
  useListResourceLists,
} from '@workspace/api-client-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useMotion } from '@/contexts/MotionContext';
import { describeApiFailure } from '@/utils/api-failure';
import { byUrgency } from '@/utils/goals';

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
  const [linkingGoalId, setLinkingGoalId] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /*
   * What Retry would repeat, rather than a bare id. Both writes can fail and
   * they are different requests; a Retry that remembered only "the last list"
   * would answer a failed goal attachment by adding the resource to a list
   * somebody tapped a minute earlier.
   */
  const [retry, setRetry] = useState<
    { kind: 'list' | 'goal'; id: number } | null
  >(null);

  const lists = useListResourceLists({
    query: {
      queryKey: getListResourceListsQueryKey(),
      enabled: visible,
    },
  });
  const goals = useListLearningGoals({
    query: {
      queryKey: getListLearningGoalsQueryKey(),
      enabled: visible,
    },
  });
  const addItem = useAddListItem();
  const createList = useCreateResourceList();
  const linkGoal = useLinkGoalResource();

  const busy = addingListId !== null || linkingGoalId !== null;
  const orderedGoals = [...(goals.data ?? [])].sort(byUrgency);

  useEffect(() => {
    if (!visible) return;
    setConfirmation(null);
    setFailure(null);
    setRetry(null);
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
    if (!resource || busy) return;
    setAddingListId(listId);
    setRetry({ kind: 'list', id: listId });
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
      setRetry(null);
    } catch (error) {
      setFailure(describeApiFailure(error, t('Could not add this resource to the list. Try again.'), t));
    } finally {
      setAddingListId(null);
    }
  }

  /**
   * Attach the resource to a goal's path.
   *
   * The server appends the step and reports whether it had to, so this does
   * not read the path, decide, and write it back -- two taps doing that would
   * put the same resource on the path twice. The goal list is invalidated
   * afterwards because the goal screen renders those steps.
   */
  async function connectToGoal(goalId: number) {
    if (!resource || busy) return;
    setLinkingGoalId(goalId);
    setRetry({ kind: 'goal', id: goalId });
    setFailure(null);
    setConfirmation(null);
    try {
      const linked = await linkGoal.mutateAsync({
        id: goalId,
        data: { resourceId: resource.id },
      });
      await queryClient.invalidateQueries({
        queryKey: getListLearningGoalsQueryKey(),
      });
      if (linked.alreadyLinked) {
        setConfirmation(t('Already on this goal'));
        warning();
      } else {
        setConfirmation(t('Added to your goal path'));
        success();
      }
      setRetry(null);
    } catch (error) {
      setFailure(
        describeApiFailure(error, t('Could not connect this resource to that goal. Try again.'), t),
      );
    } finally {
      setLinkingGoalId(null);
    }
  }

  function retryLastWrite() {
    if (!retry) return;
    if (retry.kind === 'list') void addToList(retry.id);
    else void connectToGoal(retry.id);
  }

  async function createAndAdd() {
    const name = newListName.trim();
    if (!resource || !name || createList.isPending || busy) return;
    setFailure(null);
    setConfirmation(null);
    // A creation failure cannot be retried as an add to an unrelated list
    // selected during an earlier attempt.
    setRetry(null);
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
          {/*
            One scroller for the whole body, rather than a short one per
            section. Two sections of rows plus a heading, a field and two
            labels overflow a 4.7-inch phone, and a View that overflows its
            maxHeight in React Native is clipped rather than scrolled -- which
            takes Done off the screen with no way to reach it. The footer sits
            outside this, so the way out of the sheet is always visible.
          */}
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
          >
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
                {retry ? (
                  <Pressable accessibilityRole="button" onPress={retryLastWrite}>
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
            <View style={styles.listStack}>
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
                    disabled={busy}
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
                        {`${list.itemCount} ${list.itemCount === 1 ? t('resource') : t('resources')}`}
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
            </View>

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
                disabled={!newListName.trim() || busy}
                loading={createList.isPending}
              >
                {t('Create and add')}
              </Button>
            </View>

            <Text
              style={[
                styles.sectionLabel,
                {
                  color: colors.foreground,
                  fontFamily: colors.fontFamily.sansSemiBold,
                },
              ]}
            >
              {t('Connect to a goal')}
            </Text>
            <View style={styles.listStack}>
              {goals.isLoading ? (
                <ActivityIndicator color={colors.primary} />
              ) : goals.isError ? (
                <View accessibilityRole="alert" style={styles.listLoadFailure}>
                  <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
                    {t('Could not load your learning goals.')}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={goals.isFetching}
                    onPress={() => void goals.refetch()}
                  >
                    <Text style={[styles.retryText, { color: colors.primary }]}>
                      {goals.isFetching ? t('Loading…') : t('Retry')}
                    </Text>
                  </Pressable>
                </View>
              ) : orderedGoals.length ? (
                orderedGoals.map((goal) => {
                  /*
                   * Whether this goal already carries the resource, which the
                   * row says rather than making somebody tap to find out. The
                   * goals are refetched after a successful attachment, so this
                   * is also what turns the row it was tapped on into its
                   * attached state.
                   */
                  const attached = goal.pathSteps.some(
                    (step) => step.resourceId === resource?.id,
                  );
                  return (
                  <Pressable
                    key={goal.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('Connect to')} ${goal.title}`}
                    accessibilityState={{ disabled: busy, selected: attached }}
                    disabled={busy}
                    onPress={() => void connectToGoal(goal.id)}
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
                        {goal.title}
                      </Text>
                      <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                        {attached
                          ? `${goal.subject} · ${t('Already on this goal')}`
                          : `${goal.subject} · ${goal.pathSteps.length} ${t('steps')}`}
                      </Text>
                    </View>
                    {linkingGoalId === goal.id ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Feather
                        name={attached ? 'check-circle' : 'target'}
                        size={18}
                        color={colors.primary}
                      />
                    )}
                  </Pressable>
                  );
                })
              ) : (
                <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
                  {t('Set a goal on the web and connect resources to it from here.')}
                </Text>
              )}
            </View>
          </ScrollView>

          <View style={styles.footerRow}>
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
  // Shrinks to whatever the sheet has left once the handle and the footer have
  // taken theirs, which is what keeps the footer on screen.
  body: { flexShrink: 1 },
  bodyContent: { gap: 14 },
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
