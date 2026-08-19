import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Skeleton } from '@workspace/edu-ds/components/native/skeleton';
import { Badge } from '@workspace/edu-ds/components/native/badge';
import {
  useGetMe,
  useUpdateMe,
  useUploadAvatar,
  useDeleteMe,
  useSwitchRole,
  RoleSwitchInputRole,
  useGetCalendarStatus,
  useGetCalendarIcalUrl,
  useDisconnectCalendarGoogle,
  getGetCalendarStatusQueryKey,
  getGetMeQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useAuth } from '@/contexts/AuthContext';
import { PremiumCard } from '@/components/PremiumCard';
import { describeApiFailure } from '@/utils/api-failure';
import { TAB_BAR_CLEARANCE } from '@/utils/tab-bar';
import { ErrorState } from '@/components/ErrorState';
import { useLanguage } from '@/contexts/LanguageContext';
import { LANGUAGES } from '@/lib/i18n';

const SUBJECT_SUGGESTIONS = [
  'Mathematics', 'Science', 'English', 'History',
  'Computer Science', 'Art', 'Music', 'Biology',
  'Chemistry', 'Physics', 'Economics', 'Psychology',
];

function completeness(user: {
  name?: string;
  avatarUrl?: string | null;
  bio?: string | null;
  subjects?: string[] | null;
  gradeOrDept?: string | null;
  timezone?: string | null;
  websiteUrl?: string | null;
}): number {
  const fields = [
    !!user.name,
    !!user.avatarUrl,
    !!user.bio,
    !!(user.subjects && user.subjects.length > 0),
    !!user.gradeOrDept,
    !!user.timezone,
    !!user.websiteUrl,
  ];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
}

