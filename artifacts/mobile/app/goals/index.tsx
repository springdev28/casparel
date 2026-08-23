/**
 * @fileOverview Mobile workflow role: lists persistent learning paths and their completion progress.
 * System connection: reads the generated learning-goal API and links each goal to its resumable native path screen.
 */
import React from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Empty } from '@workspace/edu-ds/components/native/empty';
import { Skeleton } from '@workspace/edu-ds/components/native/skeleton';
import { useListLearningGoals, type LearningGoal } from '@workspace/api-client-react';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { ErrorState } from '@/components/ErrorState';
import { ProgressTransition } from '@/components/ProgressTransition';
import { progressPercent } from '@/utils/progress';

function PathCard({ goal, onPress }: { goal: LearningGoal; onPress: () => void }) {
  const colors = useColors();
  const completed = goal.pathSteps.filter((step) => step.completed).length;
  const progress = goal.pathSteps.length ? completed / goal.pathSteps.length : 0;

  return (
    <AnimatedPressable
      haptic="selection"
      onPress={onPress}
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
      ]}
    >
      <View style={styles.cardHeading}>
        <View style={[styles.icon, { backgroundColor: colors.primary + '14', borderRadius: colors.radius }]}>
          <Feather name="map" color={colors.primary} size={20} />
        </View>
        <View style={styles.cardText}>
          <Text
            numberOfLines={2}
            style={[styles.cardTitle, { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }]}
          >
            {goal.title}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }}>
            {goal.subject} · {goal.status}
          </Text>
        </View>
        <Feather name="chevron-right" color={colors.mutedForeground} size={20} />
      </View>
      <ProgressTransition value={progress} />
      <Text style={{ color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }}>
        {completed} of {goal.pathSteps.length} steps · {progressPercent(progress)}%
      </Text>
    </AnimatedPressable>
  );
}

export default function LearningPathsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const query = useListLearningGoals();
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
        <Text style={[styles.title, { color: colors.foreground, fontFamily: colors.fontFamily.sansBold }]}>Learning paths</Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }}>
          Resume the next unfinished step or review completed work.
        </Text>
      </View>

      {query.isLoading ? (
        <View style={styles.loading}>
          {[1, 2, 3].map((item) => <Skeleton key={item} width="100%" height={112} borderRadius={8} />)}
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
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          data={query.data ?? []}
          keyExtractor={(goal) => String(goal.id)}
          ListEmptyComponent={
            <Empty
              icon="map"
              title="No learning paths yet"
              description="Create one from an ordered Learning List."
            />
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
          renderItem={({ item }) => (
            <PathCard goal={item} onPress={() => router.push(`/goals/${item.id}`)} />
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
  loading: { gap: 10, padding: 16 },
  list: { gap: 10, padding: 16 },
  card: { borderWidth: 1, gap: 12, padding: 14 },
  cardHeading: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  icon: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  cardText: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 16, lineHeight: 21 },
});
