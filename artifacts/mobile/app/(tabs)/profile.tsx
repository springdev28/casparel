import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import {
  getGetMeQueryKey,
  useGetMe,
  useSwitchRole,
  RoleSwitchInputRole,
} from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { logout, user: authUser, updateToken } = useAuth();
  const queryClient = useQueryClient();

  const { data: me } = useGetMe();
  const displayUser = me ?? authUser;
  const isTeacher = displayUser?.role === 'teacher';

  const [switching, setSwitching] = useState(false);

  const switchRoleMutation = useSwitchRole();

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  async function handleRoleToggle() {
    if (switching) return;
    const newRole = isTeacher ? RoleSwitchInputRole.student : RoleSwitchInputRole.teacher;
    setSwitching(true);
    try {
      const result = await switchRoleMutation.mutateAsync({ data: { role: newRole } });
      await updateToken(result.token);
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch {
      Alert.alert('Error', 'Could not switch role. Please try again.');
    } finally {
      setSwitching(false);
    }
  }

  const roleLabel = isTeacher ? 'Teacher' : 'Student';
  const roleDescription = isTeacher
    ? 'You can create classes and manage resources'
    : 'You can browse resources and join classes';

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + webTopPad + 16, paddingBottom: insets.bottom + 32 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Text
        style={[
          styles.pageTitle,
          { color: colors.foreground, fontFamily: colors.fontFamily.sansBold },
        ]}
      >
        Profile
      </Text>

      {/* User card */}
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
        ]}
      >
        <View
          style={[
            styles.avatar,
            { backgroundColor: colors.primary + '20', borderRadius: colors.radius },
          ]}
        >
          <Feather name="user" size={28} color={colors.primary} />
        </View>
        <View style={styles.userInfo}>
          {displayUser ? (
            <>
              <Text
                style={[
                  styles.userName,
                  { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold },
                ]}
                numberOfLines={1}
              >
                {displayUser.name}
              </Text>
              <Text
                style={[
                  styles.userEmail,
                  { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
                ]}
                numberOfLines={1}
              >
                {displayUser.email}
              </Text>
            </>
          ) : (
            <>
              <View style={[styles.skelLine, { backgroundColor: colors.muted, borderRadius: 4 }]} />
              <View
                style={[
                  styles.skelLineShort,
                  { backgroundColor: colors.muted, borderRadius: 4, marginTop: 4 },
                ]}
              />
            </>
          )}
        </View>
      </View>

      {/* Role switcher */}
      <Text
        style={[
          styles.sectionTitle,
          { color: colors.mutedForeground, fontFamily: colors.fontFamily.sansSemiBold },
        ]}
      >
        ACCOUNT
      </Text>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
        ]}
      >
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <View
              style={[
                styles.rowIcon,
                {
                  backgroundColor: colors.primary + '15',
                  borderRadius: colors.radius - 2,
                },
              ]}
            >
              <Feather
                name={isTeacher ? 'briefcase' : 'book-open'}
                size={18}
                color={colors.primary}
              />
            </View>
            <View style={styles.rowText}>
              <Text
                style={[
                  styles.rowLabel,
                  { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold },
                ]}
              >
                Mode: {roleLabel}
              </Text>
              <Text
                style={[
                  styles.rowDescription,
                  { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
                ]}
                numberOfLines={2}
              >
                {roleDescription}
              </Text>
            </View>
          </View>

          {switching ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Switch
              value={isTeacher}
              onValueChange={handleRoleToggle}
              trackColor={{ false: colors.muted, true: colors.primary + 'AA' }}
              thumbColor={isTeacher ? colors.primary : colors.mutedForeground}
            />
          )}
        </View>

        {isTeacher && (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.teacherBadgeRow}>
              <Feather name="check-circle" size={14} color={colors.accent} />
              <Text
                style={[
                  styles.teacherBadge,
                  { color: colors.accent, fontFamily: colors.fontFamily.sans },
                ]}
              >
                Google Classroom integration available
              </Text>
            </View>
            <View style={styles.teacherBadgeRow}>
              <Feather name="check-circle" size={14} color={colors.accent} />
              <Text
                style={[
                  styles.teacherBadge,
                  { color: colors.accent, fontFamily: colors.fontFamily.sans },
                ]}
              >
                Class creation and roster management enabled
              </Text>
            </View>
          </>
        )}
      </View>

      {/* Sign out */}
      <Text
        style={[
          styles.sectionTitle,
          { color: colors.mutedForeground, fontFamily: colors.fontFamily.sansSemiBold },
        ]}
      >
        SESSION
      </Text>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
        ]}
      >
        <TouchableOpacity
          style={styles.row}
          onPress={() =>
            Alert.alert('Sign out', 'Are you sure you want to sign out?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign out', style: 'destructive', onPress: logout },
            ])
          }
          activeOpacity={0.7}
        >
          <View style={styles.rowLeft}>
            <View
              style={[
                styles.rowIcon,
                {
                  backgroundColor: colors.destructive + '15',
                  borderRadius: colors.radius - 2,
                },
              ]}
            >
              <Feather name="log-out" size={18} color={colors.destructive} />
            </View>
            <Text
              style={[
                styles.rowLabel,
                { color: colors.destructive, fontFamily: colors.fontFamily.sansSemiBold },
              ]}
            >
              Sign out
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 8 },
  pageTitle: { fontSize: 26, letterSpacing: -0.5, marginBottom: 8 },
  sectionTitle: { fontSize: 11, letterSpacing: 0.8, marginTop: 8, marginBottom: 2 },
  card: {
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  avatar: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 16,
    marginBottom: 0,
    alignSelf: 'flex-start',
  },
  userInfo: { padding: 16, paddingTop: 12, gap: 2 },
  userName: { fontSize: 18 },
  userEmail: { fontSize: 13 },
  skelLine: { width: 140, height: 18 },
  skelLineShort: { width: 100, height: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 15 },
  rowDescription: { fontSize: 12, lineHeight: 16 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  teacherBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  teacherBadge: { fontSize: 12 },
});
