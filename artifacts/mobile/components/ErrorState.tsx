import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Button } from '@workspace/edu-ds/components/native/button';

// NOTE: `ApiError` lives in lib/api-client-react/src/custom-fetch.ts but is NOT
// re-exported from '@workspace/api-client-react', and that package is generated
// so it must not be edited to export it. Query errors are therefore narrowed
// structurally on the `status` field that ApiError carries.
function errorStatus(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return undefined;
}

export function describeQueryError(error: unknown): {
  title: string;
  description: string;
  icon: 'wifi-off' | 'alert-circle';
} {
  const status = errorStatus(error);

  // No HTTP status means the request never reached the server at all:
  // airplane mode, no signal, DNS/TLS failure or a timeout.
  if (status === undefined) {
    return {
      title: "You're offline",
      description:
        "We couldn't reach the server. Check your connection and try again.",
      icon: 'wifi-off',
    };
  }

  if (status === 401 || status === 403) {
    return {
      title: "You don't have access to this",
      description: 'Your session may have expired. Sign in again, then retry.',
      icon: 'alert-circle',
    };
  }

  return {
    title: "Couldn't load this",
    description: `The server returned an error (HTTP ${status}). Try again in a moment.`,
    icon: 'alert-circle',
  };
}

export function ErrorState({
  error,
  onRetry,
  retrying = false,
  variant = 'block',
  style,
}: {
  error: unknown;
  onRetry: () => void;
  retrying?: boolean;
  variant?: 'block' | 'banner';
  style?: object;
}) {
  const colors = useColors();
  const { title, description, icon } = describeQueryError(error);

  if (variant === 'banner') {
    return (
      <View
        accessibilityRole="alert"
        style={[
          styles.banner,
          {
            backgroundColor: colors.card,
            borderColor: colors.destructive,
            borderRadius: colors.radius,
          },
          style,
        ]}
      >
        <Feather name={icon} size={18} color={colors.destructiveText} />
        <View style={styles.bannerText}>
          <Text
            style={[
              styles.bannerTitle,
              { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold },
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text
            style={[
              styles.bannerDescription,
              { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
            ]}
            numberOfLines={2}
          >
            {description}
          </Text>
        </View>
        <Button size="sm" variant="outline" onPress={onRetry} loading={retrying}>
          Retry
        </Button>
      </View>
    );
  }

  return (
    <View accessibilityRole="alert" style={[styles.block, style]}>
      <View
        style={[
          styles.blockIcon,
          { backgroundColor: colors.muted, borderRadius: colors.radius * 2 },
        ]}
      >
        <Feather name={icon} size={28} color={colors.destructiveText} />
      </View>
      <Text
        style={[
          styles.blockTitle,
          { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold },
        ]}
      >
        {title}
      </Text>
      <Text
        style={[
          styles.blockDescription,
          { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
        ]}
      >
        {description}
      </Text>
      <Button variant="outline" onPress={onRetry} loading={retrying}>
        Try again
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bannerText: { flex: 1, gap: 2 },
  bannerTitle: { fontSize: 14 },
  bannerDescription: { fontSize: 12, lineHeight: 16 },
  block: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
    gap: 12,
  },
  blockIcon: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  blockTitle: { fontSize: 16, textAlign: 'center' },
  blockDescription: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
