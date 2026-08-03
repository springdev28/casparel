import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Button } from '@workspace/edu-ds/components/native/button';
import { Input } from '@workspace/edu-ds/components/native/input';
import { Feather } from '@expo/vector-icons';
import { useLogin } from '@workspace/api-client-react';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const loginMutation = useLogin();

  const handleLogin = () => {
    setErrorMsg('');
    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please enter your email and password.');
      return;
    }
    loginMutation.mutate(
      { data: { email: email.trim(), password } },
      {
        onSuccess: (data) => {
          login(data.token, data.user);
        },
        onError: () => {
          setErrorMsg('Invalid email or password. Please try again.');
        },
      }
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
        {/* Logo / Brand */}
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
              {
                color: colors.foreground,
                fontFamily: colors.fontFamily.sansBold,
              },
            ]}
          >
            EduHub
          </Text>
        </View>

        <View style={styles.headingBlock}>
          <Text
            style={[
              styles.heading,
              { color: colors.foreground, fontFamily: colors.fontFamily.sansBold },
            ]}
          >
            Welcome back
          </Text>
          <Text
            style={[
              styles.subheading,
              {
                color: colors.mutedForeground,
                fontFamily: colors.fontFamily.sans,
              },
            ]}
          >
            Sign in to your account
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
            label="Email"
            placeholder="you@school.edu"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <Input
            label="Password"
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
            style={{ marginTop: 16 }}
          />

          {errorMsg ? (
            <Text
              style={[
                styles.error,
                {
                  color: colors.destructive,
                  fontFamily: colors.fontFamily.sans,
                },
              ]}
            >
              {errorMsg}
            </Text>
          ) : null}

          <Button
            onPress={handleLogin}
            loading={loginMutation.isPending}
            size="lg"
            style={{ marginTop: 24 }}
          >
            Sign in
          </Button>
        </View>

        <Text
          style={[
            styles.footer,
            {
              color: colors.mutedForeground,
              fontFamily: colors.fontFamily.sans,
            },
          ]}
        >
          Contact your administrator to create an account.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    paddingHorizontal: 24,
    gap: 28,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoBox: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    fontSize: 26,
    letterSpacing: -0.5,
  },
  headingBlock: {
    gap: 4,
  },
  heading: {
    fontSize: 28,
    letterSpacing: -0.5,
  },
  subheading: {
    fontSize: 15,
  },
  card: {
    borderWidth: 1,
    padding: 20,
  },
  error: {
    fontSize: 13,
    marginTop: 12,
  },
  footer: {
    fontSize: 13,
    textAlign: 'center',
  },
});
