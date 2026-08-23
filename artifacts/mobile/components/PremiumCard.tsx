/**
 * @fileOverview Mobile UI role: provides the reusable Premium Card component.
 * System connection: composed by Expo Router screens and aligned with shared API/auth/purchase state where required.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { useGetMyUsage } from '@workspace/api-client-react';
import { usePurchases } from '@/contexts/PurchasesContext';

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const colors = useColors();
  const included = limit == null || limit > 0;
  const pct = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const nearLimit = limit != null && used >= limit;
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.meterRow}>
        <Text style={[styles.meterLabel, { color: colors.foreground, fontFamily: colors.fontFamily.sans }]}>
          {label}
        </Text>
        <Text
          style={[
            styles.meterValue,
            {
              color: nearLimit ? colors.destructiveText : colors.mutedForeground,
              fontFamily: colors.fontFamily.sansMedium,
            },
          ]}
        >
          {limit == null ? 'Unlimited' : included ? `${used} / ${limit} allowance used` : 'Not included'}
        </Text>
      </View>
      {limit != null && included ? (
        <View style={[styles.meterTrack, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.meterFill,
              {
                width: `${pct}%` as never,
                backgroundColor: nearLimit ? colors.destructive : colors.primary,
              },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}

export function PremiumCard() {
  const colors = useColors();
  const router = useRouter();
  const { tier } = usePurchases();
  const { data: usage } = useGetMyUsage();
  const planLabel = usage?.plan ?? (tier === 'pro' ? 'Pro' : tier === 'plus' ? 'Plus' : 'Free');
  const isUnlimited = usage?.unlimited === true || planLabel === 'Pro' || planLabel === 'Administrator';
  const isPaid = isUnlimited || planLabel === 'Plus';

  return (
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
      <View style={styles.headerRow}>
        <View
          style={[
            styles.iconBadge,
            {
              backgroundColor: colors.primary + '15',
              borderRadius: colors.radius - 2,
            },
          ]}
        >
          <Feather name="award" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.title,
              {
                color: colors.foreground,
                fontFamily: colors.fontFamily.sansBold,
              },
            ]}
          >
            Casparel {planLabel}
          </Text>
          <Text
            style={[
              styles.subtitle,
              {
                color: colors.mutedForeground,
                fontFamily: colors.fontFamily.sans,
              },
            ]}
          >
            {isUnlimited
              ? 'All account-level AI features are unlocked.'
              : isPaid
                ? 'AI discovery and deep research are active with allowances.'
                : 'Core learning tools are included. AI features are not included.'}
          </Text>
        </View>
      </View>

      {usage ? (
        <View style={{ gap: 12, marginTop: 4 }}>
          <UsageMeter label="AI source research" used={usage.deepResearch.used} limit={usage.deepResearch.limit} />
          <UsageMeter label="AI discovery" used={usage.aiSearch.used} limit={usage.aiSearch.limit} />
        </View>
      ) : null}

      {!isUnlimited ? <Pressable
        onPress={() => router.push('/paywall')}
        accessibilityRole="button"
        accessibilityLabel={isPaid ? 'Upgrade to Casparel Pro' : 'See Plus and Pro plans'}
        style={({ pressed }) => [
          styles.cta,
          {
            backgroundColor: colors.primary,
            borderRadius: colors.radius,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Feather name="arrow-up-circle" size={16} color={colors.primaryForeground} />
        <Text
          style={[
            styles.ctaText,
            {
              color: colors.primaryForeground,
              fontFamily: colors.fontFamily.sansSemiBold,
            },
          ]}
        >
          {isPaid ? 'Upgrade to Pro' : 'See Plus and Pro'}
        </Text>
      </Pressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    padding: 16,
    gap: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBadge: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 15 },
  subtitle: { fontSize: 12, marginTop: 2 },
  perk: { fontSize: 13, lineHeight: 18 },
  meterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  meterLabel: { fontSize: 13 },
  meterValue: { fontSize: 12 },
  meterTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  meterFill: { height: 6, borderRadius: 3 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginTop: 2,
  },
  ctaText: { fontSize: 14 },
});
