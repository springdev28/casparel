import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Button } from '@workspace/edu-ds/components/native/button';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useLanguage } from '@/contexts/LanguageContext';

const VALUE_PROPS: { icon: string; title: string; body: string }[] = [
  {
    icon: 'book-open',
    title: 'Vetted open learning',
    body: 'Discover trusted, free resources from Open Library, Wikibooks, and more.',
  },
  {
    icon: 'calendar',
    title: 'Organize your studies',
    body: 'Classes, schedules, reading lists, and study sessions in one place.',
  },
  {
    icon: 'search',
    title: 'AI source research',
    body: 'Check source provenance without AI, or add live AI research with Plus and Pro.',
  },
];

function ValueRow({ icon, title, body, delay }: { icon: string; title: string; body: string; delay: number }) {
  // VALUE_PROPS is a module constant, so it holds the English and this
  // translates it -- a hook cannot be called where the constant is written.
  const { t } = useLanguage();
  const colors = useColors();
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(450)} style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: colors.primary + '18', borderRadius: colors.radius }]}>
        <Feather name={icon as never} size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }]}>
          {t(title)}
        </Text>
        <Text style={[styles.rowBody, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
          {t(body)}
        </Text>
      </View>
    </Animated.View>
  );
}

export default function OnboardingScreen() {
  const { t } = useLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { complete } = useOnboarding();

  async function getStarted() {
    await complete();
    router.replace('/(tabs)');
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom + 20 }]}>
      <View style={styles.content}>
        {/* Hero */}
        <Animated.View entering={FadeInDown.duration(500)}>
          <LinearGradient
            colors={[colors.primary, colors.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.hero, { borderRadius: colors.radius + 8 }]}
          >
            <View style={[styles.logo, { backgroundColor: colors.primaryForeground + '26', borderRadius: 22 }]}>
              <Feather name="feather" size={28} color={colors.primaryForeground} />
            </View>
            <Text style={[styles.heroTitle, { color: colors.primaryForeground, fontFamily: colors.fontFamily.sansBold }]}>
              {t('Welcome to Casparel')}
            </Text>
            <Text style={[styles.heroSubtitle, { color: colors.primaryForeground + 'DD', fontFamily: colors.fontFamily.sans }]}>
              {t('Learn, organize, and study, all in one place.')}
            </Text>
          </LinearGradient>
        </Animated.View>

        {/* Value props */}
        <View style={styles.rows}>
          {VALUE_PROPS.map((p, i) => (
            <ValueRow key={p.title} {...p} delay={140 + i * 90} />
          ))}
        </View>
      </View>

      {/* CTA */}
      <Animated.View entering={FadeInDown.delay(420).duration(450)} style={styles.cta}>
        <Button size="lg" onPress={getStarted}>
          {t('Get started')}
        </Button>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 28 },
  hero: { alignItems: 'center', gap: 10, paddingVertical: 30, paddingHorizontal: 22 },
  logo: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 26, letterSpacing: -0.5, textAlign: 'center' },
  heroSubtitle: { fontSize: 15, lineHeight: 21, textAlign: 'center', maxWidth: 280 },
  rows: { gap: 18 },
  row: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  rowIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 16 },
  rowBody: { fontSize: 13, lineHeight: 19, marginTop: 2 },
  cta: { paddingHorizontal: 24 },
});
