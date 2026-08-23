/**
 * @fileOverview Mobile screen role: defines the Expo Router Not Found screen or route layout.
 * System connection: composed by Expo Router and backed by auth, onboarding, purchases, secure storage, and the shared API.
 */
import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { useLanguage } from '@/contexts/LanguageContext';

export default function NotFoundScreen() {
  const { t } = useLanguage();
  const colors = useColors();

  return (
    <>
      <Stack.Screen options={{ title: t('Oops!') }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: colors.fontFamily.sansBold }]}>
          {t("This screen doesn't exist.")}
        </Text>
        <Link href="/" style={styles.link}>
          <Text style={[styles.linkText, { color: colors.primary }]}>
            {t('Go to home screen')}
          </Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: { fontSize: 20 },
  link: { marginTop: 15, paddingVertical: 15 },
  linkText: { fontSize: 14 },
});
