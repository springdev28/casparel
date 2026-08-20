/**
 * The account's study sets, on the dashboard, one tap from studying them.
 *
 * A section rather than a sixth tab. iOS collapses a tab bar of six into five
 * and a "More" list, which would bury either this or something already there;
 * putting it on the first screen a person sees is more prominent than a sixth
 * tab would have been anyway.
 *
 * A failure here is deliberately quiet. The dashboard is a composition of
 * panels and this one is not the reason anybody opened it, so a section that
 * cannot load says so in its own box and leaves the rest of the screen alone.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Skeleton } from '@workspace/edu-ds/components/native/skeleton';
import { Empty } from '@workspace/edu-ds/components/native/empty';
import {
  getListStudyActivitiesQueryKey,
  useListStudyActivities,
} from '@workspace/api-client-react';
import type { StudyActivity } from '@workspace/api-client-react';
import { ErrorState } from '@/components/ErrorState';
import { useLanguage } from '@/contexts/LanguageContext';

/** How many sets the dashboard shows before it stops. */
const SHOWN = 4;

function SetRow({ set, onPress }: { set: StudyActivity; onPress: () => void }) {
  const colors = useColors();
  const { t } = useLanguage();
  const cards = set.cards?.length ?? 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      // Named after the set: a list of these announced as "button" four times
      // tells a screen-reader reader nothing about which one they are on.
      accessibilityLabel={`${t('Study')} ${set.title}`}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View
        style={[
          styles.icon,
          { backgroundColor: colors.primary + '18', borderRadius: colors.radius - 2 },
        ]}
      >
        <Feather name="layers" size={18} color={colors.primary} />
      </View>
      <View style={styles.rowText}>
        <Text
          style={[
            styles.rowTitle,
            { color: colors.foreground, fontFamily: colors.fontFamily.sansMedium },
          ]}
          numberOfLines={1}
        >
          {set.title}
        </Text>
        <Text
          style={[
            styles.rowMeta,
            { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
          ]}
          numberOfLines={1}
        >
          {/*
            One string, not "{n} cards" assembled from pieces: the count is
            data, so the phrase is built here and translated as a whole.
          */}
          {cards === 1 ? t('1 card') : `${cards} ${t('cards')}`}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

export function StudySets() {
  const { t } = useLanguage();
  const colors = useColors();
  const router = useRouter();
  const { data, isLoading, isError, error, isFetching, refetch } =
    useListStudyActivities(undefined, {
      query: { queryKey: getListStudyActivitiesQueryKey() },
    });

  const sets = data ?? [];

  return (
    <View style={styles.section}>
      <Text
        style={[
          styles.sectionTitle,
          { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold },
        ]}
      >
        {t('Study sets')}
      </Text>

      {isLoading ? (
        <View style={styles.skeletonStack}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} width="100%" height={52} style={{ marginBottom: 2 }} />
          ))}
        </View>
      ) : isError && data === undefined ? (
        <ErrorState
          error={error}
          retrying={isFetching}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : !sets.length ? (
        <Empty
          icon="layers"
          title={t('No study sets yet')}
          description={t('Build a set of cards on the web and study it here.')}
        />
      ) : (
        <View
          style={[
            styles.list,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.radius,
            },
          ]}
        >
          {sets.slice(0, SHOWN).map((set) => (
            <SetRow
              key={set.id}
              set={set}
              onPress={() => router.push(`/study/${set.id}`)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24, gap: 10 },
  sectionTitle: { fontSize: 17, letterSpacing: -0.2 },
  skeletonStack: { gap: 8 },
  list: { borderWidth: 1, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    // 52 tall, which is above the 44pt both stores ask for as a touch target.
    minHeight: 56,
  },
  icon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15 },
  rowMeta: { fontSize: 12 },
});
