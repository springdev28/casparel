import React, { useState, useRef } from 'react';
import {
  Animated,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Empty } from '@workspace/edu-ds/components/native/empty';
import { Skeleton } from '@workspace/edu-ds/components/native/skeleton';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListScheduleBlocks,
  useListStudySessions,
  useCreateStudySession,
  useRsvpStudySession,
  useSearchUsers,
  useListResources,
  getListStudySessionsQueryKey,
} from '@workspace/api-client-react';
import type { ScheduleBlock, StudySessionWithParticipants, PublicUser, Resource } from '@workspace/api-client-react';
import { describeApiFailure } from '@/utils/api-failure';
import { sessionPalette } from '@/utils/session-palette';
import { ErrorState } from '@/components/ErrorState';
import { TAB_BAR_CLEARANCE } from '@/utils/tab-bar';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Day and month names come from Intl, not from an array in here.
 *
 * There were two such arrays, both English, and no dictionary could have
 * replaced them: the strip shows seven weekdays and they change every week,
 * so there is no fixed string to translate. A Turkish reader got a screen
 * headed "Program" with "Mon Tue Wed Thu Fri Sat" under it.
 */
function weekdayLabel(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date);
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const dayOfWeek = d.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateParam(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** A Date on the 24-hour dial, in the reader's language. */
function clock(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Twenty-four hours, on the phone too.
 *
 * A schedule block stores "09:00" and the phone was drawing it as "9:00 AM"
 * while the web app drew "09:00" from the same row -- the same two-clocks
 * problem the web resolved, only spread across two clients instead of one
 * screen. Same resolution, same reason: it is the form the data is in, and
 * the form five of the six languages use.
 */
function formatTime(time: string): string {
  return time.slice(0, 5);
}

function formatDateTime(iso: string, locale: string): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(d);
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  return `${day} · ${time}`;
}

/** Regular schedule block card */
function BlockCard({ block }: { block: ScheduleBlock }) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.blockCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderLeftColor: colors.primary,
          borderRadius: colors.radius,
        },
      ]}
    >
      <Text
        style={[styles.blockTitle, { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }]}
        numberOfLines={2}
      >
        {block.title}
      </Text>
      <Text style={[styles.blockTime, { color: colors.accent, fontFamily: colors.fontFamily.sansMedium }]}>
        {formatTime(block.startTime)} – {formatTime(block.endTime)}
      </Text>
      {block.notes ? (
        <Text style={[styles.blockNotes, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]} numberOfLines={2}>
          {block.notes}
        </Text>
      ) : null}
    </View>
  );
}

/** Collaborative study session card */
function StudySessionCard({
  session,
  onPress,
}: {
  session: StudySessionWithParticipants;
  onPress: () => void;
}) {
  const { t, intlLocale } = useLanguage();
  const colors = useColors();
  const violet = sessionPalette(useColorScheme());
  const isPending = session.myStatus === 'pending';
  const startsAt = new Date(session.startsAt);
  const endsAt = new Date(startsAt.getTime() + session.durationMinutes * 60 * 1000);


  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.blockCard,
        {
          backgroundColor: pressed ? violet.surfacePressed : violet.surface,
          borderColor: violet.border,
          borderLeftColor: violet.accent,
          borderRadius: colors.radius,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={styles.sessionRow}>
        <Text style={[styles.blockTitle, { color: violet.strongText, fontFamily: colors.fontFamily.sansSemiBold, flex: 1 }]} numberOfLines={2}>
          {session.title}
        </Text>
        {isPending && (
          <View style={[styles.pendingBadge, { borderColor: violet.accent }]}>
            <Text style={[styles.pendingBadgeText, { color: violet.accentText, fontFamily: colors.fontFamily.sans }]}>{t('Pending')}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.blockTime, { color: violet.accentText, fontFamily: colors.fontFamily.sansMedium }]}>
        {clock(startsAt, intlLocale)} – {clock(endsAt, intlLocale)}
      </Text>
      <View style={styles.sessionMeta}>
        <View style={[styles.collaborativeBadge, { backgroundColor: violet.surfacePressed }]}>
          <Text style={[styles.collaborativeBadgeText, { color: violet.accentText, fontFamily: colors.fontFamily.sans }]}>👥 {t('Collaborative')}</Text>
        </View>
        <Text style={[styles.participantCount, { color: violet.accentText, fontFamily: colors.fontFamily.sans }]}>
          {session.participants.length} invited
        </Text>
      </View>
    </Pressable>
  );
}

