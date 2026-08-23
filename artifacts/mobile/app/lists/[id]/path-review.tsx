/**
 * @fileOverview Mobile workflow role: previews a learning list as ordered path steps before explicit creation.
 * System connection: reads list detail and calls the idempotent list-to-learning-goal endpoint, then opens the persistent path.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
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
  getListLearningGoalsQueryKey,
  useCreateLearningGoalFromList,
  useGetResourceList,
} from '@workspace/api-client-react';
import { ErrorState } from '@/components/ErrorState';
import { triggerHaptic } from '@/utils/haptics';

export default function PathReviewScreen() {
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
  const createPath = useCreateLearningGoalFromList();
  const [writeError, setWriteError] = React.useState('');
  const failed = query.isError && query.data === undefined;

  async function confirmPath() {
    setWriteError('');
    try {
      // The endpoint is idempotent by sourceListId. Repeated taps, retries, or
      // a return to this screen converge on the same learning goal.
      const goal = await createPath.mutateAsync({ id: listId });
      await queryClient.invalidateQueries({ queryKey: getListLearningGoalsQueryKey() });
      await triggerHaptic('success');
      router.replace(`/goals/${goal.id}`);
    } catch (error) {
      setWriteError(
        error instanceof Error && error.message
          ? error.message
          : 'The learning path could not be created. Please try again.',
      );
      void triggerHaptic('error');
    }
  }

  if (!validListId) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Empty icon="alert-circle" title="Invalid path-review link" />
      </View>
    );
  }

  if (query.isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <Skeleton width="70%" height={28} />
        <Skeleton width="100%" height={90} borderRadius={8} />
        <Skeleton width="100%" height={90} borderRadius={8} />
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
      showsVerticalScrollIndicator={false}
      style={{ backgroundColor: colors.background }}
    >
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: colors.primary + '14', borderRadius: colors.radius }]}>
          <Feather name="map" color={colors.primary} size={22} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: colors.fontFamily.sansBold }]}>Review the path</Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }}>
            {query.data.name}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.explanation,
          { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
        ]}
      >
        <Feather name="info" color={colors.primary} size={18} />
        <Text style={{ color: colors.foreground, flex: 1, fontFamily: colors.fontFamily.sans }}>
          These resources will become path steps in exactly this order. You can safely confirm again later; Casparel will reopen the same path instead of duplicating it.
        </Text>
      </View>

      {query.data.items.length === 0 ? (
        <Empty
          icon="bookmark"
          title="This list is empty"
          description="Return to the list and add at least one resource first."
        />
      ) : (
        <View style={styles.steps}>
          {query.data.items.map((item, index) => (
            <View
              key={item.id}
              style={[
                styles.step,
                { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
              ]}
            >
              <View style={[styles.stepNumber, { backgroundColor: colors.primary, borderRadius: 999 }]}>
                <Text style={{ color: colors.primaryForeground, fontFamily: colors.fontFamily.sansBold }}>
                  {index + 1}
                </Text>
              </View>
              <View style={styles.stepText}>
                <Text style={{ color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }}>
                  {item.resource.title}
                </Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }}>
                  {item.resource.format} · {item.resource.subject}
                </Text>
              </View>
            </View>
          ))}
        </View>
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
          <Feather name="alert-circle" color={colors.destructiveText} size={16} />
          <Text style={{ color: colors.destructiveText, flex: 1, fontFamily: colors.fontFamily.sans }}>
            {writeError}
          </Text>
        </View>
      ) : null}

      <Button
        disabled={query.data.items.length === 0}
        loading={createPath.isPending}
        onPress={() => {
          void confirmPath();
        }}
        size="lg"
      >
        Create this learning path
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center' },
  loading: { flex: 1, gap: 12, padding: 16 },
  content: { gap: 18, padding: 16 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  headerIcon: { alignItems: 'center', height: 46, justifyContent: 'center', width: 46 },
  headerText: { flex: 1, gap: 3 },
  title: { fontSize: 24, letterSpacing: -0.4 },
  explanation: { alignItems: 'flex-start', borderWidth: 1, flexDirection: 'row', gap: 10, padding: 13 },
  steps: { gap: 10 },
  step: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', gap: 12, padding: 13 },
  stepNumber: { alignItems: 'center', height: 32, justifyContent: 'center', width: 32 },
  stepText: { flex: 1, gap: 4 },
  writeError: { alignItems: 'flex-start', borderWidth: 1, flexDirection: 'row', gap: 8, padding: 10 },
});
