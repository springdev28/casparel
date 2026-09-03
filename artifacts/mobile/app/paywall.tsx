/**
 * @fileOverview Mobile screen role: defines the Expo Router Paywall screen or route layout.
 * System connection: composed by Expo Router and backed by auth, onboarding, purchases, secure storage, and the shared API.
 */
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
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Button } from '@workspace/edu-ds/components/native/button';
import { useGetMyUsage } from '@workspace/api-client-react';
import { usePurchases } from '@/contexts/PurchasesContext';
import {
  packageDefinition,
  packagesForRole,
  purchasesSupported,
  tierForPackage,
  TIER_TITLES,
  type RCPackage,
} from '@/utils/revenuecat';
import { useLanguage } from '@/contexts/LanguageContext';
import { FadeInView } from '@/components/FadeInView';
import {
  PLAN_CATALOG,
  formatStorage,
  type SubscriptionTier,
} from '@workspace/plan-economics';

/** Plan explainers shared by every account role. */
/**
 * A name Feather actually has.
 *
 * This was `string`, and `<Feather name={icon as never}>` swallowed the rest,
 * so `sparkles` -- which belongs to a different icon set -- typechecked,
 * bundled, and rendered as a question mark in a grey square on the middle row
 * of every plan, on the screen the whole subscription turns on. Nothing else
 * would have caught it: a missing glyph is a valid character.
 */
type FeatherName = keyof typeof Feather.glyphMap;

function aiSummary(tier: SubscriptionTier): string {
  const plan = PLAN_CATALOG[tier];
  const reportNoun = plan.ai.deepPerMonth === 1 ? 'report' : 'reports';
  return `${plan.ai.searchPerMonth} AI discovery searches and ${plan.ai.deepPerMonth} cited deep ${reportNoun} per 30 days, with daily safety limits; ${formatStorage(plan.storageBytes)} stored uploads.`;
}

const BENEFITS: { icon: FeatherName; title: string; body: string }[] = [
  {
    icon: 'book-open',
    title: 'Free',
    body: `One class of 30, 25 activities, 10 goals and 5 lists — ${aiSummary('free')}`,
  },
  {
    icon: 'zap',
    title: 'Plus',
    body: `5 classes of 100, 250 activities, 100 goals and 50 lists — ${aiSummary('plus')}`,
  },
  {
    icon: 'award',
    title: 'Pro',
    body: `20 classes of 300, 1,000 activities and the seating planner — ${aiSummary('pro')}`,
  },
];

function BenefitRow({ icon, title, body }: { icon: FeatherName; title: string; body: string }) {
  // PLAN_FEATURES is a module constant -- a hook cannot run where it is
  // written -- so it holds the English and this translates it. The title is a
  // plan name and stays as it is in every language.
  const { t } = useLanguage();
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
        <Feather name={icon} size={18} color={colors.primary} />
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
          {t(body)}
        </Text>
      </View>
    </View>
  );
}