/** Study session detail bottom sheet */
function StudySessionDetailSheet({
  session,
  visible,
  onClose,
  onRsvp,
  rsvpLoading,
}: {
  session: StudySessionWithParticipants | null;
  visible: boolean;
  onClose: () => void;
  onRsvp: (sessionId: number, status: 'accepted' | 'declined') => void;
  rsvpLoading: boolean;
}) {
  const { t, intlLocale } = useLanguage();
  const colors = useColors();
  const violet = sessionPalette(useColorScheme());
  const insets = useSafeAreaInsets();
  if (!session) return null;

  const startsAt = new Date(session.startsAt);
  const endsAt = new Date(startsAt.getTime() + session.durationMinutes * 60 * 1000);

  function handleJoin() {
    Linking.openURL(session!.meetingUrl).catch(() => {});
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheetContainer, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
        {/* Handle */}
        <View style={styles.sheetHandle}>
          <View style={[styles.sheetHandleBar, { backgroundColor: colors.border }]} />
        </View>

        {/* Header */}
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sheetTitle, { color: colors.foreground, fontFamily: colors.fontFamily.sansBold }]} numberOfLines={2}>
              {session.title}
            </Text>
            <View style={styles.sessionRow}>
              <View style={[styles.collaborativeBadge, { backgroundColor: violet.surfacePressed }]}>
                <Text style={[styles.collaborativeBadgeText, { color: violet.accentText, fontFamily: colors.fontFamily.sans }]}>👥 {t('Collaborative')}</Text>
              </View>
            </View>
          </View>
          <Pressable onPress={onClose} style={styles.closeButton} hitSlop={8}>
            <Text style={{ color: colors.mutedForeground, fontSize: 20 }}>✕</Text>
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 16 }} showsVerticalScrollIndicator={false}>
          {/* Time */}
          <View style={[styles.infoRow, { backgroundColor: colors.muted, borderRadius: colors.radius }]}>
            <Text style={{ fontSize: 16 }}>🕐</Text>
            <Text style={[styles.infoText, { color: colors.foreground, fontFamily: colors.fontFamily.sans }]}>
              {formatDateTime(session.startsAt, intlLocale)} – {clock(endsAt, intlLocale)}{'\n'}
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{session.durationMinutes} minutes</Text>
            </Text>
          </View>

          {/* Meeting link */}
          <Pressable
            onPress={handleJoin}
            style={[styles.meetingLinkRow, { backgroundColor: violet.surfacePressed, borderRadius: colors.radius }]}
          >
            <Text style={{ fontSize: 16 }}>🎥</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.joinLabel, { color: violet.strongText, fontFamily: colors.fontFamily.sansSemiBold }]}>{t('Join Meeting')}</Text>
              <Text style={[styles.meetingUrl, { color: violet.accentText, fontFamily: colors.fontFamily.sans }]} numberOfLines={1}>
                {session.meetingUrl}
              </Text>
            </View>
            <Text style={{ color: violet.accentText, fontSize: 12, fontFamily: colors.fontFamily.sans }}>Open ↗</Text>
          </Pressable>

          {/* Topic */}
          {session.topic ? (
            <View style={{ gap: 4 }}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sansSemiBold }]}>{t('Topic')}</Text>
              <Text style={[{ color: colors.foreground, fontFamily: colors.fontFamily.sans, fontSize: 14 }]}>{session.topic}</Text>
            </View>
          ) : null}

          {/* Participants */}
          <View style={{ gap: 8 }}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sansSemiBold }]}>
              PARTICIPANTS ({session.participants.length})
            </Text>
            {session.participants.map((p) => (
              <View key={p.userId} style={styles.participantRow}>
                <View style={[styles.participantAvatar, { backgroundColor: colors.muted }]}>
                  <Text style={{ fontSize: 14 }}>👤</Text>
                </View>
                <Text style={[styles.participantName, { color: colors.foreground, fontFamily: colors.fontFamily.sans, flex: 1 }]} numberOfLines={1}>
                  {p.name ?? `User ${p.userId}`}
                </Text>
                <View style={[
                  styles.statusBadge,
                  {
                    borderColor: p.status === 'accepted' ? violet.positiveText : p.status === 'declined' ? violet.negativeText : violet.accentText,
                    backgroundColor: p.status === 'accepted' ? violet.positiveSurface : p.status === 'declined' ? violet.negativeSurface : violet.surface,
                  }
                ]}>
                  <Text style={[
                    styles.statusText,
                    {
                      color: p.status === 'accepted' ? violet.positiveText : p.status === 'declined' ? violet.negativeText : violet.accentText,
                      fontFamily: colors.fontFamily.sans,
                    }
                  ]}>
                    {p.status === 'accepted'
                      ? `✓ ${t('Accepted')}`
                      : p.status === 'declined'
                        ? `✗ ${t('Declined')}`
                        : `⏳ ${t('Pending')}`}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Action buttons */}
        <View style={[styles.sheetActions, { borderTopColor: colors.border, paddingTop: 12, paddingHorizontal: 20, gap: 10 }]}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={handleJoin}
              style={[styles.joinButton, { backgroundColor: violet.accent, borderRadius: colors.radius, flex: 1 }]}
            >
              <Text style={[styles.joinButtonText, { color: violet.onAccent, fontFamily: colors.fontFamily.sansSemiBold }]}>🎥 {t('Join')}</Text>
            </Pressable>
            <Pressable
              onPress={async () => {
                const start = new Date(session.startsAt);
                const end = new Date(start.getTime() + session.durationMinutes * 60 * 1000);
                const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace('.000', '');
                const params = new URLSearchParams({
                  action: 'TEMPLATE',
                  text: session.title,
                  dates: `${fmt(start)}/${fmt(end)}`,
                  location: session.meetingUrl,
                  details: session.topic ?? '',
                });
                const url = `https://calendar.google.com/calendar/render?${params.toString()}`;
                await Share.share({ message: url, title: t('Add to Calendar') });
              }}
              style={[{ borderRadius: colors.radius, borderWidth: 1, borderColor: violet.accent, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }]}
            >
              <Text style={{ color: violet.accentText, fontSize: 13, fontFamily: colors.fontFamily.sansSemiBold }}>📅 {t('Export')}</Text>
            </Pressable>
          </View>

          {session.myStatus === 'pending' && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => { onRsvp(session.id, 'accepted'); onClose(); }}
                disabled={rsvpLoading}
                style={[styles.acceptButton, { backgroundColor: violet.positive, borderRadius: colors.radius, flex: 1, opacity: rsvpLoading ? 0.6 : 1 }]}
              >
                <Text style={[styles.acceptButtonText, { color: violet.onPositive, fontFamily: colors.fontFamily.sansSemiBold }]}>✓ {t('Accept')}</Text>
              </Pressable>
              <Pressable
                onPress={() => { onRsvp(session.id, 'declined'); onClose(); }}
                disabled={rsvpLoading}
                style={[styles.declineButton, { borderRadius: colors.radius, flex: 1, borderColor: colors.border, opacity: rsvpLoading ? 0.6 : 1 }]}
              >
                <Text style={[styles.declineButtonText, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>✗ {t('Decline')}</Text>
              </Pressable>
            </View>
          )}

          {session.myStatus === 'accepted' && (
            <Pressable
              onPress={() => { onRsvp(session.id, 'declined'); onClose(); }}
              disabled={rsvpLoading}
              style={[styles.declineButton, { borderRadius: colors.radius, borderColor: colors.border, opacity: rsvpLoading ? 0.6 : 1 }]}
            >
              <Text style={[styles.declineButtonText, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>{t('Decline invitation')}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

/** Debounce hook */
function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Create Study Session form modal */
function CreateStudySessionModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { t, intlLocale } = useLanguage();
  const colors = useColors();
  const violet = sessionPalette(useColorScheme());
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const createSession = useCreateStudySession();

  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('14:00');
  const [duration, setDuration] = useState('60');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [topic, setTopic] = useState('');
  const [error, setError] = useState('');

  // Invitee search state
  const [inviteeQuery, setInviteeQuery] = useState('');
  const [selectedInvitees, setSelectedInvitees] = useState<PublicUser[]>([]);
  const debouncedQuery = useDebounce(inviteeQuery, 300);
  const { data: searchResults } = useSearchUsers(
    { q: debouncedQuery || undefined },
    { query: { enabled: debouncedQuery.length >= 1, queryKey: ['mobileSearchUsers', debouncedQuery] as const } },
  );

  // Resource selection state
  const [resourceQuery, setResourceQuery] = useState('');
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const debouncedResourceQuery = useDebounce(resourceQuery, 300);
  const resourceParams = { q: debouncedResourceQuery || undefined };
  const { data: resources } = useListResources(
    resourceParams,
    { query: { enabled: resourceQuery.length >= 1, queryKey: ['mobileListResources', resourceParams] as const } },
  );

  function reset() {
    setTitle(''); setDate(''); setStartTime('14:00'); setDuration('60');
    setMeetingUrl(''); setTopic(''); setError('');
    setInviteeQuery(''); setSelectedInvitees([]);
    setResourceQuery(''); setSelectedResource(null);
  }

  function toggleInvitee(user: PublicUser) {
    setSelectedInvitees((prev) =>
      prev.some((u) => u.id === user.id) ? prev.filter((u) => u.id !== user.id) : [...prev, user],
    );
  }

  async function handleCreate() {
    if (!title.trim()) { setError(t('Title is required')); return; }
    if (!date.trim()) { setError(t('Date is required')); return; }
    if (!meetingUrl.trim()) { setError(t('Meeting URL is required')); return; }
    if (!meetingUrl.trim().match(/^https?:\/\//i)) { setError(t('Meeting URL must start with https:// or http://')); return; }
    const durationNum = parseInt(duration, 10);
    if (isNaN(durationNum) || durationNum < 5) { setError(t('Duration must be at least 5 minutes')); return; }

    setError('');
    try {
      const startsAt = new Date(`${date}T${startTime}:00`).toISOString();
      await createSession.mutateAsync({
        data: {
          title: title.trim(),
          startsAt,
          durationMinutes: durationNum,
          meetingUrl: meetingUrl.trim(),
          topic: topic.trim() || undefined,
          resourceId: selectedResource?.id ?? undefined,
          inviteeIds: selectedInvitees.map((u) => u.id),
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListStudySessionsQueryKey() });
      reset();
      onClose();
    } catch (error) {
      // The server says which of these it was -- a bad meeting URL, an
      // invitee whose privacy preference refuses the invite, a missing
      // resource. Blaming the URL for all of them left people retyping one
      // that was never wrong.
      setError(describeApiFailure(error, t('Could not create the session. Please try again.')));
    }
  }

  const inputStyle = [
    styles.textInput,
    {
      color: colors.foreground,
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: colors.radius,
      fontFamily: colors.fontFamily.sans,
    },
  ];

  // Invitees not already selected, from search
  const filteredResults = (searchResults ?? []).filter(
    (u) => !selectedInvitees.some((s) => s.id === u.id),
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { reset(); onClose(); }}>
      <View style={[styles.sheetContainer, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetHandle}>
          <View style={[styles.sheetHandleBar, { backgroundColor: colors.border }]} />
        </View>
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sheetTitle, { color: colors.foreground, fontFamily: colors.fontFamily.sansBold }]}>
            {t('New Study Session')}
          </Text>
          <Pressable onPress={() => { reset(); onClose(); }} style={styles.closeButton} hitSlop={8}>
            <Text style={{ color: colors.mutedForeground, fontSize: 20 }}>✕</Text>
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
          {error ? (
            <View style={[styles.errorBox, { backgroundColor: violet.negativeSurface, borderRadius: colors.radius }]}>
              <Text style={{ color: violet.negativeText, fontSize: 13, fontFamily: colors.fontFamily.sans }}>{error}</Text>
            </View>
          ) : null}

          {/* Title */}
          <View style={{ gap: 6 }}>
            <Text style={[styles.fieldLabel, { color: colors.foreground, fontFamily: colors.fontFamily.sansMedium }]}>Title *</Text>
            <TextInput
              style={inputStyle}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Calculus group review"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>

          {/* Date */}
          <View style={{ gap: 6 }}>
            <Text style={[styles.fieldLabel, { color: colors.foreground, fontFamily: colors.fontFamily.sansMedium }]}>Date * (YYYY-MM-DD)</Text>
            <TextInput
              style={inputStyle}
              value={date}
              onChangeText={setDate}
              placeholder="2026-08-10"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
            />
          </View>

          {/* Time + Duration */}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ gap: 6, flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground, fontFamily: colors.fontFamily.sansMedium }]}>Start time *</Text>
              <TextInput
                style={inputStyle}
                value={startTime}
                onChangeText={setStartTime}
                placeholder="14:00"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
            <View style={{ gap: 6, flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground, fontFamily: colors.fontFamily.sansMedium }]}>Duration (min) *</Text>
              <TextInput
                style={inputStyle}
                value={duration}
                onChangeText={setDuration}
                placeholder="60"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
              />
            </View>
          </View>

          {/* Meeting link */}
          <View style={{ gap: 6 }}>
            <Text style={[styles.fieldLabel, { color: colors.foreground, fontFamily: colors.fontFamily.sansMedium }]}>Meeting link *</Text>
            <TextInput
              style={inputStyle}
              value={meetingUrl}
              onChangeText={setMeetingUrl}
              placeholder="https://meet.google.com/…"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              keyboardType="url"
            />
          </View>

          {/* Topic */}
          <View style={{ gap: 6 }}>
            <Text style={[styles.fieldLabel, { color: colors.foreground, fontFamily: colors.fontFamily.sansMedium }]}>{t('Topic (optional)')}</Text>
            <TextInput
              style={[inputStyle, { minHeight: 64, textAlignVertical: 'top' }]}
              value={topic}
              onChangeText={setTopic}
              placeholder={t('What will you study?')}
              placeholderTextColor={colors.mutedForeground}
              multiline
            />
          </View>

          {/* Invitee search */}
          <View style={{ gap: 8 }}>
            <Text style={[styles.fieldLabel, { color: colors.foreground, fontFamily: colors.fontFamily.sansMedium }]}>
              {t('Invite classmates (optional)')}
            </Text>
            {selectedInvitees.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {selectedInvitees.map((u) => (
                  <Pressable
                    key={u.id}
                    onPress={() => toggleInvitee(u)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 4,
                      backgroundColor: violet.surfacePressed, borderRadius: 999,
                      paddingHorizontal: 10, paddingVertical: 4,
                    }}
                  >
                    <Text style={{ color: violet.accentText, fontSize: 12, fontFamily: colors.fontFamily.sans }}>{u.name}</Text>
                    <Text style={{ color: violet.accentText, fontSize: 11 }}>✕</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <TextInput
              style={inputStyle}
              value={inviteeQuery}
              onChangeText={setInviteeQuery}
              placeholder="Search by name…"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
            />
            {filteredResults.length > 0 && (
              <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius, overflow: 'hidden' }}>
                {filteredResults.slice(0, 5).map((user, idx) => (
                  <Pressable
                    key={user.id}
                    onPress={() => { toggleInvitee(user); setInviteeQuery(''); }}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 10,
                      borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: colors.border,
                      backgroundColor: colors.card,
                    }}
                  >
                    <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: colors.fontFamily.sans }}>{user.name}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {debouncedQuery.length >= 1 && filteredResults.length === 0 && (
              <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: colors.fontFamily.sans }}>
                No classmates found for "{debouncedQuery}"
              </Text>
            )}
          </View>

          {/* Resource attachment */}
          <View style={{ gap: 8 }}>
            <Text style={[styles.fieldLabel, { color: colors.foreground, fontFamily: colors.fontFamily.sansMedium }]}>
              {t('Linked resource (optional)')}
            </Text>
            {selectedResource ? (
              <Pressable
                onPress={() => { setSelectedResource(null); setResourceQuery(''); }}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  backgroundColor: violet.surface, borderRadius: colors.radius,
                  paddingHorizontal: 12, paddingVertical: 8,
                }}
              >
                <Text style={{ color: violet.accentText, fontSize: 13, fontFamily: colors.fontFamily.sans, flex: 1 }} numberOfLines={1}>
                  📎 {selectedResource.title}
                </Text>
                <Text style={{ color: violet.accentText, fontSize: 12, marginLeft: 8 }}>✕ {t('Remove')}</Text>
              </Pressable>
            ) : (
              <>
                <TextInput
                  style={inputStyle}
                  value={resourceQuery}
                  onChangeText={setResourceQuery}
                  placeholder="Search your resources…"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                />
                {(resources ?? []).length > 0 && (
                  <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius, overflow: 'hidden' }}>
                    {(resources ?? []).slice(0, 5).map((r, idx) => (
                      <Pressable
                        key={r.id}
                        onPress={() => { setSelectedResource(r); setResourceQuery(''); }}
                        style={{
                          paddingHorizontal: 12, paddingVertical: 10,
                          borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: colors.border,
                          backgroundColor: colors.card,
                        }}
                      >
                        <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: colors.fontFamily.sans }} numberOfLines={1}>
                          {r.title}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        </ScrollView>

        <View style={[styles.sheetActions, { borderTopColor: colors.border, paddingTop: 12, paddingHorizontal: 20 }]}>
          <Pressable
            onPress={handleCreate}
            disabled={createSession.isPending}
            style={[styles.joinButton, { backgroundColor: violet.accent, borderRadius: colors.radius, opacity: createSession.isPending ? 0.6 : 1 }]}
          >
            <Text style={[styles.joinButtonText, { color: violet.onAccent, fontFamily: colors.fontFamily.sansSemiBold }]}>
              {createSession.isPending ? t('Creating…') : t('Create Session')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

type ListItem =
  | { type: 'block'; data: ScheduleBlock }
  | { type: 'session'; data: StudySessionWithParticipants };

export default function ScheduleScreen() {
  const { t, intlLocale } = useLanguage();
  const colors = useColors();
  const violet = sessionPalette(useColorScheme());
  const insets = useSafeAreaInsets();

  const monday = getMondayOfWeek(new Date());
  const weekStart = formatDateParam(monday);

  const [selectedDay, setSelectedDay] = useState(() => {
    const today = new Date();
    const todayDay = today.getDay();
    return todayDay === 0 ? 6 : todayDay - 1;
  });

  const [selectedSession, setSelectedSession] = useState<StudySessionWithParticipants | null>(null);
  const [createModalVisible, setCreateModalVisible] = useState(false);

  const {
    data: blocksData,
    isLoading: blocksLoading,
    isError: blocksError,
    error: blocksFailure,
    isFetching: blocksFetching,
    refetch: refetchBlocks,
  } = useListScheduleBlocks({ weekStart });
  const {
    data: sessionsData,
    isLoading: sessionsLoading,
    isError: sessionsError,
    refetch: refetchSessions,
  } = useListStudySessions();
  const rsvp = useRsvpStudySession();
  const queryClient = useQueryClient();

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });

  const selectedDateStr = formatDateParam(weekDates[selectedDay]);
  const blocksForDay = blocksData?.filter((b) => b.date === selectedDateStr) ?? [];
  const sessionsForDay = sessionsData?.filter((s) => {
    try {
      return formatDateParam(new Date(s.startsAt)) === selectedDateStr;
    } catch { return false; }
  }) ?? [];

  const listItems: ListItem[] = [
    ...blocksForDay.map((b) => ({ type: 'block' as const, data: b })),
    ...sessionsForDay.map((s) => ({ type: 'session' as const, data: s })),
  ];

  // Sort by time
  listItems.sort((a, b) => {
    const timeA = a.type === 'block' ? a.data.startTime : new Date(a.data.startsAt).toTimeString().slice(0, 5);
    const timeB = b.type === 'block' ? b.data.startTime : new Date(b.data.startsAt).toTimeString().slice(0, 5);
    return timeA.localeCompare(timeB);
  });

  // Pending sessions (not filtered by day)
  const pendingSessions = sessionsData?.filter((s) => s.myStatus === 'pending') ?? [];

  const isLoading = blocksLoading || sessionsLoading;

  /*
   * A week that could not be fetched is not a free week.
   *
   * With no signal this screen said "No events scheduled -- Nothing scheduled
   * for Wed", which is a claim about the person's own day and was untrue of
   * it. Worse than blank: somebody could reasonably re-add a block they
   * already have, or walk away believing they had nothing on.
   */
  const failed = (blocksError && blocksData === undefined) || (sessionsError && sessionsData === undefined);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchBlocks(), refetchSessions()]);
    setRefreshing(false);
  };

  async function handleRsvp(sessionId: number, status: 'accepted' | 'declined') {
    try {
      await rsvp.mutateAsync({ id: sessionId, data: { status } });
      await queryClient.invalidateQueries({ queryKey: getListStudySessionsQueryKey() });
    } catch {}
  }

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
            paddingTop: insets.top + webTopPad + 12,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: colors.fontFamily.sansBold }]}>
            {t('Schedule')}
          </Text>
          <Pressable
            onPress={() => setCreateModalVisible(true)}
            style={[styles.fabButton, { backgroundColor: violet.accent, borderRadius: colors.radius }]}
          >
            <Text style={[styles.fabText, { color: violet.onAccent, fontFamily: colors.fontFamily.sansSemiBold }]}>+ {t('Study Session')}</Text>
          </Pressable>
        </View>

        {/* Pending invitations pill */}
        {pendingSessions.length > 0 && (
          <Pressable
            onPress={() => setSelectedSession(pendingSessions[0])}
            style={[styles.pendingPill, { backgroundColor: violet.surfacePressed, borderColor: violet.border, borderRadius: colors.radius }]}
          >
            <Text style={[styles.pendingPillText, { color: violet.accentText, fontFamily: colors.fontFamily.sans }]}>
              👥 {pendingSessions.length} pending invitation{pendingSessions.length > 1 ? 's' : ''}
            </Text>
          </Pressable>
        )}

        {/* Day Selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayScroll}>
          {weekDates.map((date, i) => {
            const label = weekdayLabel(date, intlLocale);
            const dayNum = date.getDate();
            const isSelected = i === selectedDay;
            const isToday = formatDateParam(date) === formatDateParam(new Date());
            const hasSessions = (sessionsData?.some((s) => {
              try { return formatDateParam(new Date(s.startsAt)) === formatDateParam(date); } catch { return false; }
            }) ?? false);

            return (
              <Pressable
                key={i}
                onPress={() => setSelectedDay(i)}
                style={[
                  styles.dayPill,
                  {
                    backgroundColor: isSelected ? colors.primary : 'transparent',
                    borderColor: isSelected ? colors.primary : colors.border,
                    borderRadius: colors.radius,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.dayLabel,
                    {
                      color: isSelected ? colors.primaryForeground : isToday ? colors.primary : colors.mutedForeground,
                      fontFamily: isSelected ? colors.fontFamily.sansSemiBold : colors.fontFamily.sans,
                    },
                  ]}
                >
                  {label}
                </Text>
                <Text
                  style={[
                    styles.dayNum,
                    {
                      color: isSelected ? colors.primaryForeground : isToday ? colors.primary : colors.foreground,
                      fontFamily: isSelected ? colors.fontFamily.sansBold : colors.fontFamily.sans,
                    },
                  ]}
                >
                  {dayNum}
                </Text>
                {hasSessions && !isSelected && (
                  <View style={[styles.sessionDot, { backgroundColor: violet.accent }]} />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Blocks + Session List */}
      {isLoading ? (
        <View style={styles.listContent}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} width="100%" height={80} borderRadius={8} style={{ marginBottom: 10 }} />
          ))}
        </View>
      ) : failed ? (
        <ErrorState
          error={blocksFailure}
          retrying={blocksFetching}
          onRetry={() => {
            void refetchBlocks();
            void refetchSessions();
          }}
          style={{ paddingTop: 24 }}
        />
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={(item) => `${item.type}-${item.type === 'block' ? item.data.id : item.data.id}`}
          renderItem={({ item }) => {
            if (item.type === 'block') {
              return <BlockCard block={item.data} />;
            }
            return (
              <StudySessionCard
                session={item.data}
                onPress={() => setSelectedSession(item.data)}
              />
            );
          }}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <Empty
              icon="calendar"
              title={t('No events scheduled')}
              // The selected day is highlighted in the strip directly above,
              // so naming it here added nothing and cost the sentence its
              // translation -- an interpolated string has no dictionary key.
              description={t('Nothing scheduled for this day')}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Study session detail sheet */}
      <StudySessionDetailSheet
        session={selectedSession}
        visible={!!selectedSession}
        onClose={() => setSelectedSession(null)}
        onRsvp={handleRsvp}
        rsvpLoading={rsvp.isPending}
      />

      {/* Create session modal */}
      <CreateStudySessionModal
        visible={createModalVisible}
        onClose={() => setCreateModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 22, letterSpacing: -0.3 },
  fabButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  fabText: { fontSize: 13 },
  pendingPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  pendingPillText: { fontSize: 13 },
  dayScroll: { flexGrow: 0 },
  dayPill: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8,
    alignItems: 'center',
    minWidth: 52,
    position: 'relative',
  },
  dayLabel: { fontSize: 11 },
  dayNum: { fontSize: 17, lineHeight: 22 },
  sessionDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    position: 'absolute',
    bottom: 3,
    alignSelf: 'center',
  },
  listContent: { padding: 16, gap: 10 },
  blockCard: {
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: 14,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    marginBottom: 0,
  },
  blockTitle: { fontSize: 15 },
  blockTime: { fontSize: 13 },
  blockNotes: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sessionMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  collaborativeBadge: {
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  collaborativeBadgeText: { fontSize: 10 },
  participantCount: { fontSize: 11 },
  pendingBadge: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  pendingBadgeText: { fontSize: 10 },

  // Sheet styles
  sheetContainer: { flex: 1 },
  sheetHandle: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  sheetHandleBar: { width: 36, height: 4, borderRadius: 2 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetTitle: { fontSize: 18, lineHeight: 24 },
  closeButton: { padding: 4, marginTop: 2 },
  sheetActions: { borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
  },
  infoText: { fontSize: 14, lineHeight: 20, flex: 1 },
  meetingLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
  },
  joinLabel: { fontSize: 14 },
  meetingUrl: { fontSize: 12, marginTop: 2 },
  sectionLabel: { fontSize: 11, letterSpacing: 0.5 },
  participantRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  participantAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  participantName: { fontSize: 14 },
  statusBadge: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11 },
  joinButton: {
    paddingVertical: 13,
    alignItems: 'center',
  },
  joinButtonText: { fontSize: 15 },
  acceptButton: {
    paddingVertical: 11,
    alignItems: 'center',
  },
  acceptButtonText: { fontSize: 14 },
  declineButton: {
    borderWidth: 1,
    paddingVertical: 11,
    alignItems: 'center',
  },
  declineButtonText: { fontSize: 14 },

  // Create form
  textInput: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  fieldLabel: { fontSize: 13 },
  errorBox: { padding: 12 },
});
