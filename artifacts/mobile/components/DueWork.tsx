/**
 * @fileOverview Mobile UI role: provides the reusable Due Work component.
 * System connection: composed by Expo Router screens and aligned with shared API/auth/purchase state where required.
 */
/**
 * What is due, on the first screen, with a box to tick.
 *
 * "What am I supposed to be doing?" is the most phone-shaped question this
 * product answers, and the phone could not answer it: /assignments/today was
 * served since the feature shipped and described nowhere, so there was no hook
 * to call. See contractDescribesEveryRoute.test.ts.
 *
 * Above the study sets on the dashboard, because work someone else set
 * outranks work you set yourself.
 *
 * Completed assignments are dropped rather than shown with a line through
 * them. On a laptop a finished list is a record; on a phone it is four rows of
 * scrolling between you and the thing you opened the app for. The count of
 * what is done stays visible in the heading, so finishing something still
 * reads as progress.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Skeleton } from '@workspace/edu-ds/components/native/skeleton';
import {
  getListMyAssignmentsQueryKey,
  setAssignmentCompletion,
  useListMyAssignments,
} from '@workspace/api-client-react';
import type { AssignedWork } from '@workspace/api-client-react';
import { ErrorState } from '@/components/ErrorState';
import { useLanguage } from '@/contexts/LanguageContext';

/** How many the dashboard shows before it stops. */
const SHOWN = 4;

/**
 * When it is due, in the fewest words that still answer the question.
 *
 * Compared by calendar day rather than by elapsed hours: something due at
 * 09:00 tomorrow is "Tomorrow" whether it is now midnight or noon, and an
 * elapsed-hours comparison would call it "Today" for half of that.
 */
function useDueLabel(dueAt: string | null) {
  const { t, intlLocale } = useLanguage();
  if (!dueAt) return { text: t('No date'), urgent: false, overdue: false };
  const due = new Date(dueAt);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const days = Math.round(
    (new Date(due).setHours(0, 0, 0, 0) - startOfToday.getTime()) /
      (24 * 60 * 60 * 1000),
  );
  if (days < 0) return { text: t('Overdue'), urgent: true, overdue: true };
  if (days === 0) return { text: t('Today'), urgent: true, overdue: false };
  if (days === 1) return { text: t('Tomorrow'), urgent: false, overdue: false };
  return {
    text: due.toLocaleDateString(intlLocale, { day: 'numeric', month: 'short' }),
    urgent: false,
    overdue: false,
  };
}

function Row({
  work,
  onDone,
  busy,
}: {
  work: AssignedWork;
  onDone: () => void;
  busy: boolean;
}) {
  const colors = useColors();
  const { t } = useLanguage();
  const router = useRouter();
  const due = useDueLabel(work.dueAt);

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onDone}
        disabled={busy}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: false, disabled: busy }}
        /*
         * Named after the assignment: a column of these is otherwise
         * announced as "checkbox" four times. The title is a teacher's own
         * words, so the label mixes product wording with data on purpose and
         * nothing here translates the data half.
         */
        accessibilityLabel={`${t('Mark done')}: ${work.title}`}
        hitSlop={6}
        style={[
          styles.check,
          { borderColor: colors.border, opacity: busy ? 0.4 : 1 },
        ]}
      />
      <Pressable
        onPress={() => router.push(`/class/${work.classId}`)}
        accessibilityRole="button"
        accessibilityLabel={`${work.title}, ${work.className}`}
        style={({ pressed }) => [styles.rowText, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Text
          style={[
            styles.title,
            { color: colors.foreground, fontFamily: colors.fontFamily.sansMedium },
          ]}
          numberOfLines={2}
        >
          {work.title}
        </Text>
        <View style={styles.meta}>
          <Text
            style={[
              styles.className,
              {
                color: colors.mutedForeground,
                fontFamily: colors.fontFamily.sans,
              },
            ]}
            numberOfLines={1}
          >
            {work.className}
          </Text>
          <Text
            style={[
              styles.due,
              {
                color: due.overdue
                  ? colors.destructiveText
                  : due.urgent
                    ? colors.warningText
                    : colors.mutedForeground,
                fontFamily: due.urgent
                  ? colors.fontFamily.sansMedium
                  : colors.fontFamily.sans,
              },
            ]}
          >
            {due.text}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

export function DueWork() {
  const { t } = useLanguage();
  const colors = useColors();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, isFetching, refetch } =
    useListMyAssignments();
  const [marking, setMarking] = React.useState<number | null>(null);

  const all = data ?? [];
  const outstanding = all.filter((work) => !work.completed);
  const done = all.length - outstanding.length;

  async function markDone(work: AssignedWork) {
    setMarking(work.id);
    try {
      await setAssignmentCompletion(work.id, { completed: true });
      await queryClient.invalidateQueries({
        queryKey: getListMyAssignmentsQueryKey(),
      });
    } catch {
      // The row stays where it is, which is the honest outcome: the server
      // did not record it, so pretending otherwise would lose the tick on
      // the next refresh with no explanation.
    } finally {
      setMarking(null);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.section}>
        <Skeleton width="35%" height={17} />
        <View style={styles.skeletonStack}>
          {[1, 2].map((i) => (
            <Skeleton key={i} width="100%" height={48} borderRadius={8} />
          ))}
        </View>
      </View>
    );
  }

  if (isError && data === undefined) {
    return (
      <View style={styles.section}>
        <ErrorState
          error={error}
          retrying={isFetching}
          onRetry={() => {
            void refetch();
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text
          style={[
            styles.sectionTitle,
            {
              color: colors.foreground,
              fontFamily: colors.fontFamily.sansSemiBold,
            },
          ]}
        >
          {t('Due')}
        </Text>
        {done > 0 ? (
          <Text
            style={[
              styles.doneCount,
              {
                color: colors.successText,
                fontFamily: colors.fontFamily.sansMedium,
              },
            ]}
          >
            {/* One string, not "{n} done" built from pieces: the count is
                data, so the phrase is assembled here and each half is
                translated whole. */}
            {done === 1 ? t('1 done') : `${done} ${t('done')}`}
          </Text>
        ) : null}
      </View>

      {!outstanding.length ? (
        <Text
          style={[
            styles.clear,
            {
              color: colors.mutedForeground,
              fontFamily: colors.fontFamily.sans,
            },
          ]}
        >
          {all.length ? t('Everything set for you is done.') : t('Nothing is due.')}
        </Text>
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
          {outstanding.slice(0, SHOWN).map((work) => (
            <Row
              key={work.id}
              work={work}
              busy={marking === work.id}
              onDone={() => {
                void markDone(work);
              }}
            />
          ))}
          {outstanding.length > SHOWN ? (
            <Text
              style={[
                styles.more,
                {
                  color: colors.mutedForeground,
                  fontFamily: colors.fontFamily.sans,
                },
              ]}
            >
              {`${outstanding.length - SHOWN} ${t('more')}`}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24, gap: 10 },
  heading: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  sectionTitle: { fontSize: 17, letterSpacing: -0.2 },
  doneCount: { fontSize: 13 },
  skeletonStack: { gap: 8 },
  clear: { fontSize: 13 },
  list: { borderWidth: 1, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    // Above the 44pt touch target both stores ask for.
    minHeight: 56,
  },
  check: { width: 22, height: 22, borderWidth: 2, borderRadius: 6 },
  rowText: { flex: 1, gap: 3 },
  title: { fontSize: 15 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  className: { flex: 1, fontSize: 12 },
  due: { fontSize: 12 },
  more: { fontSize: 12, paddingHorizontal: 14, paddingBottom: 12, paddingTop: 2 },
});
