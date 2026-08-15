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
      setErrorMsg('Please fill in your name, email and password.');
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
          // Say what actually went wrong. The generated client builds a
          // message for logs that starts "HTTP 400 Bad Request: ...", so read
          // the status rather than showing that string to a person.
          const status = (error as { status?: number } | null)?.status;
          if (status === 400 || status === 409) {
            setErrorMsg(
              'That email already has a Casparel account. Try signing in instead.',
            );
          } else if (status === 429) {
            setErrorMsg('Too many attempts. Please wait a few minutes and try again.');
          } else if (status === undefined) {
            setErrorMsg('Could not reach Casparel. Check your connection and try again.');
          } else {
            setErrorMsg('Could not create your account. Please try again.');
          }
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
            Create your account
          </Text>
          <Text
            style={[
              styles.subheading,
              { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
            ]}
          >
            Free to join. The library stays free.
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
            label="Name"
            placeholder="Your name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoComplete="name"
          />
          <Input
            label="Email"
            placeholder="you@school.edu"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            style={{ marginTop: 16 }}
          />
          <Input
            label="Password"
            placeholder="At least 8 characters"
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
            Create account
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
              Sign in
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
