import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import {
  getGetMyUsageQueryKey,
  useGetResourceSourceReview,
  getGetResourceSourceReviewQueryKey,
  useGetMyUsage,
  type SourceReview,
  type SourceReviewLink,
} from '@workspace/api-client-react';
import { usePurchases } from '@/contexts/PurchasesContext';
import { useLanguage } from '@/contexts/LanguageContext';

type Mode = 'quick' | 'deep';

const TRUST_COLOR: Record<string, 'chart2' | 'chart3' | 'destructive' | 'mutedForeground'> = {
  high: 'chart2',
  medium: 'chart3',
  low: 'destructive',
  unknown: 'mutedForeground',
};

function TrustBadge({ level }: { level: string }) {
  const colors = useColors();
  const token = TRUST_COLOR[level] ?? 'mutedForeground';
  const color = colors[token];
  return (
    <View style={[styles.trustBadge, { backgroundColor: color + '20', borderColor: color + '55' }]}>
      <Feather name="shield" size={12} color={color} />
      <Text style={[styles.trustText, { color, fontFamily: colors.fontFamily.sansSemiBold }]}>
        {level.charAt(0).toUpperCase() + level.slice(1)} trust
      </Text>
    </View>
  );
}

function Bullets({ title, items, icon, tint }: { title: string; items: string[]; icon: string; tint: string }) {
  const colors = useColors();
  if (!items.length) return null;
  return (
    <View style={{ gap: 6 }}>
      <Text
        style={[
          styles.blockTitle,
          {
            color: colors.foreground,
            fontFamily: colors.fontFamily.sansSemiBold,
          },
        ]}
      >
        {title}
      </Text>
      {items.map((it, i) => (
        <View key={i} style={styles.bulletRow}>
          <Feather name={icon as never} size={13} color={tint} style={{ marginTop: 3 }} />
          <Text
            style={[
              styles.bulletText,
              {
                color: colors.mutedForeground,
                fontFamily: colors.fontFamily.sans,
              },
            ]}
          >
            {it}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ReportView({ review }: { review: SourceReview }) {
  const { t } = useLanguage();
  const colors = useColors();
  return (
    <View style={{ gap: 14 }}>
      <View style={styles.reportHead}>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.sourceName,
              {
                color: colors.foreground,
                fontFamily: colors.fontFamily.sansBold,
              },
            ]}
          >
            {review.sourceName}
          </Text>
          <Text
            style={[
              styles.sourceType,
              {
                color: colors.mutedForeground,
                fontFamily: colors.fontFamily.sans,
              },
            ]}
          >
            {review.sourceType}
          </Text>
        </View>
        <TrustBadge level={review.trustLevel} />
      </View>

      <Text style={[styles.summary, { color: colors.foreground, fontFamily: colors.fontFamily.sans }]}>
        {review.summary}
      </Text>

      {review.trustReason ? (
        <Text
          style={[
            styles.reason,
            {
              color: colors.mutedForeground,
              fontFamily: colors.fontFamily.sans,
            },
          ]}
        >
          {review.trustReason}
        </Text>
      ) : null}

      <Bullets title={t('Strengths')} items={review.strengths ?? []} icon="check" tint={colors.chart2} />
      <Bullets title={t('Concerns')} items={review.concerns ?? []} icon="alert-triangle" tint={colors.chart3} />

      {review.links && review.links.length > 0 ? (
        <View style={{ gap: 6 }}>
          <Text
            style={[
              styles.blockTitle,
              {
                color: colors.foreground,
                fontFamily: colors.fontFamily.sansSemiBold,
              },
            ]}
          >
            {t('Sources')}
          </Text>
          {review.links.map((link: SourceReviewLink, i) => (
            <Pressable
              key={i}
              accessibilityRole="link"
              accessibilityLabel={`Open source: ${link.label}`}
              onPress={() => Linking.openURL(link.url)}
              style={styles.linkRow}
            >
              <Feather name="external-link" size={13} color={colors.primary} />
              <Text
                style={[styles.linkText, { color: colors.primary, fontFamily: colors.fontFamily.sans }]}
                numberOfLines={1}
              >
                {link.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function SourceReviewSection({ resourceId }: { resourceId: number }) {
  const { t } = useLanguage();
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isPremium } = usePurchases();
  const { data: usage } = useGetMyUsage();
  const [mode, setMode] = useState<Mode | null>(null);

  const deepLimit = usage?.deepResearch.limit ?? null;
  const deepUsed = usage?.deepResearch.used ?? 0;
  // Every plan carries a deep-research allowance now — Free's is a small
  // taste — so nothing is pre-blocked by plan. Only a spent allowance stops
  // the button, and only admins report a null (uncapped) limit.
  const paidLevel = usage?.tier != null && usage.tier !== 'free' && usage.tier !== 'administrator';
  const canUpgrade = !usage?.unlimited && (isPremium ? paidLevel : true);
  const deepLimitReached = deepLimit != null && deepUsed >= deepLimit;
  const deepRemaining = deepLimit == null ? null : Math.max(0, deepLimit - deepUsed);
  /*
   * How long the number in the hint has to last.
   *
   * This said "today" for everyone, and Free's allowance is two reports per
   * rolling thirty days -- so the sentence on the screen that sells the
   * upgrade overstated what a free account gets by a factor of thirty. The
   * server now says which window binds rather than the phone guessing from
   * the tier.
   */
  const deepIsMonthly = usage?.deepResearch.window === 'month';
  const deepWindowLabel = deepIsMonthly ? 'in the next 30 days' : 'today';

  const { data, isFetching, isError, error, refetch } = useGetResourceSourceReview(
    resourceId,
    { mode: mode ?? 'quick' },
    {
      query: {
        enabled: mode !== null,
        retry: false,
        staleTime: 5 * 60 * 1000,
        queryKey: getGetResourceSourceReviewQueryKey(resourceId, {
          mode: mode ?? 'quick',
        }),
      },
    },
  );

  /**
   * What went wrong, in the server's own words.
   *
   * This said "Couldn't complete the research. You may have reached a daily
   * limit." -- a guess, and usually the wrong one. The server distinguishes a
   * report already running, a daily limit, a monthly limit, the service-wide
   * budget and the provider being unreachable, and it is the provider being
   * unreachable that people actually hit. Telling somebody they have used up
   * an allowance they still have is worse than saying nothing, because it
   * sends them to the paywall for a problem money cannot fix.
   */
  const failureMessage =
    (error as { data?: { error?: string } } | null)?.data?.error?.trim() ||
    t("Couldn't complete the research. Please try again.");
  /**
   * Retrying a spent allowance just fails again. The quick check does not:
   * it reads the maintained registry, needs no AI, and is the button directly
   * below this message.
   */
  const retryWouldHelp = (error as { status?: number } | null)?.status !== 429;

  useEffect(() => {
    if (mode === 'deep' && data) {
      void queryClient.invalidateQueries({ queryKey: getGetMyUsageQueryKey() });
    }
  }, [data, mode, queryClient]);

  function runQuick() {
    setMode('quick');
  }

  function runDeep() {
    if (deepLimitReached) {
      // A spent allowance is an upsell only while a bigger plan exists; a
      // Pro-level account is told when it resets instead of being sold to.
      if (canUpgrade) router.push('/paywall');
      return;
    }
    setMode('deep');
  }

  return (
    <View style={[styles.section, { marginTop: 24 }]}>
      <View style={styles.headingRow}>
        <Feather name="search" size={16} color={colors.primary} />
        <Text
          style={[
            styles.sectionTitle,
            {
              color: colors.foreground,
              fontFamily: colors.fontFamily.sansSemiBold,
            },
          ]}
        >
          {t('Source Review')}
        </Text>
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderRadius: colors.radius,
          },
        ]}
      >
        {mode === null ? (
          <Text
            style={[
              styles.prompt,
              {
                color: colors.mutedForeground,
                fontFamily: colors.fontFamily.sans,
              },
            ]}
          >
            {t(
              "Evaluate who's behind this resource and how much to trust it. Quick check uses Casparel's maintained provenance registry without AI. Deep research runs live AI web research for a fuller, cited report.",
            )}
          </Text>
        ) : isFetching ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
            <Text
              style={[
                styles.loadingText,
                {
                  color: colors.mutedForeground,
                  fontFamily: colors.fontFamily.sans,
                },
              ]}
            >
              {mode === 'deep' ? 'Running live web research…' : 'Checking source registry…'}
            </Text>
          </View>
        ) : isError ? (
          <View style={{ gap: 10 }}>
            <Text
              style={[
                styles.prompt,
                {
                  color: colors.destructiveText,
                  fontFamily: colors.fontFamily.sans,
                },
              ]}
            >
              {failureMessage}
            </Text>
            {mode === 'deep' ? (
              <Text
                style={[
                  styles.loadingText,
                  {
                    color: colors.mutedForeground,
                    fontFamily: colors.fontFamily.sans,
                  },
                ]}
              >
                {t('Quick check below reads the maintained registry. No AI, no allowance.')}
              </Text>
            ) : null}
            {retryWouldHelp ? (
            <Pressable onPress={() => refetch()} style={styles.retry}>
              <Feather name="refresh-cw" size={13} color={colors.primary} />
              <Text
                style={[
                  styles.retryText,
                  {
                    color: colors.primary,
                    fontFamily: colors.fontFamily.sansMedium,
                  },
                ]}
              >
                {t('Try again')}
              </Text>
            </Pressable>
            ) : null}
          </View>
        ) : data ? (
          <ReportView review={data} />
        ) : null}

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable
            onPress={runQuick}
            disabled={isFetching}
            accessibilityRole="button"
            accessibilityLabel={t('Run a quick non-AI source check')}
            style={[styles.actionBtn, { borderColor: colors.border, opacity: isFetching ? 0.5 : 1 }]}
          >
            <Feather name="zap" size={14} color={colors.foreground} />
            <Text
              style={[
                styles.actionText,
                {
                  color: colors.foreground,
                  fontFamily: colors.fontFamily.sansMedium,
                },
              ]}
            >
              {t('Quick check')}
            </Text>
          </Pressable>
          <Pressable
            onPress={runDeep}
            disabled={isFetching}
            accessibilityRole="button"
            accessibilityLabel={
              deepLimitReached ? t('View paid plans for deep AI research') : t('Run deep source research')
            }
            style={[
              styles.actionBtn,
              styles.deepBtn,
              {
                backgroundColor: colors.primary,
                opacity: isFetching ? 0.5 : 1,
              },
            ]}
          >
            <Feather name={deepLimitReached ? 'lock' : 'search'} size={14} color={colors.primaryForeground} />
            <Text
              style={[
                styles.actionText,
                {
                  color: colors.primaryForeground,
                  fontFamily: colors.fontFamily.sansSemiBold,
                },
              ]}
            >
              {t('Deep research')}
            </Text>
          </Pressable>
        </View>
        {!usage?.unlimited ? (
          <Text
            style={[
              styles.deepHint,
              {
                color: colors.mutedForeground,
                fontFamily: colors.fontFamily.sans,
              },
            ]}
          >
            {deepLimitReached
              ? paidLevel
                ? deepIsMonthly
                  ? t('Your deep-research allowance for this 30 days is used. Larger plans include more.')
                  : 'Today\u2019s deep-research allowance is used. It resets daily; larger plans include more.'
                : t('Your free deep-research taste is used for now. Plus plans include far more.')
              : deepRemaining == null
                ? t('Deep research is uncapped on this account.')
                : `${deepRemaining} deep ${deepRemaining === 1 ? 'report' : 'reports'} remaining ${deepWindowLabel} on your plan.`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 16 },
  card: { borderWidth: 1, padding: 16, gap: 14 },
  prompt: { fontSize: 14, lineHeight: 20 },
  loading: { alignItems: 'center', gap: 10, paddingVertical: 16 },
  loadingText: { fontSize: 13 },
  reportHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  sourceName: { fontSize: 16 },
  sourceType: { fontSize: 12, marginTop: 2 },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  trustText: { fontSize: 11 },
  summary: { fontSize: 14, lineHeight: 21 },
  reason: { fontSize: 13, lineHeight: 19, fontStyle: 'italic' },
  blockTitle: { fontSize: 13 },
  bulletRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  bulletText: { flex: 1, fontSize: 13, lineHeight: 19 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  linkText: { flex: 1, fontSize: 13 },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  retryText: { fontSize: 13 },
  actions: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 11,
  },
  deepBtn: { borderWidth: 0 },
  actionText: { fontSize: 14 },
  deepHint: { fontSize: 12, textAlign: 'center', marginTop: -4 },
});
