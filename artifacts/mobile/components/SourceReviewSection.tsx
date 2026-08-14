import React, { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import {
  useGetResourceSourceReview,
  getGetResourceSourceReviewQueryKey,
  type SourceReview,
  type SourceReviewLink,
} from '@workspace/api-client-react';
import { usePurchases } from '@/contexts/PurchasesContext';

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
      <Text style={[styles.blockTitle, { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }]}>
        {title}
      </Text>
      {items.map((it, i) => (
        <View key={i} style={styles.bulletRow}>
          <Feather name={icon as never} size={13} color={tint} style={{ marginTop: 3 }} />
          <Text style={[styles.bulletText, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
            {it}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ReportView({ review }: { review: SourceReview }) {
  const colors = useColors();
  return (
    <View style={{ gap: 14 }}>
      <View style={styles.reportHead}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sourceName, { color: colors.foreground, fontFamily: colors.fontFamily.sansBold }]}>
            {review.sourceName}
          </Text>
          <Text style={[styles.sourceType, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
            {review.sourceType}
          </Text>
        </View>
        <TrustBadge level={review.trustLevel} />
      </View>

      <Text style={[styles.summary, { color: colors.foreground, fontFamily: colors.fontFamily.sans }]}>
        {review.summary}
      </Text>

      {review.trustReason ? (
        <Text style={[styles.reason, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
          {review.trustReason}
        </Text>
      ) : null}

      <Bullets title="Strengths" items={review.strengths ?? []} icon="check" tint={colors.chart2} />
      <Bullets title="Concerns" items={review.concerns ?? []} icon="alert-triangle" tint={colors.chart3} />

      {review.links && review.links.length > 0 ? (
        <View style={{ gap: 6 }}>
          <Text style={[styles.blockTitle, { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }]}>
            Sources
          </Text>
          {review.links.map((link: SourceReviewLink, i) => (
            <Pressable key={i} onPress={() => Linking.openURL(link.url)} style={styles.linkRow}>
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
  const colors = useColors();
  const router = useRouter();
  const { isPremium } = usePurchases();
  const [mode, setMode] = useState<Mode | null>(null);

  const { data, isFetching, isError, refetch } = useGetResourceSourceReview(
    resourceId,
    { mode: mode ?? 'quick' },
    {
      query: {
        enabled: mode !== null,
        retry: false,
        staleTime: 5 * 60 * 1000,
        queryKey: getGetResourceSourceReviewQueryKey(resourceId, { mode: mode ?? 'quick' }),
      },
    },
  );

  function runQuick() {
    setMode('quick');
  }

  function runDeep() {
    if (!isPremium) {
      router.push('/paywall');
      return;
    }
    setMode('deep');
  }

  return (
    <View style={[styles.section, { marginTop: 24 }]}>
      <View style={styles.headingRow}>
        <Feather name="search" size={16} color={colors.primary} />
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }]}>
          AI Source Research
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        {mode === null ? (
          <Text style={[styles.prompt, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
            Evaluate who's behind this resource and how much to trust it. Quick check uses AI knowledge; deep research
            runs live web research for a fuller, cited report.
          </Text>
        ) : isFetching ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
              {mode === 'deep' ? 'Running live web research…' : 'Analyzing source…'}
            </Text>
          </View>
        ) : isError ? (
          <View style={{ gap: 10 }}>
            <Text style={[styles.prompt, { color: colors.destructive, fontFamily: colors.fontFamily.sans }]}>
              Couldn't complete the research. You may have reached a daily limit.
            </Text>
            <Pressable onPress={() => refetch()} style={styles.retry}>
              <Feather name="refresh-cw" size={13} color={colors.primary} />
              <Text style={[styles.retryText, { color: colors.primary, fontFamily: colors.fontFamily.sansMedium }]}>
                Try again
              </Text>
            </Pressable>
          </View>
        ) : data ? (
          <ReportView review={data} />
        ) : null}

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable
            onPress={runQuick}
            disabled={isFetching}
            style={[styles.actionBtn, { borderColor: colors.border, opacity: isFetching ? 0.5 : 1 }]}
          >
            <Feather name="zap" size={14} color={colors.foreground} />
            <Text style={[styles.actionText, { color: colors.foreground, fontFamily: colors.fontFamily.sansMedium }]}>
              Quick check
            </Text>
          </Pressable>
          <Pressable
            onPress={runDeep}
            disabled={isFetching}
            style={[styles.actionBtn, styles.deepBtn, { backgroundColor: colors.primary, opacity: isFetching ? 0.5 : 1 }]}
          >
            <Feather name={isPremium ? 'search' : 'lock'} size={14} color={colors.primaryForeground} />
            <Text style={[styles.actionText, { color: colors.primaryForeground, fontFamily: colors.fontFamily.sansSemiBold }]}>
              Deep research
            </Text>
          </Pressable>
        </View>
        {!isPremium ? (
          <Text style={[styles.deepHint, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
            Deep research is a Premium feature.
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
  trustBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
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
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderRadius: 10, paddingVertical: 11 },
  deepBtn: { borderWidth: 0 },
  actionText: { fontSize: 14 },
  deepHint: { fontSize: 12, textAlign: 'center', marginTop: -4 },
});
