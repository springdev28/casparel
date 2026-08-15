import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Button } from '@workspace/edu-ds/components/native/button';
import { usePurchases } from '@/contexts/PurchasesContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  packagesForRole,
  purchasesSupported,
  tierForPackage,
  tierLevel,
  TIER_TITLES,
  type PlanRole,
  type RCPackage,
} from '@/utils/revenuecat';

/**
 * Plan explainers per account role. Student and teacher plans never mix, so a
 * student reads about study depth and a teacher about classroom scale — never
 * the other way round. Numbers must match the server's tier tables. Free's AI
 * line is the taste: enough to see what the feature is, not enough to live on.
 */
const BENEFITS: Record<
  'student' | 'teacher' | 'generic',
  { icon: string; title: string; body: string }[]
> = {
  student: [
    {
      icon: 'book-open',
      title: 'Free',
      body: '25 activities, 10 goals, 5 lists, 3 canvases — and a daily AI taste: 2 discovery searches and 1 deep report (2 per month).',
    },
    {
      icon: 'sparkles',
      title: 'Student Plus',
      body: '400 activities, 150 goals, 75 lists and 40 canvases, with 30 AI discovery searches and 8 cited deep reports a day.',
    },
    {
      icon: 'award',
      title: 'Student Pro',
      body: '1,500 activities, 500 goals, 300 lists and 150 canvases, with 90 discovery searches and 25 deep reports a day.',
    },
  ],
  teacher: [
    {
      icon: 'book-open',
      title: 'Free',
      body: 'One class of up to 30 with manual seating — and a daily AI taste: 2 discovery searches and 1 deep report (2 per month).',
    },
    {
      icon: 'sparkles',
      title: 'Teacher Plus',
      body: '8 classes of up to 150 members, 250 activities, and 20 AI discovery searches with 5 cited deep reports a day.',
    },
    {
      icon: 'award',
      title: 'Teacher Pro',
      body: '25 classes of up to 400, the explainable seating planner, and 60 discovery searches with 15 deep reports a day.',
    },
  ],
  generic: [
    {
      icon: 'book-open',
      title: 'Free',
      body: 'One class of 30, 25 activities, 10 goals and 5 lists — and a small daily taste of AI discovery and deep research.',
    },
    {
      icon: 'sparkles',
      title: 'Plus',
      body: '5 classes of 100, 250 activities, 100 goals and 50 lists, with 20 AI discovery searches and 5 deep reports a day.',
    },
    {
      icon: 'award',
      title: 'Pro',
      body: '20 classes of 300, 1,000 activities, the seating planner, and 60 discovery searches with 15 deep reports a day.',
    },
  ],
};

function BenefitRow({ icon, title, body }: { icon: string; title: string; body: string }) {
  const colors = useColors();
  return (
    <View style={styles.benefitRow}>
      <View
        style={[
          styles.benefitIcon,
          {
            backgroundColor: colors.primary + '1A',
            borderRadius: colors.radius,
          },
        ]}
      >
        <Feather name={icon as never} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[
            styles.benefitTitle,
            {
              color: colors.foreground,
              fontFamily: colors.fontFamily.sansSemiBold,
            },
          ]}
        >
          {title}
        </Text>
        <Text
          style={[
            styles.benefitBody,
            {
              color: colors.mutedForeground,
              fontFamily: colors.fontFamily.sans,
            },
          ]}
        >
          {body}
        </Text>
      </View>
    </View>
  );
}

