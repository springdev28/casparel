/**
 * @fileOverview Native Learning Lists browser and creation flow.
 * System connection: reachable from Resources and backed only by generated list hooks.
 */
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Button } from '@workspace/edu-ds/components/native/button';
import { Empty } from '@workspace/edu-ds/components/native/empty';
import { Skeleton } from '@workspace/edu-ds/components/native/skeleton';
import type { ResourceList } from '@workspace/api-client-react';
import {
  getListResourceListsQueryKey,
  useCreateResourceList,
  useListResourceLists,
  useListSharedResourceLists,
} from '@workspace/api-client-react';
import { ErrorState } from '@/components/ErrorState';
import { useLanguage } from '@/contexts/LanguageContext';
import { useMotion } from '@/contexts/MotionContext';
import { describeApiFailure } from '@/utils/api-failure';

function ListRow({ list, shared, onPress }: { list: ResourceList; shared: boolean; onPress: () => void }) {
  const colors = useColors();
  const { t } = useLanguage();
  const resourceLabel = list.itemCount === 1 ? t('resource') : t('resources');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${list.name}, ${list.itemCount} ${resourceLabel}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.listCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
          opacity: pressed ? 0.76 : 1,
        },
      ]}
    >
      <View style={[styles.listIcon, { backgroundColor: colors.primary + '16', borderRadius: colors.radius }]}>
        <Feather name={shared ? 'users' : 'list'} size={19} color={colors.primary} />
      </View>
      <View style={styles.listCopy}>
        <View style={styles.titleRow}>
          <Text
            numberOfLines={1}
            style={[styles.listTitle, { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }]}
          >
            {list.name}
          </Text>
          {shared ? (
            <View style={[styles.sharedChip, { backgroundColor: colors.secondary, borderRadius: 999 }]}>
              <Text style={[styles.sharedText, { color: colors.secondaryForeground, fontFamily: colors.fontFamily.sansSemiBold }]}>
                {t('Shared')}
              </Text>
            </View>
          ) : null}
        </View>
        {list.description ? (
          <Text numberOfLines={2} style={[styles.description, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
            {list.description}
          </Text>
        ) : null}
        <Text style={[styles.meta, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
          {list.itemCount} {resourceLabel}
        </Text>
      </View>
      <Feather name="chevron-right" size={19} color={colors.mutedForeground} />
    </Pressable>
  );
}

export default function ListsScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const { success } = useMotion();
  const owned = useListResourceLists();
  const shared = useListSharedResourceLists();
  const createList = useCreateResourceList();
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [failure, setFailure] = React.useState<string | null>(null);

  const sections = React.useMemo(() => {
    const rows: Array<{ kind: 'heading' | 'list'; id: string; title?: string; list?: ResourceList; shared?: boolean }> = [];
    if ((owned.data?.length ?? 0) > 0) {
      rows.push({ kind: 'heading', id: 'owned-heading', title: t('Your lists') });
      for (const list of owned.data ?? []) rows.push({ kind: 'list', id: `owned-${list.id}`, list, shared: false });
    }
    if ((shared.data?.length ?? 0) > 0) {
      rows.push({ kind: 'heading', id: 'shared-heading', title: t('Shared with you') });
      for (const list of shared.data ?? []) rows.push({ kind: 'list', id: `shared-${list.id}`, list, shared: true });
    }
    return rows;
  }, [owned.data, shared.data, t]);

  async function submit() {
    const trimmedName = name.trim();
    if (!trimmedName || createList.isPending) return;
    setFailure(null);
    try {
      const created = await createList.mutateAsync({
        data: {
          name: trimmedName,
          description: description.trim() || undefined,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListResourceListsQueryKey() });
      success();
      setName('');
      setDescription('');
      setCreating(false);
      router.push(`/lists/${created.id}`);
    } catch (error) {
      setFailure(describeApiFailure(error, t('Could not create that learning list. Try again.'), t));
    }
  }

  const firstLoad = (owned.isLoading && !owned.data) || (shared.isLoading && !shared.data);
  const failed = (owned.isError && !owned.data) || (shared.isError && !shared.data);
  const refreshing = owned.isFetching || shared.isFetching;

  if (firstLoad) {
    return (
      <View style={[styles.flex, styles.content, { backgroundColor: colors.background }]}>
        {[1, 2, 3].map((item) => <Skeleton key={item} width="100%" height={90} borderRadius={12} />)}
      </View>
    );
  }

  if (failed && sections.length === 0) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <ErrorState
          error={owned.error ?? shared.error}
          retrying={refreshing}
          onRetry={() => { void Promise.all([owned.refetch(), shared.refetch()]); }}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        data={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.primary}
            onRefresh={() => { void Promise.all([owned.refetch(), shared.refetch()]); }}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerStack}>
            <View style={styles.introRow}>
              <View style={styles.introCopy}>
                <Text style={[styles.heading, { color: colors.foreground, fontFamily: colors.fontFamily.sansBold }]}>
                  {t('Organize your resources')}
                </Text>
                <Text style={[styles.intro, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
                  {t('Group saved resources into focused study collections.')}
                </Text>
              </View>
              <Button size="sm" onPress={() => { setFailure(null); setCreating((current) => !current); }}>
                {creating ? t('Cancel') : t('New list')}
              </Button>
            </View>
            {creating ? (
              <View style={[styles.form, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                <Text style={[styles.formTitle, { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }]}>
                  {t('Create a learning list')}
                </Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  autoFocus
                  maxLength={120}
                  placeholder={t('List name')}
                  placeholderTextColor={colors.mutedForeground}
                  accessibilityLabel={t('List name')}
                  style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border, borderRadius: colors.radius, fontFamily: colors.fontFamily.sans }]}
                />
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  maxLength={500}
                  multiline
                  placeholder={t('Description (optional)')}
                  placeholderTextColor={colors.mutedForeground}
                  accessibilityLabel={t('Description (optional)')}
                  style={[styles.input, styles.descriptionInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border, borderRadius: colors.radius, fontFamily: colors.fontFamily.sans }]}
                />
                {failure ? <Text accessibilityRole="alert" style={[styles.failure, { color: colors.destructiveText }]}>{failure}</Text> : null}
                <Button onPress={() => { void submit(); }} loading={createList.isPending} disabled={!name.trim()}>
                  {t('Create list')}
                </Button>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => item.kind === 'heading' ? (
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sansSemiBold }]}>
            {item.title}
          </Text>
        ) : item.list ? (
          <ListRow list={item.list} shared={Boolean(item.shared)} onPress={() => router.push(`/lists/${item.list!.id}`)} />
        ) : null}
        ListEmptyComponent={!creating ? (
          <Empty
            icon="list"
            title={t('No learning lists yet')}
            description={t('Create a list to organize saved resources for a subject, goal, or exam.')}
          />
        ) : null}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 10 },
  headerStack: { gap: 16, marginBottom: 8 },
  introRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  introCopy: { flex: 1, gap: 5 },
  heading: { fontSize: 21, letterSpacing: -0.35 },
  intro: { fontSize: 13, lineHeight: 19 },
  form: { borderWidth: 1, padding: 14, gap: 10 },
  formTitle: { fontSize: 16 },
  input: { minHeight: 44, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  descriptionInput: { minHeight: 76, textAlignVertical: 'top' },
  failure: { fontSize: 12, lineHeight: 17 },
  sectionTitle: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 8, marginBottom: 2 },
  listCard: { minHeight: 82, borderWidth: 1, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  listIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  listCopy: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  listTitle: { flexShrink: 1, fontSize: 15 },
  sharedChip: { paddingHorizontal: 7, paddingVertical: 3 },
  sharedText: { fontSize: 10 },
  description: { fontSize: 12, lineHeight: 17 },
  meta: { fontSize: 11 },
});
