/**
 * @fileOverview Mobile screen role: makes every Casparel workspace, role mode, plan, and account control discoverable.
 * System connection: links native routes directly and opens the remaining authenticated web workspaces in-app.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { useQueryClient } from '@tanstack/react-query';
import {
  RoleSwitchInputRole,
  useGetMe,
  useSwitchRole,
} from '@workspace/api-client-react';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { PremiumCard } from '@/components/PremiumCard';
import { describeApiFailure } from '@/utils/api-failure';
import { TAB_BAR_CLEARANCE } from '@/utils/tab-bar';
import type { WebWorkspaceKey } from '@/utils/web-workspaces';
import { workspaceRoleFor } from '@/utils/account-identity';

type FeatherName = keyof typeof Feather.glyphMap;

type WorkspaceItem = {
  title: string;
  description: string;
  icon: FeatherName;
  route?: string;
  web?: WebWorkspaceKey;
};

function WorkspaceCard({ item, onPress }: { item: WorkspaceItem; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.workspaceCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <View style={[styles.workspaceIcon, { backgroundColor: `${colors.primary}15`, borderRadius: colors.radius - 2 }]}>
        <Feather name={item.icon} size={19} color={colors.primary} />
      </View>
      <Text style={[styles.workspaceTitle, { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }]}>
        {item.title}
      </Text>
      <Text style={[styles.workspaceDescription, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
        {item.description}
      </Text>
      <Feather name="chevron-right" size={17} color={colors.mutedForeground} style={styles.chevron} />
    </Pressable>
  );
}

export default function MoreScreen() {
  const { t } = useLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user: storedUser, updateToken } = useAuth();
  const { data: me } = useGetMe();
  const switchRole = useSwitchRole();
  const [switchingTo, setSwitchingTo] = useState<RoleSwitchInputRole | null>(null);
  const user = me ?? storedUser;
  const workspaceRole = workspaceRoleFor(user);
  const nativeWorkspaces: WorkspaceItem[] = [
    { title: t('Goals'), description: t('Track progress and next steps'), icon: 'target', route: '/goals' },
    { title: t('Reading lists'), description: t('Organise saved resources'), icon: 'list', route: '/lists' },
    { title: t('Messages'), description: t('Talk with your people'), icon: 'message-circle', route: '/messages' },
    { title: t('Study'), description: t('Focus sessions and study tools'), icon: 'clock', route: '/study' },
    { title: t('Profile'), description: t('Account, language and privacy'), icon: 'user', route: '/(tabs)/profile' },
    { title: t('Plans'), description: t('View Plus and Pro options'), icon: 'award', route: '/paywall' },
  ];
  const fullWorkspaces: WorkspaceItem[] = [
    { title: t('Resource studio'), description: t('Submit, review and manage learning resources'), icon: 'book-open', web: 'resources' },
    { title: t('Classroom management'), description: t('Manage rosters, invitations, resources and seating'), icon: 'briefcase', web: 'classes' },
    { title: t('Activities'), description: t('Build and assign learning activities'), icon: 'check-square', web: 'activities' },
    { title: t('Canvases'), description: t('Create visual learning boards'), icon: 'layout', web: 'canvases' },
    { title: t('Community'), description: t('Join discussions and share ideas'), icon: 'users', web: 'community' },
    { title: t('Catalog'), description: t('Browse community materials'), icon: 'compass', web: 'catalog' },
    { title: t('People'), description: t('Find classmates and educators'), icon: 'user-plus', web: 'people' },
    { title: t('Settings'), description: t('Appearance and workspace settings'), icon: 'settings', web: 'settings' },
    { title: t('Getting started'), description: t('Complete the guided first task'), icon: 'play-circle', web: 'tutorial' },
    { title: t('Guide'), description: t('Learn every part of Casparel'), icon: 'help-circle', web: 'guide' },
    { title: t('Support'), description: t('Get help with access, billing or safety'), icon: 'life-buoy', web: 'support' },
    { title: t('Notifications'), description: t('Review invitations and account updates'), icon: 'bell', web: 'notifications' },
  ];

  async function changeMode(nextRole: RoleSwitchInputRole) {
    if (nextRole === workspaceRole || switchingTo) return;
    setSwitchingTo(nextRole);
    try {
      const result = await switchRole.mutateAsync({ data: { role: nextRole } });
      await updateToken(result.token, result.user);
      queryClient.clear();
    } catch (cause) {
      Alert.alert(
        t('Could not switch role'),
        describeApiFailure(cause, t('Please try again.'), t),
      );
    } finally {
      setSwitchingTo(null);
    }
  }

  function open(item: WorkspaceItem) {
    if (item.route) {
      router.push(item.route as never);
      return;
    }
    if (item.web) router.push(`/workspace/${item.web}` as never);
  }

  const allFullWorkspaces = user?.role === 'admin'
    ? [...fullWorkspaces, { title: t('Administration'), description: t('Manage users and platform operations'), icon: 'shield' as FeatherName, web: 'admin' as WebWorkspaceKey }]
    : fullWorkspaces;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 0) + 18,
          paddingBottom: insets.bottom + TAB_BAR_CLEARANCE,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.brandRow}>
        <Image source={require('@/assets/images/icon.png')} style={styles.logo} accessibilityLabel={t('Casparel logo')} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.heading, { color: colors.foreground, fontFamily: colors.fontFamily.sansBold }]}>
            {t('Your Casparel')}
          </Text>
          <Text style={[styles.intro, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
            {t('Every workspace and account control, in one place.')}
          </Text>
        </View>
      </View>

      <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sansSemiBold }]}>
        {t('WORKSPACE MODE')}
      </Text>
      <View style={[styles.modeCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <View>
          <Text style={[styles.modeTitle, { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }]}>
            {t('Switch role')}
          </Text>
          <Text style={[styles.modeDescription, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
            {t('Choose which workspace you are using right now.')}
          </Text>
        </View>
        <View style={[styles.modeSelector, { backgroundColor: colors.muted, borderRadius: colors.radius }]}>
          {[
            { value: RoleSwitchInputRole.student, label: t('Student'), icon: 'book-open' as FeatherName },
            { value: RoleSwitchInputRole.teacher, label: t('Teacher'), icon: 'briefcase' as FeatherName },
          ].map((option) => {
            const active = workspaceRole === option.value;
            const pending = switchingTo === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: active, busy: pending }}
                onPress={() => void changeMode(option.value)}
                disabled={Boolean(switchingTo)}
                style={[
                  styles.modeOption,
                  active && { backgroundColor: colors.primary, borderRadius: colors.radius - 2 },
                ]}
              >
                {pending ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Feather name={option.icon} size={17} color={active ? colors.primaryForeground : colors.mutedForeground} />
                )}
                <Text style={{ color: active ? colors.primaryForeground : colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sansSemiBold }]}>
        {t('PLAN')}
      </Text>
      <PremiumCard />

      <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sansSemiBold }]}>
        {t('TOOLS')}
      </Text>
      <View style={styles.grid}>
        {nativeWorkspaces.map((item) => <WorkspaceCard key={item.title} item={item} onPress={() => open(item)} />)}
      </View>

      <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sansSemiBold }]}>
        {t('MORE WORKSPACES')}
      </Text>
      <Text style={[styles.sectionHelp, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
        {t('These full workspaces open inside the app with your current account.')}
      </Text>
      <View style={styles.grid}>
        {allFullWorkspaces.map((item) => <WorkspaceCard key={item.title} item={item} onPress={() => open(item)} />)}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 22 },
  logo: { width: 48, height: 48, borderRadius: 12 },
  heading: { fontSize: 24, letterSpacing: -0.4 },
  intro: { fontSize: 13, marginTop: 2 },
  sectionLabel: { fontSize: 11, letterSpacing: 1.1, marginTop: 20, marginBottom: 9 },
  sectionHelp: { fontSize: 12, lineHeight: 17, marginTop: -4, marginBottom: 10 },
  modeCard: { borderWidth: 1, padding: 15, gap: 14 },
  modeTitle: { fontSize: 16 },
  modeDescription: { fontSize: 12, marginTop: 3 },
  modeSelector: { flexDirection: 'row', padding: 3, gap: 3 },
  modeOption: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  workspaceCard: { width: '48%', minHeight: 138, borderWidth: 1, padding: 13 },
  workspaceIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  workspaceTitle: { fontSize: 14, paddingRight: 16 },
  workspaceDescription: { fontSize: 11.5, lineHeight: 16, marginTop: 4, paddingRight: 5 },
  chevron: { position: 'absolute', top: 15, right: 10 },
});