/** Calendar integration section for mobile profile */
function CalendarSection({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { t } = useLanguage();
  const { data: calStatus, isLoading } = useGetCalendarStatus();
  const { data: icalData } = useGetCalendarIcalUrl();
  const disconnectGoogle = useDisconnectCalendarGoogle();
  const queryClient = useQueryClient();

  const icalUrl = icalData?.url ?? null;

  async function handleShareIcalUrl() {
    if (!icalUrl) return;
    try {
      await Share.share({ message: icalUrl, title: t('Casparel Calendar Feed') });
    } catch {
      // User cancelled or error
    }
  }

  async function handleCopyIcalUrl() {
    if (!icalUrl) return;
    Clipboard.setString(icalUrl);
    Alert.alert(t('Copied!'), t('Calendar feed URL copied to clipboard.'));
  }

  async function handleDisconnect() {
    Alert.alert(t('Disconnect Google Calendar'), t('Future syncs will stop. Existing Google Calendar events are kept.'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Disconnect'),
          style: 'destructive',
          onPress: async () => {
            try {
              await disconnectGoogle.mutateAsync();
              queryClient.invalidateQueries({ queryKey: getGetCalendarStatusQueryKey() });
            } catch {
              Alert.alert(t('Error'), t('Could not disconnect Google Calendar.'));
            }
          },
        },
      ],
    );
  }

  if (isLoading) {
    return (
      <View style={[{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, borderWidth: 1, padding: 16, gap: 8 }]}>
        <View style={{ height: 16, width: 120, backgroundColor: colors.border, borderRadius: 4 }} />
        <View style={{ height: 40, backgroundColor: colors.border, borderRadius: 4 }} />
      </View>
    );
  }

  return (
    <View style={[{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, borderWidth: 1, padding: 16, gap: 12 }]}>
      {/* Google Calendar status */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Feather name="calendar" size={16} color={colors.primary} />
          <Text style={{ fontSize: 14, color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }}>
            {t('Google Calendar')}
          </Text>
        </View>
        {calStatus?.googleConnected ? (
          <TouchableOpacity
            onPress={handleDisconnect}
            style={{ backgroundColor: colors.destructive + '15', borderRadius: colors.radius, paddingHorizontal: 10, paddingVertical: 4 }}
            disabled={disconnectGoogle.isPending}
          >
            <Text style={{ fontSize: 12, color: colors.destructiveText, fontFamily: colors.fontFamily.sans }}>
              {t('Disconnect')}
            </Text>
          </TouchableOpacity>
        ) : calStatus?.googleConfigured ? (
          <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }}>
            {t('Connect via web app')}
          </Text>
        ) : (
          <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }}>
            {t('Not configured')}
          </Text>
        )}
      </View>

      {calStatus?.googleConnected && (
        <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }}>
          ✓ {t('Your schedule syncs automatically to Google Calendar.')}
        </Text>
      )}

      {!calStatus?.googleConnected && calStatus?.googleConfigured && (
        <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }}>
          {t('To connect Google Calendar, visit the Profile page in the web app.')}
        </Text>
      )}

      {/* Separator */}
      <View style={{ height: 1, backgroundColor: colors.border }} />

      {/* iCal subscription */}
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 14, color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }}>
          {t('Calendar Subscription (iCal)')}
        </Text>
        <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }}>
          {t('Subscribe to your schedule in Apple Calendar, Outlook, or any calendar app.')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            onPress={handleCopyIcalUrl}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius, paddingVertical: 8 }}
          >
            <Feather name="copy" size={14} color={colors.primary} />
            <Text style={{ fontSize: 13, color: colors.primary, fontFamily: colors.fontFamily.sansMedium }}>{t('Copy URL')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleShareIcalUrl}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: colors.radius, paddingVertical: 8 }}
          >
            <Feather name="share-2" size={14} color={colors.primaryForeground} />
            <Text style={{ fontSize: 13, color: colors.primaryForeground, fontFamily: colors.fontFamily.sansMedium }}>{t('Share URL')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const { t, language, setLanguage } = useLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { logout, updateToken } = useAuth();
  const deleteAccount = useDeleteMe();

  function confirmDeleteAccount() {
    Alert.alert(t('Delete account'), t('This permanently deletes your Casparel account and the content tied to it. This cannot be undone.'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete'),
          style: 'destructive',
          onPress: () => {
            // Second confirmation: the first tap is easy to hit by accident on
            // a row that sits under "Sign out".
            Alert.alert(t('Are you sure?'), t('There is no way to recover the account afterwards.'), [
              { text: t('Keep my account'), style: 'cancel' },
              {
                text: t('Delete permanently'),
                style: 'destructive',
                onPress: () =>
                  deleteAccount.mutate(undefined, {
                    onSuccess: () => logout(),
                    onError: () =>
                      Alert.alert(t('Could not delete your account'), t('Something went wrong. Please try again, or email support@casparel.com.'),
                      ),
                  }),
              },
            ]);
          },
        },
      ],
    );
  }
  const queryClient = useQueryClient();

  const { data: me, isLoading, isError, error, isFetching, refetch } = useGetMe();
  const updateMe = useUpdateMe();
  const uploadAvatar = useUploadAvatar();
  const switchRoleMutation = useSwitchRole();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: '',
    bio: '',
    gradeOrDept: '',
    timezone: '',
    websiteUrl: '',
    subjects: [] as string[],
  });
  const [subjectInput, setSubjectInput] = useState('');
  const [switching, setSwitching] = useState(false);

  const webTopPad = Platform.OS === 'web' ? 67 : 0;
  const pct = me ? completeness(me) : 0;
  const isTeacher = me?.role === 'teacher';

  function startEditing() {
    if (!me) return;
    setForm({
      name: me.name ?? '',
      bio: me.bio ?? '',
      gradeOrDept: me.gradeOrDept ?? '',
      timezone: me.timezone ?? '',
      websiteUrl: me.websiteUrl ?? '',
      subjects: me.subjects ?? [],
    });
    setEditing(true);
  }

  async function handleSave() {
    try {
      await updateMe.mutateAsync({
        data: {
          name: form.name || undefined,
          bio: form.bio || null,
          gradeOrDept: form.gradeOrDept || null,
          timezone: form.timezone || null,
          websiteUrl: form.websiteUrl || null,
          subjects: form.subjects.length > 0 ? form.subjects : null,
        },
      });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setEditing(false);
      Alert.alert(t('Saved'), t('Your profile has been updated.'));
    } catch (error) {
      Alert.alert(t('Could not save your profile'),
        describeApiFailure(error, 'Please check the fields and try again.'),
      );
    }
  }

  async function handlePickAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('Permission needed'), t('Please allow photo access to change your avatar.'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const fileName = asset.fileName ?? 'avatar.jpg';
    const mimeType = asset.mimeType ?? 'image/jpeg';
    try {
      // Pass the file descriptor directly, the generated client wraps it in FormData.
      // React Native's FormData accepts { uri, name, type } as a file-like value.
      await uploadAvatar.mutateAsync({
        data: { file: { uri: asset.uri, name: fileName, type: mimeType } as unknown as File },
      });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      Alert.alert(t('Done'), t('Avatar updated!'));
    } catch {
      Alert.alert(t('Error'), t('Could not upload avatar.'));
    }
  }

  async function handleRoleToggle() {
    if (switching) return;
    const newRole = isTeacher ? RoleSwitchInputRole.student : RoleSwitchInputRole.teacher;
    setSwitching(true);
    try {
      const result = await switchRoleMutation.mutateAsync({ data: { role: newRole } });
      // The token first, so everything refetched below carries the new role.
      await updateToken(result.token);
      /*
       * Everything, not just /users/me.
       *
       * A workspace is not a label on the same data: activities, learning
       * goals and the activity feed are stored per workspace role, and the
       * plan the server reports depends on it too. Only `me` was invalidated,
       * so switching to Teacher left the student workspace's rows on screen --
       * measured, not assumed: the server returned zero activity rows for the
       * teacher workspace while the dashboard still listed the student's.
       *
       * The web app reloads the whole page here for exactly this reason. A
       * phone cannot, and clearing the cache is the same thing: every query
       * that is on screen refetches under the new role, and nothing that is
       * not on screen survives to be shown later.
       */
      queryClient.clear();
    } catch (error) {
      Alert.alert(t('Could not switch role'),
        describeApiFailure(error, 'Please try again.'),
      );
    } finally {
      setSwitching(false);
    }
  }

  function addSubject(s: string) {
    const trimmed = s.trim();
    if (!trimmed || form.subjects.includes(trimmed)) return;
    setForm((p) => ({ ...p, subjects: [...p.subjects, trimmed] }));
    setSubjectInput('');
  }

  function removeSubject(s: string) {
    setForm((p) => ({ ...p, subjects: p.subjects.filter((x) => x !== s) }));
  }

  if (isLoading) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background, paddingTop: insets.top + webTopPad + 16 }]}>
        <View style={{ padding: 16, gap: 12 }}>
          <Skeleton width={120} height={28} />
          <Skeleton width="100%" height={100} />
          <Skeleton width="100%" height={80} />
        </View>
      </View>
    );
  }

  /*
   * A profile that could not be fetched is not a blank profile.
   *
   * With no signal this screen rendered the whole thing empty: no name, "No
   * bio yet", "No subjects added yet", every detail "Not set", and 0%
   * complete. It is the one screen where blank means something specific --
   * "this is what your account holds" -- so it read as an account that had
   * been wiped, and the encouraging 0% invited the person to type it all in
   * again over the top of data that was still there.
   */
  if (isError && me === undefined) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background, paddingTop: insets.top + webTopPad + 16 }]}>
        <ErrorState
          error={error}
          retrying={isFetching}
          onRetry={() => {
            void refetch();
          }}
          style={{ paddingTop: 24 }}
        />
      </View>
    );
  }

  const roleLabel = isTeacher ? 'Teacher' : 'Student';
  const roleDescription = isTeacher
    ? 'You can create classes and manage resources'
    : 'You can browse resources and join classes';

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + webTopPad + 16, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Title row */}
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: colors.fontFamily.sansBold }]}>
          {t('My Profile')}
        </Text>
        {!editing ? (
          <TouchableOpacity
            style={[styles.editBtn, { borderColor: colors.border, borderRadius: colors.radius }]}
            onPress={startEditing}
          >
            <Feather name="edit-2" size={14} color={colors.primary} />
            <Text style={[styles.editBtnText, { color: colors.primary, fontFamily: colors.fontFamily.sans }]}>
              {t('Edit')}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.editActions}>
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: colors.border, borderRadius: colors.radius }]}
              onPress={() => setEditing(false)}
            >
              <Text style={[{ color: colors.mutedForeground, fontFamily: colors.fontFamily.sans, fontSize: 14 }]}>
                {t('Cancel')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
              onPress={handleSave}
              disabled={updateMe.isPending}
            >
              <Text style={[{ color: colors.primaryForeground, fontFamily: colors.fontFamily.sansBold, fontSize: 14 }]}>
                {updateMe.isPending ? 'Saving…' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Completeness */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <View style={styles.completenessRow}>
          <Text style={[styles.completenessLabel, { color: colors.foreground, fontFamily: colors.fontFamily.sans }]}>
            {t('Profile completeness')}
          </Text>
          <Text style={[styles.completenessVal, { color: colors.primary, fontFamily: colors.fontFamily.sansBold }]}>
            {pct}%
          </Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <View style={[styles.progressFill, { width: `${pct}%` as never, backgroundColor: colors.primary }]} />
        </View>
        {pct < 100 && (
          <Text style={[styles.completenessHint, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
            {t('Fill in all fields to complete your profile')}
          </Text>
        )}
      </View>

      {/* Avatar + name */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <View style={styles.avatarRow}>
          <TouchableOpacity style={styles.avatarWrap} onPress={handlePickAvatar}>
            {me?.avatarUrl ? (
              <Image
                source={{ uri: me.avatarUrl }}
                style={[styles.avatarImg, { borderRadius: 40, borderColor: colors.border }]}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary + '1A', borderRadius: 40, borderColor: colors.border }]}>
                <Feather name="user" size={28} color={colors.primary} />
              </View>
            )}
            <View style={[styles.cameraBtn, { backgroundColor: colors.primary }]}>
              <Feather name="camera" size={11} color={colors.primaryForeground} />
            </View>
          </TouchableOpacity>

          <View style={styles.nameArea}>
            {editing ? (
              <>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
                  {t('Display name')}
                </Text>
                <TextInput
                  value={form.name}
                  onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
                  style={[styles.input, { borderColor: colors.border, color: colors.foreground, fontFamily: colors.fontFamily.sans, backgroundColor: colors.background, borderRadius: colors.radius }]}
                  placeholder={t('Your name')}
                  placeholderTextColor={colors.mutedForeground}
                  maxLength={100}
                />
              </>
            ) : (
              <>
                <Text style={[styles.name, { color: colors.foreground, fontFamily: colors.fontFamily.sansBold }]} numberOfLines={2}>
                  {me?.name ?? ''}
                </Text>
                <Text style={[styles.email, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]} numberOfLines={1}>
                  {me?.email ?? ''}
                </Text>
              </>
            )}
            <View style={{ marginTop: 8 }}>
              <Badge variant="secondary">{me?.role ?? ''}</Badge>
            </View>
          </View>
        </View>
      </View>

      {/* Bio */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }]}>
          {t('Bio')}
        </Text>
        {editing ? (
          <>
            <TextInput
              value={form.bio}
              onChangeText={(v) => setForm((p) => ({ ...p, bio: v }))}
              style={[styles.textarea, { borderColor: colors.border, color: colors.foreground, fontFamily: colors.fontFamily.sans, backgroundColor: colors.background, borderRadius: colors.radius }]}
              placeholder="Tell others about yourself…"
              placeholderTextColor={colors.mutedForeground}
              multiline
              maxLength={300}
              textAlignVertical="top"
            />
            <Text style={[styles.charCount, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
              {form.bio.length}/300
            </Text>
          </>
        ) : me?.bio ? (
          <Text style={[styles.bioText, { color: colors.foreground, fontFamily: colors.fontFamily.sans }]}>
            {me.bio}
          </Text>
        ) : (
          <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
            {t('No bio yet.')}
          </Text>
        )}
      </View>

      {/* Subjects */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }]}>
          Subjects &amp; Interests
        </Text>
        {editing ? (
          <>
            <View style={styles.subjectInputRow}>
              <TextInput
                value={subjectInput}
                onChangeText={setSubjectInput}
                style={[styles.subjectInput, { borderColor: colors.border, color: colors.foreground, fontFamily: colors.fontFamily.sans, backgroundColor: colors.background, borderRadius: colors.radius }]}
                placeholder="Add a subject…"
                placeholderTextColor={colors.mutedForeground}
                onSubmitEditing={() => addSubject(subjectInput)}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
                onPress={() => addSubject(subjectInput)}
              >
                <Text style={[{ color: colors.primaryForeground, fontFamily: colors.fontFamily.sansBold, fontSize: 13 }]}>{t('Add')}</Text>
              </TouchableOpacity>
            </View>
            {form.subjects.length > 0 && (
              <View style={styles.tagWrap}>
                {form.subjects.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.tag, { backgroundColor: colors.primary + '20', borderColor: colors.primary + '40', borderRadius: 20 }]}
                    onPress={() => removeSubject(s)}
                  >
                    <Text style={[styles.tagText, { color: colors.primary, fontFamily: colors.fontFamily.sans }]}>{s} ×</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <View style={styles.tagWrap}>
              {SUBJECT_SUGGESTIONS.filter((s) => !form.subjects.includes(s)).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.suggestTag, { borderColor: colors.border, borderRadius: 20 }]}
                  onPress={() => addSubject(s)}
                >
                  <Text style={[styles.suggestTagText, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>+ {s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : me?.subjects && me.subjects.length > 0 ? (
          <View style={styles.tagWrap}>
            {me.subjects.map((s) => (
              <View key={s} style={[styles.tag, { backgroundColor: colors.primary + '20', borderColor: colors.primary + '40', borderRadius: 20 }]}>
                <Text style={[styles.tagText, { color: colors.primary, fontFamily: colors.fontFamily.sans }]}>{s}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
            {t('No subjects added yet.')}
          </Text>
        )}
      </View>

      {/* Details */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }]}>
          {t('Details')}
        </Text>
        {editing ? (
          <View style={{ gap: 12 }}>
            <View>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
                {isTeacher ? 'Department' : 'Grade level'}
              </Text>
              <TextInput
                value={form.gradeOrDept}
                onChangeText={(v) => setForm((p) => ({ ...p, gradeOrDept: v }))}
                style={[styles.input, { borderColor: colors.border, color: colors.foreground, fontFamily: colors.fontFamily.sans, backgroundColor: colors.background, borderRadius: colors.radius }]}
                placeholder={isTeacher ? 'e.g. Science Department' : 'e.g. Grade 10'}
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
            <View>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
                {t('Timezone')}
              </Text>
              <TextInput
                value={form.timezone}
                onChangeText={(v) => setForm((p) => ({ ...p, timezone: v }))}
                style={[styles.input, { borderColor: colors.border, color: colors.foreground, fontFamily: colors.fontFamily.sans, backgroundColor: colors.background, borderRadius: colors.radius }]}
                placeholder="e.g. America/New_York"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
            <View>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
                {t('Website / Social link')}
              </Text>
              <TextInput
                value={form.websiteUrl}
                onChangeText={(v) => setForm((p) => ({ ...p, websiteUrl: v }))}
                style={[styles.input, { borderColor: colors.border, color: colors.foreground, fontFamily: colors.fontFamily.sans, backgroundColor: colors.background, borderRadius: colors.radius }]}
                placeholder="https://…"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="url"
                autoCapitalize="none"
              />
            </View>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <View style={styles.detailRow}>
              <Feather name="book" size={14} color={colors.mutedForeground} />
              <Text style={[styles.detailLabel, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
                {isTeacher ? 'Department' : 'Grade'}
              </Text>
              <Text style={[styles.detailValue, { color: me?.gradeOrDept ? colors.foreground : colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
                {me?.gradeOrDept || 'Not set'}
              </Text>
            </View>
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
            <View style={styles.detailRow}>
              <Feather name="clock" size={14} color={colors.mutedForeground} />
              <Text style={[styles.detailLabel, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
                {t('Timezone')}
              </Text>
              <Text style={[styles.detailValue, { color: me?.timezone ? colors.foreground : colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
                {me?.timezone || 'Not set'}
              </Text>
            </View>
            {me?.websiteUrl ? (
              <>
                <View style={[styles.separator, { backgroundColor: colors.border }]} />
                <View style={styles.detailRow}>
                  <Feather name="globe" size={14} color={colors.mutedForeground} />
                  <Text style={[styles.detailLabel, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
                    {t('Website')}
                  </Text>
                  <Text style={[styles.detailValue, { color: colors.primary, fontFamily: colors.fontFamily.sans }]} numberOfLines={1}>
                    {me.websiteUrl}
                  </Text>
                </View>
              </>
            ) : null}
          </View>
        )}
      </View>

      {/* Premium / subscription */}
      <Text style={[styles.sectionHeader, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sansSemiBold }]}>
        {t('PLAN')}
      </Text>
      <PremiumCard />

      {/* Role switcher */}
      <Text style={[styles.sectionHeader, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sansSemiBold }]}>
        {t('ACCOUNT')}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: colors.primary + '15', borderRadius: colors.radius - 2 }]}>
              <Feather name={isTeacher ? 'briefcase' : 'book-open'} size={18} color={colors.primary} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }]}>
                Mode: {roleLabel}
              </Text>
              <Text style={[styles.rowDescription, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]} numberOfLines={2}>
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
              <Text style={[styles.teacherBadge, { color: colors.accent, fontFamily: colors.fontFamily.sans }]}>
                {t('Google Classroom integration available')}
              </Text>
            </View>
            <View style={styles.teacherBadgeRow}>
              <Feather name="check-circle" size={14} color={colors.accent} />
              <Text style={[styles.teacherBadge, { color: colors.accent, fontFamily: colors.fontFamily.sans }]}>
                {t('Class creation and roster management enabled')}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* Calendar Integration */}
      <Text style={[styles.sectionHeader, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sansSemiBold }]}>
        {t('CALENDAR')}
      </Text>
      <CalendarSection colors={colors} />

      {/*
        The language, above sign-out because it is a setting somebody changes
        rather than a way out. Saved to the account as well as the phone, so
        picking it here is picking it on the web too.
      */}
      <Text style={[styles.sectionHeader, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sansSemiBold }]}>
        {t('LANGUAGE')}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        {LANGUAGES.map((entry, index) => (
          <TouchableOpacity
            key={entry.code}
            style={[styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
            onPress={() => void setLanguage(entry.code)}
            activeOpacity={0.7}
            accessibilityRole="radio"
            accessibilityState={{ selected: entry.code === language }}
            // The label is the language's own name, which is the one word on
            // this screen that must never be translated: somebody looking for
            // their language is looking for "Türkçe", not for whatever the
            // current language calls Turkish.
            accessibilityLabel={entry.label}
            testID={`language-${entry.code}`}
          >
            <View style={styles.rowLeft}>
              <View style={[styles.rowIcon, { backgroundColor: colors.primary + '15', borderRadius: colors.radius - 2 }]}>
                <Feather name="globe" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.rowLabel, { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }]}>
                {entry.label}
              </Text>
            </View>
            {entry.code === language ? (
              <Feather name="check" size={18} color={colors.primary} />
            ) : null}
          </TouchableOpacity>
        ))}
      </View>

      {/* Sign out */}
      <Text style={[styles.sectionHeader, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sansSemiBold }]}>
        {t('SESSION')}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <TouchableOpacity
          style={styles.row}
          onPress={() =>
            Alert.alert(t('Sign out'), t('Are you sure you want to sign out?'), [
              { text: t('Cancel'), style: 'cancel' },
              { text: t('Sign out'), style: 'destructive', onPress: logout },
            ])
          }
          activeOpacity={0.7}
        >
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: colors.destructive + '15', borderRadius: colors.radius - 2 }]}>
              <Feather name="log-out" size={18} color={colors.destructiveText} />
            </View>
            <Text style={[styles.rowLabel, { color: colors.destructiveText, fontFamily: colors.fontFamily.sansSemiBold }]}>
              {t('Sign out')}
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/*
        Deleting your account has to be possible from inside the app. App Store
        guideline 5.1.1(v) requires it of anything that lets you create an
        account, and until now the only way was the web app - the server route
        existed but was missing from the API spec, so no generated client could
        reach it. Two steps on purpose: this is irreversible.
      */}
      {/* Not a second "ACCOUNT": there is already one above, and two
          identical headings on one screen tell you nothing about which is
          which. */}
      <Text style={[styles.sectionHeader, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sansSemiBold }]}>
        {t('CLOSING YOUR ACCOUNT')}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <TouchableOpacity
          style={styles.row}
          disabled={deleteAccount.isPending}
          onPress={confirmDeleteAccount}
          activeOpacity={0.7}
        >
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: colors.destructive + '15', borderRadius: colors.radius - 2 }]}>
              <Feather name="trash-2" size={18} color={colors.destructiveText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.destructiveText, fontFamily: colors.fontFamily.sansSemiBold }]}>
                {deleteAccount.isPending ? 'Deleting account…' : 'Delete account'}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: colors.fontFamily.sans, fontSize: 12, marginTop: 2 }}>
                {t('Permanently removes your account and content')}
              </Text>
            </View>
          </View>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 12 },
  // Title / edit row
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title: { fontSize: 26, letterSpacing: -0.5 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  editBtnText: { fontSize: 13 },
  editActions: { flexDirection: 'row', gap: 8 },
  cancelBtn: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 6 },
  // Card
  card: {
    borderWidth: 1,
    padding: 16,
    gap: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  // Completeness
  completenessRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  completenessLabel: { fontSize: 14 },
  completenessVal: { fontSize: 14 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  completenessHint: { fontSize: 11, marginTop: -4 },
  // Avatar
  avatarRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  avatarWrap: { position: 'relative', width: 72, height: 72 },
  avatarImg: { width: 72, height: 72, borderWidth: 2 },
  avatarPlaceholder: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  cameraBtn: { position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  nameArea: { flex: 1, gap: 2 },
  name: { fontSize: 18, letterSpacing: -0.3 },
  email: { fontSize: 12 },
  // Fields
  sectionTitle: { fontSize: 14, marginBottom: 2 },
  bioText: { fontSize: 14, lineHeight: 20 },
  emptyText: { fontSize: 14, fontStyle: 'italic' },
  textarea: { borderWidth: 1, padding: 10, fontSize: 14, minHeight: 80 },
  charCount: { fontSize: 11, textAlign: 'right', marginTop: -6 },
  input: { borderWidth: 1, padding: 10, fontSize: 14, height: 40 },
  fieldLabel: { fontSize: 12, marginBottom: 4 },
  subjectInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  subjectInput: { flex: 1, borderWidth: 1, padding: 10, fontSize: 14, height: 40 },
  addBtn: { paddingHorizontal: 14, height: 40, alignItems: 'center', justifyContent: 'center' },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  tag: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { fontSize: 12 },
  suggestTag: { borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: 8, paddingVertical: 3 },
  suggestTagText: { fontSize: 11 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailLabel: { fontSize: 13, width: 90 },
  detailValue: { flex: 1, fontSize: 13 },
  separator: { height: StyleSheet.hairlineWidth },
  // Account / role section
  sectionHeader: { fontSize: 11, letterSpacing: 0.8, marginTop: 8, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 15 },
  rowDescription: { fontSize: 12, lineHeight: 16 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: -16 },
  teacherBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  teacherBadge: { fontSize: 12 },
});
