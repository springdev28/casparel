import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Button } from '@workspace/edu-ds/components/native/button';
import { BrandMark } from '@/components/BrandMark';
import { SponsoredLearningResourceCard } from '@/components/SponsoredLearningResourceCard';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAds } from '@/contexts/AdsContext';

/** The app's own public home. No browser or hosted page is involved. */
export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated, user } = useAuth();
  const { t } = useLanguage();
  const { privacyOptionsRequired, showPrivacyOptions } = useAds();
  const heading = { color: colors.foreground, fontFamily: colors.fontFamily.sansBold };
  const copy = { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.page, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
      testID="native-home"
    >
      <View style={styles.header}>
        <View style={styles.brand}>
          <BrandMark size={34} />
          <Text style={[styles.brandName, heading]}>Casparel</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(isAuthenticated ? '/mobile' : '/login')}
          style={styles.headerAction}
        >
          <Text style={{ color: colors.primary, fontFamily: colors.fontFamily.sansSemiBold }}>
            {isAuthenticated ? t('My workspace') : t('Sign in')}
          </Text>
        </Pressable>
      </View>

      <View style={styles.hero}>
        <Text style={[styles.eyebrow, { color: colors.primary, fontFamily: colors.fontFamily.sansSemiBold }]}>
          {t('LEARN WITH CONFIDENCE')}
        </Text>
        <Text style={[styles.title, heading]}>{t('A clearer path to learning.')}</Text>
        <Text style={[styles.intro, copy]}>
          {t('Find trustworthy resources, plan your studies, and learn together. Your learning space, wherever you are.')}
        </Text>
        {isAuthenticated && user ? (
          <Text style={copy}>{t('Welcome back')}, {user.name}</Text>
        ) : null}
        <Button size="lg" onPress={() => router.push(isAuthenticated ? '/mobile' : '/register')}>
          {isAuthenticated ? t('Open my workspace') : t('Create account')}
        </Button>
        <Button variant="outline" onPress={() => router.push(isAuthenticated ? '/paywall' : '/login')}>
          {isAuthenticated ? t('View plans') : t('Sign in to view plans')}
        </Button>
      </View>

      <SponsoredLearningResourceCard />

      <View style={styles.features}>
        {([
          ['book-open', t('Resources you can trust'), t('Discover learning materials and understand what makes a source reliable.')],
          ['calendar', t('Make room for progress'), t('Keep your goals, study sessions, and learning activities together.')],
          ['users', t('Learn together'), t('Move between student and teacher workspaces without leaving the app.')],
        ] as const).map(([icon, title, body]) => (
          <View key={icon} style={[styles.feature, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Feather name={icon} size={24} color={colors.primary} />
            <Text style={[styles.featureTitle, heading]}>{title}</Text>
            <Text style={[styles.featureBody, copy]}>{body}</Text>
          </View>
        ))}
      </View>
      {privacyOptionsRequired ? (
        <Pressable accessibilityRole="button" onPress={() => void showPrivacyOptions()} style={styles.headerAction}>
          <Text style={{ color: colors.primary }}>{t('Ad privacy choices')}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 22, gap: 24, width: '100%', maxWidth: 680, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandName: { fontSize: 23 },
  headerAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  hero: { paddingVertical: 24, gap: 18 },
  eyebrow: { fontSize: 11, letterSpacing: 1.8 },
  title: { fontSize: 40, lineHeight: 46, letterSpacing: -1.4 },
  intro: { fontSize: 17, lineHeight: 26, marginBottom: 6 },
  features: { gap: 14 },
  feature: { borderWidth: 1, padding: 22, gap: 12 },
  featureTitle: { fontSize: 19 },
  featureBody: { fontSize: 15, lineHeight: 23 },
});
