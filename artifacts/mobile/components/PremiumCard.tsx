import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { useGetMyUsage } from '@workspace/api-client-react';
import { usePurchases } from '@/contexts/PurchasesContext';
import { TIER_TITLES, tierLevel } from '@/utils/revenuecat';
import { useLanguage } from '@/contexts/LanguageContext';

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const { t } = useLanguage();
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
          {limit == null ? t('Unlimited') : included ? `${used} / ${limit} ${t('allowance used')}` : t('Not included')}
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
  const { t } = useLanguage();
  const colors = useColors();
  const router = useRouter();
  const { tier } = usePurchases();
  const { data: usage } = useGetMyUsage();
  // The server label wins whenever it has answered; RevenueCat's tier is the
  // fallback so the card is not stuck on "Free" while usage is loading.
  const planLabel = usage?.plan ?? TIER_TITLES[tier];
  // Unlimited is an administrator property. No paid tier is uncapped, so the
  // meters below always render for subscribers — including Pro-level plans.
  const isUnlimited = usage?.unlimited === true;
  const serverLevel =
    usage?.tier === 'administrator'
      ? 'pro'
      : usage?.tier
        ? tierLevel(usage.tier as Parameters<typeof tierLevel>[0])
        : null;
  const level = serverLevel ?? tierLevel(tier);
  const isPaid = isUnlimited || level !== 'free';

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
              ? t('Administrator account: AI usage is uncapped.')
              : isPaid
                ? t('AI discovery and deep research are active with allowances.')
                : t('Core tools plus a small taste of AI are included.')}
          </Text>
        </View>
      </View>

      {/*
        The two sub-objects, not just `usage`. A response missing them is
        truthy, so this read `usage.deepResearch.used` on undefined and threw
        -- which the error boundary turns into "Something went wrong" for the
        entire profile screen. One endpoint answering oddly should cost its
        own card, not the screen it sits on.
      */}
      {usage?.deepResearch && usage?.aiSearch ? (
        <View style={{ gap: 12, marginTop: 4 }}>
          <UsageMeter label={t('AI source research')} used={usage.deepResearch.used} limit={usage.deepResearch.limit} />
          <UsageMeter label={t('AI discovery')} used={usage.aiSearch.used} limit={usage.aiSearch.limit} />
        </View>
      ) : null}

      {!isUnlimited && level !== 'pro' ? <Pressable
        onPress={() => router.push('/paywall')}
        accessibilityRole="button"
        accessibilityLabel={isPaid ? t('Upgrade to the Pro plan') : t('See subscription plans')}
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
          {isPaid ? t('Upgrade to Pro') : t('See plans')}
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