export default function PaywallScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { ready, available, tier, isPlus, isPro, packages, purchase, restore } = usePurchases();
  const { user } = useAuth();
  const accountRole: PlanRole | null =
    user?.role === 'teacher' ? 'teacher' : user?.role === 'student' ? 'student' : null;
  const benefits = BENEFITS[accountRole ?? 'generic'];
  // Roles never mix at the point of sale: a student is only offered student
  // (or generic) packages, a teacher only teacher (or generic) ones. On a
  // Plus-level plan, only the Pro-level packages remain as upgrades.
  const rolePackages = packagesForRole(packages, accountRole);
  const upgradePackages = isPlus
    ? rolePackages.filter((pkg) => tierLevel(tierForPackage(pkg)) === 'pro')
    : rolePackages;

  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Default the selection to the annual package when offerings arrive, else the first.
  useEffect(() => {
    if (selected && upgradePackages.some((pkg) => pkg.identifier === selected)) return;
    const plusAnnual = upgradePackages.find(
      (pkg) =>
        tierLevel(tierForPackage(pkg)) === 'plus' &&
        pkg.packageType?.toUpperCase() === 'ANNUAL',
    );
    const annual = upgradePackages.find((pkg) => pkg.packageType?.toUpperCase() === 'ANNUAL');
    setSelected((plusAnnual ?? annual ?? upgradePackages[0])?.identifier ?? null);
  }, [upgradePackages, selected]);

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  }

  // "Best value" + computed savings on the annual package vs. 12× monthly.
  function badgeFor(pkg: RCPackage): string | null {
    if (pkg.packageType?.toUpperCase() !== 'ANNUAL') return null;
    const packageTier = tierForPackage(pkg);
    const monthlyPkg = packages.find(
      (candidate) =>
        tierForPackage(candidate) === packageTier &&
        candidate.packageType?.toUpperCase() === 'MONTHLY',
    );
    const monthlyPrice = monthlyPkg?.product.price ?? 0;
    if (monthlyPrice > 0 && pkg.product.price > 0) {
      const pct = Math.round((1 - pkg.product.price / (monthlyPrice * 12)) * 100);
      if (pct > 0) return `Best value · Save ${pct}%`;
    }
    return 'Best value';
  }

  async function handlePurchase() {
    const pkg = upgradePackages.find((p) => p.identifier === selected);
    if (!pkg) return;
    setBusy(true);
    const result = await purchase(pkg);
    setBusy(false);
    if (result === 'success') {
      const purchasedTier = tierForPackage(pkg);
      Alert.alert(`Welcome to Casparel ${TIER_TITLES[purchasedTier]}`, 'Your subscription features are now unlocked. Thank you!', [
        { text: 'Great', onPress: close },
      ]);
    } else if (result === 'error') {
      Alert.alert('Purchase failed', 'Something went wrong. Please try again.');
    } else if (result === 'unsupported') {
      Alert.alert('Not available here', 'In-app purchases are only available in the mobile app.');
    }
    // 'cancelled' → stay silent
  }

  async function handleRestore() {
    setBusy(true);
    const ok = await restore();
    setBusy(false);
    Alert.alert(
      ok ? 'Purchases restored' : 'Nothing to restore',
      ok ? 'Your paid plan is active again.' : "We couldn't find a previous purchase for this account.",
      ok ? [{ text: 'Great', onPress: close }] : undefined,
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      {/* Close */}
      <Pressable
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel="Close subscription plans"
        style={[
          styles.closeBtn,
          {
            top: insets.top + 8,
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
        hitSlop={10}
      >
        <Feather name="x" size={20} color={colors.mutedForeground} />
      </Pressable>

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 56,
          paddingBottom: insets.bottom + 28,
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <Animated.View entering={FadeInDown.duration(450)}>
          <LinearGradient
            colors={[colors.primary, colors.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.hero, { borderRadius: colors.radius + 6 }]}
          >
            <View
              style={[
                styles.crown,
                {
                  backgroundColor: colors.primaryForeground + '26',
                  borderRadius: 24,
                },
              ]}
            >
              <Feather name="award" size={30} color={colors.primaryForeground} />
            </View>
            <Text
              style={[
                styles.title,
                {
                  color: colors.primaryForeground,
                  fontFamily: colors.fontFamily.sansBold,
                },
              ]}
            >
              Choose your Casparel plan
            </Text>
            <Text
              style={[
                styles.subtitle,
                {
                  color: colors.primaryForeground + 'DD',
                  fontFamily: colors.fontFamily.sans,
                },
              ]}
            >
              Keep the core free, then add only the AI access you need.
            </Text>
          </LinearGradient>
        </Animated.View>

        {/* Benefits */}
        <Animated.View
          entering={FadeInDown.delay(120).duration(450)}
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.radius,
            },
          ]}
        >
          {benefits.map((b) => (
            <BenefitRow key={b.title} {...b} />
          ))}
        </Animated.View>

        {tier !== 'free' ? (
          <View
            style={[
              styles.premiumBanner,
              {
                backgroundColor: colors.primary + '14',
                borderColor: colors.primary + '40',
                borderRadius: colors.radius,
              },
            ]}
          >
            <Feather name="check-circle" size={18} color={colors.primary} />
            <Text
              style={[
                styles.premiumText,
                {
                  color: colors.primary,
                  fontFamily: colors.fontFamily.sansSemiBold,
                },
              ]}
            >
              You're on Casparel {TIER_TITLES[tier]}. Thank you!
            </Text>
          </View>
        ) : null}

        {isPro ? null : !ready ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : !available || upgradePackages.length === 0 ? (
          <View style={[styles.notice, { borderColor: colors.border, borderRadius: colors.radius }]}>
            <Text
              style={[
                styles.noticeText,
                {
                  color: colors.mutedForeground,
                  fontFamily: colors.fontFamily.sans,
                },
              ]}
            >
              {Platform.OS === 'web'
                ? 'Open Casparel on your phone to choose Plus or Pro.'
                : 'Plans are loading or unavailable right now. Please try again shortly.'}
            </Text>
          </View>
        ) : (
          <>
            {/* Package options */}
            <Animated.View entering={FadeInDown.delay(200).duration(450)} style={{ gap: 10, marginTop: 18 }}>
              {upgradePackages.map((pkg) => (
                <PackageOption
                  key={pkg.identifier}
                  pkg={pkg}
                  badge={badgeFor(pkg)}
                  selected={pkg.identifier === selected}
                  onSelect={() => setSelected(pkg.identifier)}
                />
              ))}
            </Animated.View>

            {/* CTA */}
            <Animated.View entering={FadeInDown.delay(280).duration(450)}>
              <View style={{ marginTop: 18 }}>
                <Button size="lg" onPress={handlePurchase} loading={busy} disabled={!selected}>
                  Continue
                </Button>
              </View>
            </Animated.View>
          </>
        )}

        {/*
          Restore sits OUTSIDE the branches above. It used to render only where
          offerings had loaded successfully, so it disappeared in exactly the
          state a returning subscriber needs it: offerings still loading, or
          failing to load on a flaky connection, leaving them looking at a
          paywall for something they had already paid for. Apple also requires
          a restore path be reachable.

          Gated on purchasesSupported as well as !isPremium, because on web
          restore() always resolves false, so showing it there would only ever
          produce a misleading "Nothing to restore" next to the notice telling
          the user to open the app on their phone.
        */}
        {tier === 'free' && purchasesSupported ? (
          <Pressable
            onPress={handleRestore}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Restore previous purchases"
            style={styles.restore}
          >
            <Text
              style={[
                styles.restoreText,
                {
                  color: colors.primary,
                  fontFamily: colors.fontFamily.sansMedium,
                },
              ]}
            >
              Restore purchases
            </Text>
          </Pressable>
        ) : null}

        {/* Legal */}
        <Text
          style={[
            styles.legal,
            {
              color: colors.mutedForeground,
              fontFamily: colors.fontFamily.sans,
            },
          ]}
        >
          Subscriptions renew automatically until cancelled. Manage or cancel anytime in your{' '}
          {Platform.OS === 'ios' ? 'App Store' : 'Google Play'} account settings.{' '}
          <Text
            accessibilityRole="link"
            style={styles.link}
            onPress={() => Linking.openURL('https://casparel.com/terms')}
          >
            Terms
          </Text>{' '}
          &middot;{' '}
          <Text
            accessibilityRole="link"
            style={styles.link}
            onPress={() => Linking.openURL('https://casparel.com/privacy')}
          >
            Privacy
          </Text>
        </Text>
      </ScrollView>
    </View>
  );
}