export default function PaywallScreen() {
  const { t } = useLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    ready,
    available,
    availabilityIssue,
    tier: revenueCatTier,
    packages,
    customerInfo,
    purchase,
    restore,
  } = usePurchases();
  const { data: usage } = useGetMyUsage();
  const serverTier = usage?.tier;
  const tier = serverTier === 'institutional'
    ? 'institutional'
    : serverTier === 'pro' || revenueCatTier === 'pro'
      ? 'pro'
      : serverTier === 'plus' || revenueCatTier === 'plus'
        ? 'plus'
        : 'free';
  // A plans screen is also where an existing subscriber changes billing
  // period or tier. Never hide the catalog merely because an entitlement is
  // active. Google Play owns the replacement/cancellation lifecycle.
  const planPackages = packagesForRole(packages, null);
  const activeProductIds = new Set(customerInfo?.activeSubscriptions ?? []);

  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Default the selection to the annual package when offerings arrive, else the first.
  useEffect(() => {
    if (selected && planPackages.some((pkg) => pkg.identifier === selected)) return;
    const notCurrent = planPackages.filter(
      (pkg) => !activeProductIds.has(pkg.product.identifier),
    );
    const plusYearly = notCurrent.find((pkg) => pkg.identifier === 'plus_yearly');
    const yearly = notCurrent.find((pkg) => packageDefinition(pkg)?.period === 'yearly');
    setSelected((plusYearly ?? yearly ?? notCurrent[0] ?? planPackages[0])?.identifier ?? null);
  }, [customerInfo, planPackages, selected]);

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  }

  // "Best value" + computed savings on the annual package vs. 12× monthly.
  function badgeFor(pkg: RCPackage): string | null {
    if (packageDefinition(pkg)?.period !== 'yearly') return null;
    const packageTier = tierForPackage(pkg);
    if (!packageTier) return null;
    const monthlyPkg = packages.find(
      (candidate) =>
        tierForPackage(candidate) === packageTier &&
        packageDefinition(candidate)?.period === 'monthly',
    );
    const monthlyPrice = monthlyPkg?.product.price ?? 0;
    if (monthlyPrice > 0 && pkg.product.price > 0) {
      const pct = Math.round((1 - pkg.product.price / (monthlyPrice * 12)) * 100);
      if (pct > 0) return `Best value · Save ${pct}%`;
    }
    return t('Best value');
  }

  async function handlePurchase() {
    const pkg = planPackages.find((p) => p.identifier === selected);
    if (!pkg) return;
    setBusy(true);
    const result = await purchase(pkg);
    setBusy(false);
    if (result === 'success') {
      const purchasedTier = tierForPackage(pkg);
      if (!purchasedTier) return;
      Alert.alert(
        `${t('Welcome to Casparel')} ${TIER_TITLES[purchasedTier]}`,
        t('Your subscription features are now unlocked. Thank you!'),
        [{ text: t('Great'), onPress: close }],
      );
      return;
    }
    if (result === 'cancelled') return; // they chose not to buy; say nothing

    /*
     * Every one of these was "Something went wrong. Please try again."
     *
     * Two of them are not failures. A pending purchase is waiting on a parent's
     * approval or a bank's check and may complete by itself, so inviting a
     * retry invites a second charge for something already in flight. And
     * already-owned means the person has paid: answering them with "something
     * went wrong" rather than restoring what they bought is the worst message
     * a payment flow can produce.
     */
    if (result === 'pending') {
      Alert.alert(t('Waiting for approval'), t('Your purchase needs approval before it completes \u2014 from a parent, or from your bank. There is nothing to pay again; Casparel unlocks by itself once it goes through.'),
      );
      return;
    }
    if (result === 'already-owned') {
      Alert.alert(t('You already have this plan'), t('This purchase is on your store account already. Restoring it links it to this device.'),
        [
          { text: t('Not now'), style: 'cancel' },
          { text: t('Restore purchases'), onPress: () => void handleRestore() },
        ],
      );
      return;
    }
    if (result === 'not-allowed') {
      Alert.alert(t('Purchases are turned off on this device'), t('This device does not allow in-app purchases \u2014 usually a school profile or Screen Time restriction. Your account and card are fine.'),
      );
      return;
    }
    if (result === 'store-unavailable') {
      Alert.alert(t('The store is not responding'), t('The App Store or Google Play could not complete this right now. Nothing has been charged. Please try again shortly.'),
      );
      return;
    }
    if (result === 'network') {
      Alert.alert(t('No connection to the store'), t('Check your connection and try again. Nothing has been charged.'),
      );
      return;
    }
    if (result === 'configuration') {
      // The maker's problem, not theirs, and no amount of retrying fixes it.
      Alert.alert(t('Purchases are not set up yet'), t('This plan cannot be bought on this build. Please let us know at support@casparel.com.'),
      );
      return;
    }
    if (result === 'unsupported') {
      Alert.alert(t('Not available here'), t('In-app purchases are only available in the mobile app.'));
      return;
    }
    Alert.alert(t('Purchase failed'), t('Something went wrong and nothing has been charged. Please try again.'));
  }

  async function handleRestore() {
    setBusy(true);
    const ok = await restore();
    setBusy(false);
    Alert.alert(
      ok ? t('Purchases restored') : t('Nothing to restore'),
      ok ? t('Your paid plan is active again.') : t("We couldn't find a previous purchase for this account."),
      ok ? [{ text: t('Great'), onPress: close }] : undefined,
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      {/* Close */}
      <Pressable
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel={t('Close subscription plans')}
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
          paddingTop: Math.max(insets.top, 28) + 64,
          paddingBottom: insets.bottom + 28,
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <FadeInView duration={450}>
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
              maxFontSizeMultiplier={1.25}
              style={[
                styles.title,
                {
                  color: colors.primaryForeground,
                  fontFamily: colors.fontFamily.sansBold,
                },
              ]}
            >
              {t('Choose your Casparel plan')}
            </Text>
            <Text
              maxFontSizeMultiplier={1.25}
              style={[
                styles.subtitle,
                {
                  color: colors.primaryForeground + 'DD',
                  fontFamily: colors.fontFamily.sans,
                },
              ]}
            >
              {t('Keep the core free, then add only the AI access you need.')}
            </Text>
          </LinearGradient>
        </FadeInView>

        {/* Benefits */}
        <FadeInView
          delay={120}
          duration={450}
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.radius,
            },
          ]}
        >
          {BENEFITS.map((b) => (
            <BenefitRow key={b.title} {...b} />
          ))}
        </FadeInView>

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

        {!ready ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : !available || planPackages.length === 0 ? (
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
              {availabilityIssue === 'unsupported-platform'
                ? t('Open Casparel on your phone to choose Plus or Pro.')
                : availabilityIssue === 'missing-key'
                  ? t('Purchases were not configured in this build. This release must be replaced before plans can be sold.')
                  : availabilityIssue === 'missing-native-sdk'
                    ? t('This build is missing the native purchase service. Please install the corrected release.')
                    : availabilityIssue === 'no-offering'
                      ? t('Google Play returned no available plans. Nothing can be charged until the plan configuration is corrected.')
                      : t('The purchase service could not start. Nothing has been charged; please try again shortly.')}
            </Text>
          </View>
        ) : (
          <>
            {/* Package options */}
            <FadeInView delay={200} duration={450} style={{ gap: 10, marginTop: 18 }}>
              {planPackages.map((pkg) => (
                <PackageOption
                  key={pkg.identifier}
                  pkg={pkg}
                  badge={badgeFor(pkg)}
                  current={activeProductIds.has(pkg.product.identifier)}
                  selected={pkg.identifier === selected}
                  onSelect={() => setSelected(pkg.identifier)}
                />
              ))}
            </FadeInView>

            {/* CTA */}
            <FadeInView delay={280} duration={450}>
              <View style={{ marginTop: 18 }}>
                <Button size="lg" onPress={handlePurchase} loading={busy} disabled={!selected}>
                  {selected
                    ? `${t('Subscribe')} · ${planPackages.find((pkg) => pkg.identifier === selected)?.product.priceString ?? ''}`
                    : t('Choose a plan')}
                </Button>
              </View>
            </FadeInView>
          </>
        )}

        {customerInfo?.managementURL ? (
          <Pressable
            onPress={() => void Linking.openURL(customerInfo.managementURL!)}
            accessibilityRole="link"
            accessibilityLabel={t('Manage or cancel subscription')}
            style={styles.manage}
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
              {t('Manage or cancel subscription')}
            </Text>
          </Pressable>
        ) : null}

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
            accessibilityLabel={t('Restore previous purchases')}
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
              {t('Restore purchases')}
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
            {t('Terms')}
          </Text>{' '}
          &middot;{' '}
          <Text
            accessibilityRole="link"
            style={styles.link}
            onPress={() => Linking.openURL('https://casparel.com/privacy')}
          >
            {t('Privacy')}
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
  current,
}: {
  pkg: RCPackage;
  selected: boolean;
  onSelect: () => void;
  badge?: string | null;
  current: boolean;
}) {
  const { t } = useLanguage();
  const colors = useColors();
  const packageTier = tierForPackage(pkg);
  const definition = packageDefinition(pkg);
  if (!packageTier || !definition) return null;
  const period = definition.period === 'yearly' ? t('Billed yearly') : t('Billed monthly');
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
      {current || badge ? (
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
            {current ? t('Current plan') : badge}
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
  manage: { alignItems: 'center', paddingVertical: 14 },
  restoreText: { fontSize: 14 },
  legal: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 18 },
  link: { textDecorationLine: 'underline' },
});
