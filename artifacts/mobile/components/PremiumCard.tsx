import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { useGetMyUsage } from '@workspace/api-client-react';
import { usePurchases } from '@/contexts/PurchasesContext';

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const colors = useColors();
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
          {limit == null ? 'Unlimited' : `${used} / ${limit} allowance used`}
        </Text>
      </View>
      {limit != null ? (
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
  const { isPremium } = usePurchases();
  const { data: usage } = useGetMyUsage();

  if (isPremium) {
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.primary + '12',
            borderColor: colors.primary + '40',
            borderRadius: colors.radius,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <View
            style={[
              styles.iconBadge,
              {
                backgroundColor: colors.primary + '22',
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
              Casparel Premium
            </Text>
            <Text
              style={[
                styles.subtitle,
                {
                  color: colors.primary,
                  fontFamily: colors.fontFamily.sansMedium,
                },
              ]}
            >
              Active, thank you!
            </Text>
          </View>
          <Feather name="check-circle" size={20} color={colors.primary} />
        </View>
        <Text
          style={[
            styles.perk,
            {
              color: colors.mutedForeground,
              fontFamily: colors.fontFamily.sans,
            },
          ]}
        >
          Unlimited deep source research is unlocked.
        </Text>
      </View>
    );
  }

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
            Upgrade to Premium
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
            Remove the daily deep-research limit.
          </Text>
        </View>
      </View>

      {usage ? (
        <View style={{ gap: 12, marginTop: 4 }}>
          <UsageMeter label="AI source research" used={usage.deepResearch.used} limit={usage.deepResearch.limit} />
        </View>
      ) : null}

      <Pressable
        onPress={() => router.push('/paywall')}
        accessibilityRole="button"
        accessibilityLabel="See Premium plans"
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
          See Premium plans
        </Text>
      </Pressable>
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