function PackageOption({
  pkg,
  selected,
  onSelect,
  badge,
}: {
  pkg: RCPackage;
  selected: boolean;
  onSelect: () => void;
  badge?: string | null;
}) {
  const colors = useColors();
  const packageTier = tierForPackage(pkg);
  const period =
    pkg.packageType?.toUpperCase() === 'ANNUAL'
      ? 'Billed yearly'
      : pkg.packageType?.toUpperCase() === 'MONTHLY'
        ? 'Billed monthly'
        : pkg.product.description || '';
  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${pkg.product.title || pkg.identifier}, ${pkg.product.priceString}${period ? `, ${period}` : ''}`}
      style={[
        styles.pkg,
        {
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: selected ? colors.primary + '10' : colors.card,
          borderRadius: colors.radius,
          borderWidth: selected ? 2 : 1,
        },
      ]}
    >
      {badge ? (
        <View style={[styles.pkgBadge, { backgroundColor: colors.accent, borderRadius: colors.radius }]}>
          <Text
            style={[
              styles.pkgBadgeText,
              {
                color: colors.primaryForeground,
                fontFamily: colors.fontFamily.sansSemiBold,
              },
            ]}
          >
            {badge}
          </Text>
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text
          style={[
            styles.pkgTitle,
            {
              color: colors.foreground,
              fontFamily: colors.fontFamily.sansSemiBold,
            },
          ]}
        >
          Casparel {TIER_TITLES[packageTier]}
        </Text>
        {period ? (
          <Text
            style={[
              styles.pkgPeriod,
              {
                color: colors.mutedForeground,
                fontFamily: colors.fontFamily.sans,
              },
            ]}
          >
            {period}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.pkgPrice, { color: colors.foreground, fontFamily: colors.fontFamily.sansBold }]}>
        {pkg.product.priceString}
      </Text>
      <View
        style={[
          styles.radio,
          {
            borderColor: selected ? colors.primary : colors.border,
            backgroundColor: selected ? colors.primary : 'transparent',
          },
        ]}
      >
        {selected ? <Feather name="check" size={12} color={colors.primaryForeground} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  closeBtn: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
    paddingVertical: 26,
    paddingHorizontal: 20,
  },
  crown: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 26, letterSpacing: -0.5, textAlign: 'center' },
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 300,
  },
  card: { borderWidth: 1, padding: 16, gap: 16 },
  benefitRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  benefitIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitTitle: { fontSize: 15 },
  benefitBody: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  premiumBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    padding: 14,
    marginTop: 18,
  },
  premiumText: { fontSize: 14 },
  loading: { paddingVertical: 32, alignItems: 'center' },
  notice: { borderWidth: 1, borderStyle: 'dashed', padding: 16, marginTop: 18 },
  noticeText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  pkg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    position: 'relative',
  },
  pkgBadge: {
    position: 'absolute',
    top: -9,
    right: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    zIndex: 1,
  },
  pkgBadgeText: { fontSize: 10, letterSpacing: 0.2 },
  pkgTitle: { fontSize: 15 },
  pkgPeriod: { fontSize: 12, marginTop: 2 },
  pkgPrice: { fontSize: 16 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restore: { alignItems: 'center', paddingVertical: 14 },
  restoreText: { fontSize: 14 },
  legal: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 18 },
  link: { textDecorationLine: 'underline' },
});
