/**
 * A study set, one card at a time.
 *
 * This is the part of Casparel that a phone is better at than a laptop: the
 * cards are held in one hand, on a bus, for four minutes. The web has had it
 * since the feature shipped and the phone has not, because the endpoints were
 * absent from openapi.yaml and the phone app has no hand-written API layer --
 * so there was nothing for it to call.
 *
 * Deliberately small. Tap the card to turn it over, swipe or tap to move on,
 * and a bar across the top says how far through you are. No scoring, no
 * spaced-repetition schedule: the web app owns the study record and this is
 * the reading surface, so anything it invented here would be a second opinion
 * about somebody's progress.
 */
import React from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Badge } from '@workspace/edu-ds/components/native/badge';
import { Skeleton } from '@workspace/edu-ds/components/native/skeleton';
import { Empty } from '@workspace/edu-ds/components/native/empty';
import {
  getListStudyActivitiesQueryKey,
  useListStudyActivities,
} from '@workspace/api-client-react';
import type { StudyActivity, StudyActivityCard } from '@workspace/api-client-react';
import { ErrorState } from '@/components/ErrorState';
import { describeApiFailure } from '@/utils/api-failure';
import { useLanguage } from '@/contexts/LanguageContext';

/** "3 / 12" — the number is data, so it cannot be a dictionary entry. */
function Progress({ at, of }: { at: number; of: number }) {
  const colors = useColors();
  return (
    <View style={styles.progressRow}>
      <View
        style={[styles.progressTrack, { backgroundColor: colors.border }]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: of, now: at }}
      >
        <View
          style={[
            styles.progressFill,
            { backgroundColor: colors.primary, width: `${(at / Math.max(of, 1)) * 100}%` },
          ]}
        />
      </View>
      <Text
        style={[
          styles.progressLabel,
          { color: colors.mutedForeground, fontFamily: colors.fontFamily.sansMedium },
        ]}
      >
        {`${at} / ${of}`}
      </Text>
    </View>
  );
}

function Card({
  card,
  showAnswer,
  onTurn,
}: {
  card: StudyActivityCard;
  showAnswer: boolean;
  onTurn: () => void;
}) {
  const colors = useColors();
  const { t } = useLanguage();
  const face = showAnswer ? card.answer : card.term;
  return (
    <Pressable
      onPress={onTurn}
      accessibilityRole="button"
      /*
       * The card's own text is the label, plus which side is showing. A screen
       * reader gets the same two facts a sighted reader does -- what it says,
       * and that there is another side -- rather than "button".
       */
      accessibilityLabel={face}
      accessibilityHint={showAnswer ? t('Turn back to the term') : t('Turn over to see the answer')}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: showAnswer ? colors.primary : colors.border,
          borderRadius: colors.radius,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.cardSide,
          { color: colors.mutedForeground, fontFamily: colors.fontFamily.sansMedium },
        ]}
      >
        {showAnswer ? t('Answer') : t('Term')}
      </Text>
      <Text
        style={[
          styles.cardFace,
          { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold },
        ]}
      >
        {face}
      </Text>
      <View style={styles.turnHint}>
        <Feather name="refresh-cw" size={13} color={colors.mutedForeground} />
        <Text
          style={[
            styles.turnHintText,
            { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
          ]}
        >
          {t('Tap to turn over')}
        </Text>
      </View>
    </Pressable>
  );
}

