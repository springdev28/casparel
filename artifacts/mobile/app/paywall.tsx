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
import type { RCPackage } from '@/utils/revenuecat';

const BENEFITS: { icon: string; title: string; body: string }[] = [
  {
    icon: 'search',
    title: 'Unlimited AI source research',
    body: 'Run deep, live-web research on any resource — no daily cap.',
  },
  {
    icon: 'compass',
    title: 'Unlimited AI discovery',
    body: 'Find vetted learning materials with unlimited AI-powered search.',
  },
  {
    icon: 'zap',
    title: 'Priority everything',
    body: 'Faster research, cached reports, and early access to new tools.',
  },
  {
    icon: 'heart',
    title: 'Keep learning open',
    body: 'The core library stays free for everyone. Premium funds it.',
  },
];

function BenefitRow({ icon, title, body }: { icon: string; title: string; body: string }) {
  const colors = useColors();
  return (
    <View style={styles.benefitRow}>
      <View style={[styles.benefitIcon, { backgroundColor: colors.primary + '1A', borderRadius: colors.radius }]}>
        <Feather name={icon as never} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.benefitTitle, { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }]}>
          {title}
        </Text>
        <Text style={[styles.benefitBody, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
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
  const { ready, available, isPremium, packages, purchase, restore } = usePurchases();

  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Default the selection to the annual package when offerings arrive, else the first.
  useEffect(() => {
    if (selected || packages.length === 0) return;
    const annual = packages.find((p) => p.packageType?.toUpperCase() === 'ANNUAL');
    setSelected((annual ?? packages[0]).identifier);
  }, [packages, selected]);

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  }

  // "Best value" + computed savings on the annual package vs. 12× monthly.
  const monthlyPkg = packages.find((p) => p.packageType?.toUpperCase() === 'MONTHLY');
  function badgeFor(pkg: RCPackage): string | null {
    if (pkg.packageType?.toUpperCase() !== 'ANNUAL') return null;
    const monthlyPrice = monthlyPkg?.product.price ?? 0;
    if (monthlyPrice > 0 && pkg.product.price > 0) {
      const pct = Math.round((1 - pkg.product.price / (monthlyPrice * 12)) * 100);
      if (pct > 0) return `Best value · Save ${pct}%`;
    }
    return 'Best value';
  }

  async function handlePurchase() {
    const pkg = packages.find((p) => p.identifier === selected);
    if (!pkg) return;
    setBusy(true);
    const result = await purchase(pkg);
    setBusy(false);
    if (result === 'success') {
      Alert.alert('Welcome to Premium', 'Your premium features are now unlocked. Thank you!', [
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
      ok ? 'Your premium access is active again.' : "We couldn't find a previous purchase for this account.",
      ok ? [{ text: 'Great', onPress: close }] : undefined,
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      {/* Close */}
      <Pressable
        onPress={close}
        style={[styles.closeBtn, { top: insets.top + 8, backgroundColor: colors.card, borderColor: colors.border }]}
        hitSlop={10}
      >
        <Feather name="x" size={20} color={colors.mutedForeground} />
      </Pressable>

      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 56, paddingBottom: insets.bottom + 28, paddingHorizontal: 20 }}
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
            <View style={[styles.crown, { backgroundColor: colors.primaryForeground + '26', borderRadius: 24 }]}>
              <Feather name="award" size={30} color={colors.primaryForeground} />
            </View>
            <Text style={[styles.title, { color: colors.primaryForeground, fontFamily: colors.fontFamily.sansBold }]}>
              Casparel Premium
            </Text>
            <Text style={[styles.subtitle, { color: colors.primaryForeground + 'DD', fontFamily: colors.fontFamily.sans }]}>
              Unlimited AI research and discovery for serious learners.
            </Text>
          </LinearGradient>
        </Animated.View>

        {/* Benefits */}
        <Animated.View
          entering={FadeInDown.delay(120).duration(450)}
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
        >
          {BENEFITS.map((b) => (
            <BenefitRow key={b.title} {...b} />
          ))}
        </Animated.View>

        {isPremium ? (
          <View style={[styles.premiumBanner, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '40', borderRadius: colors.radius }]}>
            <Feather name="check-circle" size={18} color={colors.primary} />
            <Text style={[styles.premiumText, { color: colors.primary, fontFamily: colors.fontFamily.sansSemiBold }]}>
              You're on Premium — thank you!
            </Text>
          </View>
        ) : !ready ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : !available || packages.length === 0 ? (
          <View style={[styles.notice, { borderColor: colors.border, borderRadius: colors.radius }]}>
            <Text style={[styles.noticeText, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
              {Platform.OS === 'web'
                ? 'Open Casparel on your phone to upgrade to Premium.'
                : 'Plans are loading or unavailable right now. Please try again shortly.'}
            </Text>
          </View>
        ) : (
          <>
            {/* Package options */}
            <Animated.View entering={FadeInDown.delay(200).duration(450)} style={{ gap: 10, marginTop: 18 }}>
              {packages.map((pkg) => (
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

              <Pressable onPress={handleRestore} disabled={busy} style={styles.restore}>
                <Text style={[styles.restoreText, { color: colors.primary, fontFamily: colors.fontFamily.sansMedium }]}>
                  Restore purchases
                </Text>
              </Pressable>
            </Animated.View>
          </>
        )}

        {/* Legal */}
        <Text style={[styles.legal, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
          Subscriptions renew automatically until cancelled. Manage or cancel anytime in your{' '}
          {Platform.OS === 'ios' ? 'App Store' : 'Google Play'} account settings.{' '}
          <Text style={styles.link} onPress={() => Linking.openURL('https://casparel.app/terms')}>
            Terms
          </Text>{' '}
          &middot;{' '}
          <Text style={styles.link} onPress={() => Linking.openURL('https://casparel.app/privacy')}>
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
  const period =
    pkg.packageType?.toUpperCase() === 'ANNUAL'
      ? 'Billed yearly'
      : pkg.packageType?.toUpperCase() === 'MONTHLY'
        ? 'Billed monthly'
        : pkg.product.description || '';
  return (
    <Pressable
      onPress={onSelect}
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
          <Text style={[styles.pkgBadgeText, { color: colors.primaryForeground, fontFamily: colors.fontFamily.sansSemiBold }]}>
            {badge}
          </Text>
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.pkgTitle, { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }]}>
          {pkg.product.title || pkg.identifier}
        </Text>
        {period ? (
          <Text style={[styles.pkgPeriod, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
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
          { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : 'transparent' },
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
  hero: { alignItems: 'center', gap: 10, marginBottom: 20, paddingVertical: 26, paddingHorizontal: 20 },
  crown: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, letterSpacing: -0.5, textAlign: 'center' },
  subtitle: { fontSize: 15, lineHeight: 21, textAlign: 'center', maxWidth: 300 },
  card: { borderWidth: 1, padding: 16, gap: 16 },
  benefitRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  benefitIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  benefitTitle: { fontSize: 15 },
  benefitBody: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  premiumBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, padding: 14, marginTop: 18 },
  premiumText: { fontSize: 14 },
  loading: { paddingVertical: 32, alignItems: 'center' },
  notice: { borderWidth: 1, borderStyle: 'dashed', padding: 16, marginTop: 18 },
  noticeText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  pkg: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, position: 'relative' },
  pkgBadge: { position: 'absolute', top: -9, right: 12, paddingHorizontal: 8, paddingVertical: 2, zIndex: 1 },
  pkgBadgeText: { fontSize: 10, letterSpacing: 0.2 },
  pkgTitle: { fontSize: 15 },
  pkgPeriod: { fontSize: 12, marginTop: 2 },
  pkgPrice: { fontSize: 16 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  restore: { alignItems: 'center', paddingVertical: 14 },
  restoreText: { fontSize: 14 },
  legal: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 18 },
  link: { textDecorationLine: 'underline' },
});
