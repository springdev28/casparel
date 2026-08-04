import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Badge } from '@workspace/edu-ds/components/native/badge';
import type { PublicUser } from '@workspace/api-client-react';

interface UserProfileCardProps {
  user: PublicUser;
  onPress?: () => void;
}

/**
 * A read-only profile card for any signed-in user.
 * Shows avatar, display name, role badge, and subjects.
 * Used by study-session invitee lists and anywhere a compact profile summary is needed.
 */
export function UserProfileCard({ user, onPress }: UserProfileCardProps) {
  const colors = useColors();

  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.7 : 1}
      onPress={onPress}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      {/* Avatar */}
      <View style={styles.avatarWrap}>
        {user.avatarUrl ? (
          <Image
            source={{ uri: user.avatarUrl }}
            style={[styles.avatar, { borderRadius: 24, borderColor: colors.border }]}
            contentFit="cover"
          />
        ) : (
          <View
            style={[
              styles.avatarPlaceholder,
              { backgroundColor: colors.primary + '1A', borderRadius: 24, borderColor: colors.border },
            ]}
          >
            <Feather name="user" size={20} color={colors.primary} />
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text
          style={[styles.name, { color: colors.foreground, fontFamily: colors.fontFamily.sansBold }]}
          numberOfLines={1}
        >
          {user.name}
        </Text>

        {user.bio ? (
          <Text
            style={[styles.bio, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}
            numberOfLines={2}
          >
            {user.bio}
          </Text>
        ) : null}

        <View style={styles.meta}>
          <Badge variant="secondary">{user.role}</Badge>
          {user.subjects && user.subjects.length > 0 && (
            <Text
              style={[styles.subjects, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}
              numberOfLines={1}
            >
              {user.subjects.slice(0, 3).join(' · ')}
              {user.subjects.length > 3 ? ` +${user.subjects.length - 3}` : ''}
            </Text>
          )}
        </View>
      </View>

      {/* Chevron */}
      {onPress ? (
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={styles.chevron} />
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  avatarWrap: {
    width: 48,
    height: 48,
    flexShrink: 0,
  },
  avatar: {
    width: 48,
    height: 48,
    borderWidth: 1.5,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  info: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  name: {
    fontSize: 15,
    letterSpacing: -0.2,
  },
  bio: {
    fontSize: 12,
    lineHeight: 16,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  subjects: {
    fontSize: 11,
    flex: 1,
  },
  chevron: {
    flexShrink: 0,
  },
});
