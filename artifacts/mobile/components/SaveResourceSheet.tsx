/**
 * @fileOverview Mobile workflow role: lets a user choose or create a learning list and persist one resource.
 * System connection: composes generated list hooks, TanStack Query invalidation, safe haptics, and the root motion policy.
 */
import React, { useEffect, useState } from 'react';
import {
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Button } from '@workspace/edu-ds/components/native/button';
import { Skeleton } from '@workspace/edu-ds/components/native/skeleton';
import {
  getGetResourceListQueryKey,
  getListResourceListsQueryKey,
  getListResourceListMembershipsQueryKey,
  recordProductEvent,
  useAddListItem,
  useCreateResourceList,
  useListResourceLists,
  type ResourceList,
} from '@workspace/api-client-react';
import { useMotion } from '@/contexts/MotionContext';
import { triggerHaptic } from '@/utils/haptics';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { ErrorState } from '@/components/ErrorState';
import { completeMobileOnboardingActivation } from '@/utils/onboarding-activation';

export interface SavedListTarget {
  id: number;
  name: string;
}

function mutationMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'The resource could not be saved. Check your connection and try again.';
}

function ListChoice({
  item,
  selected,
  onPress,
}: {
  item: ResourceList;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <AnimatedPressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      haptic="selection"
      onPress={onPress}
      style={[
        styles.listChoice,
        {
          backgroundColor: selected ? colors.primary + '12' : colors.card,
          borderColor: selected ? colors.primary : colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      <View style={styles.listChoiceText}>
        <Text
          style={{ color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }}
          numberOfLines={1}
        >
          {item.name}
        </Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }}>
          {item.itemCount} {item.itemCount === 1 ? 'resource' : 'resources'}
        </Text>
      </View>
      <Feather
        name={selected ? 'check-circle' : 'circle'}
        size={20}
        color={selected ? colors.primary : colors.mutedForeground}
      />
    </AnimatedPressable>
  );
}

export function SaveResourceSheet({
  onClose,
  onSaved,
  resourceId,
  resourceTitle,
  visible,
}: {
  onClose: () => void;
  onSaved: (list: SavedListTarget) => void;
  resourceId: number;
  resourceTitle: string;
  visible: boolean;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { reduceMotion } = useMotion();
  const listsQuery = useListResourceLists();
  const createList = useCreateResourceList();
  const addListItem = useAddListItem();
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [createNew, setCreateNew] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [note, setNote] = useState('');
  const [writeError, setWriteError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setWriteError('');
    setNote('');
    setNewListName('');
    setSelectedListId(null);
    setCreateNew(false);
  }, [visible]);

  useEffect(() => {
    if (!visible || !listsQuery.data) return;
    if (listsQuery.data.length === 0) {
      setCreateNew(true);
      return;
    }
    if (!createNew && selectedListId === null) {
      setSelectedListId(listsQuery.data[0].id);
    }
  }, [createNew, listsQuery.data, selectedListId, visible]);

  const busy = createList.isPending || addListItem.isPending;

  async function save() {
    setWriteError('');
    try {
      let target = listsQuery.data?.find((list) => list.id === selectedListId) ?? null;

      if (createNew) {
        const name = newListName.trim();
        if (!name) {
          setWriteError('Name the learning list before saving.');
          return;
        }
        target = await createList.mutateAsync({ data: { name } });
        await queryClient.invalidateQueries({ queryKey: getListResourceListsQueryKey() });
      }

      if (!target) {
        setWriteError('Choose a learning list before saving.');
        return;
      }

      await addListItem.mutateAsync({
        id: target.id,
        data: { resourceId, note: note.trim() || undefined },
      });
      // Both the list count and its ordered item collection changed. Awaiting
      // invalidation prevents the next screen from briefly showing stale data.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListResourceListsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetResourceListQueryKey(target.id) }),
        queryClient.invalidateQueries({ queryKey: getListResourceListMembershipsQueryKey(resourceId) }),
      ]);
      // Tutorial completion means the resource really reached a server-backed
      // list. Merely advancing slides or opening Search is not activation.
      if (await completeMobileOnboardingActivation()) {
        void recordProductEvent({
          event: 'onboarding_completed',
          context: {
            surface: 'mobile_resource_save',
            milestone: 'resource_saved_to_list',
          },
        }).catch(() => undefined);
      }
      await triggerHaptic('success');
      onSaved({ id: target.id, name: target.name });
    } catch (error) {
      setWriteError(mutationMessage(error));
      void triggerHaptic('error');
    }
  }

  const listReadFailed = listsQuery.isError && listsQuery.data === undefined;

  return (
    <Modal
      animationType={reduceMotion ? 'none' : 'slide'}
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onPress={busy ? undefined : onClose}
          style={styles.backdrop}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          pointerEvents="box-none"
          style={styles.keyboardLayer}
        >
          <View
            accessibilityViewIsModal
            style={[
              styles.sheet,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                borderTopLeftRadius: colors.radius + 12,
                borderTopRightRadius: colors.radius + 12,
                paddingBottom: Math.max(insets.bottom, 16),
              },
            ]}
          >
            <View style={styles.handleRow}>
              <View style={[styles.handle, { backgroundColor: colors.border }]} />
            </View>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text
                  style={[
                    styles.title,
                    { color: colors.foreground, fontFamily: colors.fontFamily.sansBold },
                  ]}
                >
                  Save to a learning list
                </Text>
                <Text
                  numberOfLines={2}
                  style={{ color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }}
                >
                  {resourceTitle}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Close save sheet"
                accessibilityRole="button"
                disabled={busy}
                hitSlop={10}
                onPress={onClose}
                style={styles.closeButton}
              >
                <Feather name="x" size={22} color={colors.foreground} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {listsQuery.isLoading ? (
                <View style={styles.loadingStack}>
                  <Skeleton width="100%" height={58} borderRadius={8} />
                  <Skeleton width="100%" height={58} borderRadius={8} />
                </View>
              ) : listReadFailed ? (
                <ErrorState
                  error={listsQuery.error}
                  retrying={listsQuery.isFetching}
                  onRetry={() => {
                    void listsQuery.refetch();
                  }}
                  style={styles.compactError}
                />
              ) : (
                <>
                  {listsQuery.data?.length ? (
                    <View accessibilityRole="radiogroup" style={styles.listStack}>
                      {listsQuery.data.map((item) => (
                        <ListChoice
                          item={item}
                          key={item.id}
                          selected={!createNew && selectedListId === item.id}
                          onPress={() => {
                            setCreateNew(false);
                            setSelectedListId(item.id);
                            setWriteError('');
                          }}
                        />
                      ))}
                    </View>
                  ) : null}

                  {listsQuery.data?.length ? (
                    <Button
                      onPress={() => {
                        setCreateNew((current) => !current);
                        setWriteError('');
                      }}
                      size="sm"
                      variant="outline"
                    >
                      {createNew ? 'Choose an existing list' : 'Create a new list'}
                    </Button>
                  ) : null}

                  {createNew ? (
                    <View style={styles.field}>
                      <Text
                        style={{ color: colors.foreground, fontFamily: colors.fontFamily.sansMedium }}
                      >
                        New list name
                      </Text>
                      <TextInput
                        autoFocus={!reduceMotion}
                        editable={!busy}
                        maxLength={120}
                        onChangeText={setNewListName}
                        placeholder="Example: AP Mechanics essentials"
                        placeholderTextColor={colors.mutedForeground}
                        style={[
                          styles.input,
                          {
                            backgroundColor: colors.card,
                            borderColor: colors.border,
                            borderRadius: colors.radius,
                            color: colors.foreground,
                            fontFamily: colors.fontFamily.sans,
                          },
                        ]}
                        value={newListName}
                      />
                    </View>
                  ) : null}

                  <View style={styles.field}>
                    <Text
                      style={{ color: colors.foreground, fontFamily: colors.fontFamily.sansMedium }}
                    >
                      Note (optional)
                    </Text>
                    <TextInput
                      editable={!busy}
                      maxLength={1000}
                      multiline
                      onChangeText={setNote}
                      placeholder="Why this belongs in the path"
                      placeholderTextColor={colors.mutedForeground}
                      style={[
                        styles.input,
                        styles.noteInput,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                          borderRadius: colors.radius,
                          color: colors.foreground,
                          fontFamily: colors.fontFamily.sans,
                        },
                      ]}
                      value={note}
                    />
                  </View>
                </>
              )}

              {writeError ? (
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
                  <Feather name="alert-circle" size={16} color={colors.destructiveText} />
                  <Text
                    style={{
                      color: colors.destructiveText,
                      flex: 1,
                      fontFamily: colors.fontFamily.sans,
                    }}
                  >
                    {writeError}
                  </Text>
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.footer}>
              <Button disabled={busy} onPress={onClose} variant="outline">
                Cancel
              </Button>
              <View style={styles.saveButton}>
                <Button
                  disabled={listReadFailed || listsQuery.isLoading}
                  loading={busy}
                  onPress={() => {
                    void save();
                  }}
                >
                  Save resource
                </Button>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.42)' },
  keyboardLayer: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopWidth: 1, maxHeight: '88%', paddingHorizontal: 18 },
  handleRow: { alignItems: 'center', paddingBottom: 10, paddingTop: 8 },
  handle: { borderRadius: 999, height: 4, width: 40 },
  header: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, paddingBottom: 16 },
  headerText: { flex: 1, gap: 4 },
  title: { fontSize: 20, letterSpacing: -0.3 },
  closeButton: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  scrollContent: { gap: 16, paddingBottom: 18 },
  loadingStack: { gap: 10 },
  listStack: { gap: 8 },
  listChoice: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', gap: 12, padding: 12 },
  listChoiceText: { flex: 1, gap: 3 },
  field: { gap: 7 },
  input: { borderWidth: 1, fontSize: 15, minHeight: 46, paddingHorizontal: 12, paddingVertical: 10 },
  noteInput: { minHeight: 76, textAlignVertical: 'top' },
  writeError: { alignItems: 'flex-start', borderWidth: 1, flexDirection: 'row', gap: 8, padding: 10 },
  compactError: { paddingHorizontal: 8, paddingVertical: 20 },
  footer: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingTop: 4 },
  saveButton: { flex: 1 },
});