export default function StudySetScreen() {
  const { t } = useLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const setId = Number(id);

  /*
   * The list, not a by-id endpoint: there isn't one. The server serves a
   * person's own activities as a list and the set is picked out of it, which
   * also means opening a set the account cannot see is a "not found" here
   * rather than a 403 from somewhere deeper.
   */
  const { data, isLoading, isError, error, isFetching, refetch } =
    useListStudyActivities(undefined, {
      query: { queryKey: getListStudyActivitiesQueryKey() },
    });

  const set: StudyActivity | undefined = (data ?? []).find(
    (activity) => activity.id === setId,
  );
  const cards = set?.cards ?? [];

  const [at, setAt] = React.useState(0);
  const [showAnswer, setShowAnswer] = React.useState(false);

  // A shorter set, or a different one, must not leave the position past its
  // end -- which renders a blank card rather than an empty state.
  React.useEffect(() => {
    setAt((current) => (current < cards.length ? current : 0));
    setShowAnswer(false);
  }, [cards.length, setId]);

  function move(by: number) {
    setAt((current) => Math.min(Math.max(current + by, 0), Math.max(cards.length - 1, 0)));
    setShowAnswer(false);
  }

  if (isLoading) {
    return (
      <View style={[styles.flex, styles.padded, { backgroundColor: colors.background }]}>
        <Skeleton width="60%" height={22} />
        <Skeleton width="100%" height={220} borderRadius={12} />
        <Skeleton width="40%" height={16} />
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

  if (!set) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <Empty
          icon="layers"
          title={t('Study set not found')}
          description={t('It may have been deleted, or it belongs to another account.')}
        />
      </View>
    );
  }

  if (!cards.length) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <Empty
          icon="layers"
          title={t('This set has no cards yet')}
          description={t('Add cards to it on the web and they will appear here.')}
        />
      </View>
    );
  }

  const card = cards[Math.min(at, cards.length - 1)];
  const atFirst = at === 0;
  const atLast = at >= cards.length - 1;

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
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.titleRow}>
        <Text
          style={[
            styles.title,
            { color: colors.foreground, fontFamily: colors.fontFamily.sansBold },
          ]}
          numberOfLines={2}
        >
          {set.title}
        </Text>
        {set.subject ? <Badge variant="secondary">{set.subject}</Badge> : null}
      </View>

      <Progress at={at + 1} of={cards.length} />

      <Card
        card={card}
        showAnswer={showAnswer}
        onTurn={() => setShowAnswer((shown) => !shown)}
      />

      <View style={styles.controls}>
        <Pressable
          onPress={() => move(-1)}
          disabled={atFirst}
          accessibilityRole="button"
          accessibilityLabel={t('Previous card')}
          accessibilityState={{ disabled: atFirst }}
          style={[
            styles.control,
            {
              borderColor: colors.border,
              borderRadius: colors.radius,
              opacity: atFirst ? 0.4 : 1,
            },
          ]}
        >
          <Feather name="chevron-left" size={18} color={colors.foreground} />
        </Pressable>
        <Pressable
          onPress={() => move(1)}
          disabled={atLast}
          accessibilityRole="button"
          accessibilityLabel={t('Next card')}
          accessibilityState={{ disabled: atLast }}
          style={[
            styles.control,
            styles.controlPrimary,
            {
              backgroundColor: colors.primary,
              borderColor: colors.primary,
              borderRadius: colors.radius,
              opacity: atLast ? 0.4 : 1,
            },
          ]}
        >
          <Text
            style={[
              styles.controlLabel,
              { color: colors.primaryForeground, fontFamily: colors.fontFamily.sansMedium },
            ]}
          >
            {t('Next card')}
          </Text>
          <Feather name="chevron-right" size={18} color={colors.primaryForeground} />
        </Pressable>
      </View>

      {atLast ? (
        <Text
          style={[
            styles.finished,
            { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
          ]}
        >
          {t('That is the last card in this set.')}
        </Text>
      ) : null}

      {isError ? (
        // The list is already on screen from the cache, so a failed refresh is
        // a note rather than a takeover.
        <Text
          style={[
            styles.finished,
            { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
          ]}
        >
          {describeApiFailure(error, t('Could not refresh this set.'), t)}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  padded: { padding: 16, gap: 16 },
  titleRow: { gap: 8 },
  title: { fontSize: 22, letterSpacing: -0.3 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  progressLabel: { fontSize: 13 },
  card: {
    borderWidth: 2,
    padding: 20,
    minHeight: 220,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  cardSide: { fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase' },
  cardFace: { fontSize: 22, lineHeight: 30, textAlign: 'center' },
  turnHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  turnHintText: { fontSize: 12 },
  controls: { flexDirection: 'row', gap: 10 },
  control: {
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  controlPrimary: { flex: 1 },
  controlLabel: { fontSize: 15 },
  finished: { fontSize: 13, textAlign: 'center' },
});
