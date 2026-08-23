/**
 * @fileOverview Mobile screen role: defines the Expo Router Register screen or route layout.
 * System connection: composed by Expo Router and backed by auth, onboarding, purchases, secure storage, and the shared API.
 */
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Button } from '@workspace/edu-ds/components/native/button';
import { Input } from '@workspace/edu-ds/components/native/input';
import { Feather } from '@expo/vector-icons';
import { useRegister } from '@workspace/api-client-react';
import { useAuth } from '@/contexts/AuthContext';
import { describeAuthFailure } from '@/utils/auth-errors';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Creating an account, on the phone.
 *
 * The login screen used to end with "Contact your administrator to create an
 * account." That was never true - registration is open self-serve on the web -
 * and it made the app impossible to enter for anyone who did not already have
 * credentials, including an App Store reviewer opening it for the first time.
 * There is no way to pass review from a screen you cannot get past.
 */
const MIN_PASSWORD = 8;

export default function RegisterScreen() {
  const { t } = useLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const registerMutation = useRegister();

  const handleRegister = () => {
    setErrorMsg('');
    if (!name.trim() || !email.trim() || !password) {
      setErrorMsg(t('Please fill in your name, email and password.'));
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setErrorMsg(`Choose a password of at least ${MIN_PASSWORD} characters.`);
      return;
    }
    registerMutation.mutate(
      { data: { name: name.trim(), email: email.trim(), password } },
      {
        onSuccess: (data) => {
          login(data.token, data.user);
        },
        onError: (error) => {
          setErrorMsg(describeAuthFailure(error, 'register', t));
        },
      },
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 0) + 40,
            paddingBottom: insets.bottom + 40,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <View
            style={[
              styles.logoBox,
              { backgroundColor: colors.primary, borderRadius: colors.radius },
            ]}
          >
            <Feather name="book-open" size={28} color={colors.primaryForeground} />
          </View>
          <Text
            style={[
              styles.brandName,
              { color: colors.foreground, fontFamily: colors.fontFamily.sansBold },
            ]}
          >
            Casparel
          </Text>
        </View>

        <View style={styles.headingBlock}>
          <Text
            style={[
              styles.heading,
              { color: colors.foreground, fontFamily: colors.fontFamily.sansBold },
            ]}
          >
            {t('Create your account')}
          </Text>
          <Text
            style={[
              styles.subheading,
              { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
            ]}
          >
            {t('Free to join. The library stays free.')}
          </Text>
        </View>

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
          <Input
            label={t('Name')}
            placeholder={t('Your name')}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoComplete="name"
          />
          <Input
            label={t('Email')}
            placeholder="you@school.edu"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            style={{ marginTop: 16 }}
          />
          <Input
            label={t('Password')}
            placeholder={t('At least 8 characters')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            style={{ marginTop: 16 }}
          />

          {errorMsg ? (
            <Text
              style={[
                styles.error,
                { color: colors.destructiveText, fontFamily: colors.fontFamily.sans },
              ]}
            >
              {errorMsg}
            </Text>
          ) : null}

          <Button
            onPress={handleRegister}
            loading={registerMutation.isPending}
            size="lg"
            style={{ marginTop: 24 }}
          >
            {t('Create account')}
          </Button>
        </View>

        <Pressable onPress={() => router.replace('/login')} style={styles.footerLink}>
          <Text
            style={[
              styles.footer,
              { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
            ]}
          >
            Already have an account?{' '}
            <Text style={{ color: colors.primary, fontFamily: colors.fontFamily.sansMedium }}>
              {t('Sign in')}
            </Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { paddingHorizontal: 24, gap: 28 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoBox: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  brandName: { fontSize: 26, letterSpacing: -0.5 },
  headingBlock: { gap: 4 },
  heading: { fontSize: 28, letterSpacing: -0.5 },
  subheading: { fontSize: 15 },
  card: { borderWidth: 1, padding: 20 },
  error: { fontSize: 13, marginTop: 12 },
  footerLink: { alignSelf: 'center' },
  footer: { fontSize: 13, textAlign: 'center' },
});
