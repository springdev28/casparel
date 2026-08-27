/**
 * @fileOverview Mobile screen role: defines the Expo Router Id screen or route layout.
 * System connection: composed by Expo Router and backed by auth, onboarding, purchases, secure storage, and the shared API.
 */
/**
 * One conversation: what was said, and a box to say something back.
 *
 * Two things here are not obvious from the endpoint list.
 *
 * Reading marks messages read. GET /direct-messages/conversations/{id} clears
 * the other person's unread flags as a side effect, so it is not a request to
 * repeat on a timer -- this screen fetches when you open it and when you pull
 * down, and never in the background.
 *
 * A pending request is a different screen from a conversation. If somebody
 * asked to message you, the composer is replaced by Accept and Decline,
 * because sending a reply is not something you can do yet and a disabled text
 * box says that far less clearly than the two buttons do. If *you* asked, you
 * get one message and then wait, which is what the server enforces, so the
 * composer says so rather than letting you write into a 403.
 */
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Skeleton } from '@workspace/edu-ds/components/native/skeleton';
import {
  getGetConversationQueryKey,
  getGetUserSafetyStatusQueryKey,
  getListConversationsQueryKey,
  ReportUserInputReason,
  useAnswerConversationRequest,
  useBlockUser,
  useGetConversation,
  useGetUserSafetyStatus,
  useReportUser,
  useSendMessage,
  useUnblockUser,
} from '@workspace/api-client-react';
import type { DirectMessage } from '@workspace/api-client-react';
import { ErrorState } from '@/components/ErrorState';
import { describeApiFailure } from '@/utils/api-failure';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

function Bubble({ message, mine }: { message: DirectMessage; mine: boolean }) {
  const colors = useColors();
  const { intlLocale } = useLanguage();
  return (
    <View style={[styles.bubbleRow, mine ? styles.mineRow : styles.theirsRow]}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: mine ? colors.primary : colors.card,
            borderColor: mine ? colors.primary : colors.border,
            borderRadius: 16,
          },
        ]}
      >
        <Text
          style={[
            styles.bubbleText,
            {
              color: mine ? colors.primaryForeground : colors.foreground,
              fontFamily: colors.fontFamily.sans,
            },
          ]}
        >
          {message.body}
        </Text>
        <Text
          style={[
            styles.bubbleWhen,
            {
              color: mine ? colors.primaryForeground : colors.mutedForeground,
              fontFamily: colors.fontFamily.sans,
              opacity: mine ? 0.75 : 1,
            },
          ]}
        >
          {new Date(message.createdAt).toLocaleTimeString(intlLocale, {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
    </View>
  );
}

/** A day heading between bubbles, so a long thread has somewhere to hold on. */
function DayMark({ at }: { at: string }) {
  const colors = useColors();
  const { intlLocale } = useLanguage();
  return (
    <Text
      style={[
        styles.day,
        { color: colors.mutedForeground, fontFamily: colors.fontFamily.sansMedium },
      ]}
    >
      {new Date(at).toLocaleDateString(intlLocale, {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
      })}
    </Text>
  );
}

export default function ConversationScreen() {
  const { t } = useLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = Number(id);

  const { data, isLoading, isError, error, isFetching, refetch } =
    useGetConversation(conversationId, {
      query: {
        queryKey: getGetConversationQueryKey(conversationId),
        enabled: Number.isFinite(conversationId),
      },
    });

  const [draft, setDraft] = React.useState('');
  const [failure, setFailure] = React.useState<string | null>(null);
  const [reportOpen, setReportOpen] = React.useState(false);
  const [reportReason, setReportReason] = React.useState<ReportUserInputReason>(
    ReportUserInputReason.unsafe_content,
  );
  const [reportDetails, setReportDetails] = React.useState('');
  const otherUserId = data?.other.id ?? 0;
  const safety = useGetUserSafetyStatus(otherUserId, {
    query: {
      enabled: otherUserId > 0,
      queryKey: getGetUserSafetyStatusQueryKey(otherUserId),
    },
  });
  const blockUser = useBlockUser();
  const unblockUser = useUnblockUser();
  const reportUser = useReportUser();

  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: getGetConversationQueryKey(conversationId),
    });
    // The list carries the unread count and the last message, both of which
    // this screen has just changed.
    void queryClient.invalidateQueries({
      queryKey: getListConversationsQueryKey(),
    });
  };

  const send = useSendMessage({
    mutation: {
      onSuccess: () => {
        setDraft('');
        setFailure(null);
        refresh();
      },
      onError: (sendError) =>
        setFailure(describeApiFailure(sendError, t('Could not send that.'), t)),
    },
  });
  const answer = useAnswerConversationRequest({
    mutation: {
      onSuccess: () => {
        setFailure(null);
        refresh();
      },
      onError: (answerError) =>
        setFailure(
          describeApiFailure(answerError, t('Could not answer that request.'), t),
        ),
    },
  });

  const refreshSafety = () =>
    queryClient.invalidateQueries({
      queryKey: getGetUserSafetyStatusQueryKey(otherUserId),
    });

  const toggleBlock = () => {
    if (!otherUserId) return;
    if (safety.data?.blocked) {
      void unblockUser.mutateAsync({ id: otherUserId }).then(async () => {
        await refreshSafety();
        Alert.alert(t('User unblocked'), t('You can exchange messages with this user again.'));
      }).catch((blockError) => {
        Alert.alert(
          t('Could not unblock user'),
          describeApiFailure(blockError, t('Please try again.'), t),
        );
      });
      return;
    }
    Alert.alert(
      t('Block this user?'),
      t('They will no longer be able to message you or collaborate with you.'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Block user'),
          style: 'destructive',
          onPress: () => {
            void blockUser.mutateAsync({ id: otherUserId }).then(async () => {
              await refreshSafety();
              refresh();
              Alert.alert(t('User blocked'));
            }).catch((blockError) => {
              Alert.alert(
                t('Could not block user'),
                describeApiFailure(blockError, t('Please try again.'), t),
              );
            });
          },
        },
      ],
    );
  };

  const submitReport = async () => {
    if (!otherUserId) return;
    try {
      const context = t('Reported from a direct-message conversation.');
      const details = [context, reportDetails.trim()].filter(Boolean).join(' ').slice(0, 1000);
      await reportUser.mutateAsync({
        id: otherUserId,
        data: { reason: reportReason, details },
      });
      setReportDetails('');
      setReportOpen(false);
      Alert.alert(
        t('Report received'),
        t('Thanks. This was submitted privately for moderation review.'),
      );
    } catch (reportError) {
      Alert.alert(
        t('Could not submit report'),
        describeApiFailure(reportError, t('Please try again.'), t),
      );
    }
  };

  // The other person's name is the title, which is what a thread is called
  // everywhere else on a phone.
  React.useEffect(() => {
    if (data?.other.name) navigation.setOptions({ title: data.other.name });
  }, [data?.other.name, navigation]);

  if (isLoading) {
    return (
      <View style={[styles.flex, styles.padded, { backgroundColor: colors.background }]}>
        <Skeleton width="70%" height={44} borderRadius={16} />
        <Skeleton width="55%" height={44} borderRadius={16} style={{ alignSelf: 'flex-end' }} />
        <Skeleton width="65%" height={44} borderRadius={16} />
      </View>
    );
  }

  if (isError && data === undefined) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
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

  if (!data) return null;

  const messages = data.messages ?? [];
  // A day heading goes before the first message of each day.
  const dayOf = (at: string) => new Date(at).toDateString();
  type Entry =
    | { kind: 'day'; key: string; at: string }
    | { kind: 'message'; key: string; message: DirectMessage };
  const entries: Entry[] = [];
  let lastDay = '';
  for (const message of messages) {
    const day = dayOf(message.createdAt);
    if (day !== lastDay) {
      entries.push({ kind: 'day', key: `d-${day}`, at: message.createdAt });
      lastDay = day;
    }
    entries.push({ kind: 'message', key: `m-${message.id}`, message });
  }

  const waitingOnThem =
    data.status === 'pending' && !data.incomingRequest;
  const canSend = data.status === 'accepted' || (waitingOnThem && !messages.length);

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 96 : 0}
    >
      <View style={[styles.safetyBar, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => setReportOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityLabel={t('Report privately')}
          style={styles.safetyAction}
        >
          <Feather name="flag" size={15} color={colors.mutedForeground} />
          <Text style={[styles.safetyActionText, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sansMedium }]}>
            {t('Report privately')}
          </Text>
        </Pressable>
        <Pressable
          onPress={toggleBlock}
          disabled={blockUser.isPending || unblockUser.isPending || safety.isLoading}
          accessibilityRole="button"
          accessibilityLabel={safety.data?.blocked ? t('Unblock user') : t('Block user')}
          style={styles.safetyAction}
        >
          <Feather name={safety.data?.blocked ? 'user-check' : 'user-x'} size={15} color={colors.destructiveText} />
          <Text style={[styles.safetyActionText, { color: colors.destructiveText, fontFamily: colors.fontFamily.sansMedium }]}>
            {safety.data?.blocked ? t('Unblock user') : t('Block user')}
          </Text>
        </Pressable>
      </View>

      {reportOpen ? (
        <View style={[styles.reportPanel, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Text style={[styles.reportTitle, { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }]}>
            {t('Why are you reporting this user?')}
          </Text>
          <View style={styles.reasonRow}>
            {([
              [ReportUserInputReason.spam, t('Spam')],
              [ReportUserInputReason.harassment, t('Harassment')],
              [ReportUserInputReason.impersonation, t('Impersonation')],
              [ReportUserInputReason.unsafe_content, t('Unsafe content')],
              [ReportUserInputReason.other, t('Other')],
            ] as const).map(([reason, label]) => (
              <Pressable
                key={reason}
                onPress={() => setReportReason(reason)}
                style={[
                  styles.reasonChip,
                  {
                    backgroundColor: reportReason === reason ? colors.primary : colors.background,
                    borderColor: reportReason === reason ? colors.primary : colors.border,
                    borderRadius: 999,
                  },
                ]}
              >
                <Text style={{ color: reportReason === reason ? colors.primaryForeground : colors.foreground, fontFamily: colors.fontFamily.sans, fontSize: 12 }}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={reportDetails}
            onChangeText={setReportDetails}
            placeholder={t('Optional details for the moderation team…')}
            placeholderTextColor={colors.mutedForeground}
            maxLength={900}
            multiline
            style={[styles.reportInput, { color: colors.foreground, borderColor: colors.border, borderRadius: colors.radius, fontFamily: colors.fontFamily.sans }]}
          />
          <View style={styles.reportButtons}>
            <Pressable onPress={() => setReportOpen(false)} style={styles.reportButton}>
              <Text style={{ color: colors.mutedForeground, fontFamily: colors.fontFamily.sansMedium }}>{t('Cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={() => void submitReport()}
              disabled={reportUser.isPending}
              style={[styles.reportButton, { backgroundColor: colors.primary, borderRadius: colors.radius, opacity: reportUser.isPending ? 0.6 : 1 }]}
            >
              {reportUser.isPending ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={{ color: colors.primaryForeground, fontFamily: colors.fontFamily.sansMedium }}>{t('Submit report')}</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}

      <FlatList
        style={styles.flex}
        contentContainerStyle={styles.thread}
        data={entries}
        keyExtractor={(entry) => entry.key}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={() => {
              void refetch();
            }}
            tintColor={colors.mutedForeground}
          />
        }
        renderItem={({ item }) =>
          item.kind === 'day' ? (
            <DayMark at={item.at} />
          ) : (
            <Bubble
              message={item.message}
              mine={item.message.senderId === user?.id}
            />
          )
        }
      />

      {failure ? (
        <Text
          style={[
            styles.failure,
            {
              color: colors.destructiveText,
              fontFamily: colors.fontFamily.sans,
            },
          ]}
        >
          {failure}
        </Text>
      ) : null}

      {safety.data?.blocked ? (
        <View
          style={[
            styles.footer,
            { borderTopColor: colors.border, paddingBottom: insets.bottom + 10 },
          ]}
        >
          <Text style={[styles.requestNote, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
            {t('This user is blocked. Unblock them to send messages.')}
          </Text>
        </View>
      ) : data.incomingRequest ? (
        <View
          style={[
            styles.footer,
            { borderTopColor: colors.border, paddingBottom: insets.bottom + 10 },
          ]}
        >
          <Text
            style={[
              styles.requestNote,
              {
                color: colors.mutedForeground,
                fontFamily: colors.fontFamily.sans,
              },
            ]}
          >
            {t('This person would like to start a conversation with you.')}
          </Text>
          <View style={styles.requestButtons}>
            <Pressable
              onPress={() =>
                answer.mutate({ id: conversationId, data: { action: 'decline' } })
              }
              disabled={answer.isPending}
              accessibilityRole="button"
              accessibilityLabel={t('Decline')}
              style={[
                styles.requestButton,
                { borderColor: colors.border, borderRadius: colors.radius },
              ]}
            >
              <Text
                style={[
                  styles.requestButtonText,
                  {
                    color: colors.foreground,
                    fontFamily: colors.fontFamily.sansMedium,
                  },
                ]}
              >
                {t('Decline')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() =>
                answer.mutate({ id: conversationId, data: { action: 'accept' } })
              }
              disabled={answer.isPending}
              accessibilityRole="button"
              accessibilityLabel={t('Accept')}
              style={[
                styles.requestButton,
                styles.requestPrimary,
                {
                  backgroundColor: colors.primary,
                  borderColor: colors.primary,
                  borderRadius: colors.radius,
                },
              ]}
            >
              {answer.isPending ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text
                  style={[
                    styles.requestButtonText,
                    {
                      color: colors.primaryForeground,
                      fontFamily: colors.fontFamily.sansMedium,
                    },
                  ]}
                >
                  {t('Accept')}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : (
        <View
          style={[
            styles.footer,
            { borderTopColor: colors.border, paddingBottom: insets.bottom + 10 },
          ]}
        >
          {canSend ? (
            <View style={styles.composer}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={t('Message')}
                placeholderTextColor={colors.mutedForeground}
                accessibilityLabel={t('Message')}
                multiline
                maxLength={4000}
                style={[
                  styles.input,
                  {
                    color: colors.foreground,
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    borderRadius: colors.radius,
                    fontFamily: colors.fontFamily.sans,
                  },
                ]}
              />
              <Pressable
                onPress={() =>
                  send.mutate({
                    id: conversationId,
                    data: { body: draft.trim() },
                  })
                }
                disabled={!draft.trim() || send.isPending}
                accessibilityRole="button"
                accessibilityLabel={t('Send')}
                accessibilityState={{ disabled: !draft.trim() || send.isPending }}
                style={[
                  styles.send,
                  {
                    backgroundColor: colors.primary,
                    borderRadius: 22,
                    opacity: !draft.trim() || send.isPending ? 0.4 : 1,
                  },
                ]}
              >
                {send.isPending ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Feather name="send" size={18} color={colors.primaryForeground} />
                )}
              </Pressable>
            </View>
          ) : (
            <Text
              style={[
                styles.requestNote,
                {
                  color: colors.mutedForeground,
                  fontFamily: colors.fontFamily.sans,
                },
              ]}
            >
              {data.status === 'declined'
                ? t('This conversation was declined.')
                : t('Waiting for this request to be accepted.')}
            </Text>
          )}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  padded: { padding: 16, gap: 12 },
  thread: { padding: 12, gap: 6 },
  day: { fontSize: 12, textAlign: 'center', marginVertical: 10 },
  bubbleRow: { flexDirection: 'row' },
  mineRow: { justifyContent: 'flex-end' },
  theirsRow: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '82%',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 3,
  },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleWhen: { fontSize: 10, alignSelf: 'flex-end' },
  failure: { fontSize: 13, paddingHorizontal: 14, paddingBottom: 6 },
  safetyBar: {
    minHeight: 44,
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 18,
  },
  safetyAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  safetyActionText: { fontSize: 12 },
  reportPanel: { borderBottomWidth: 1, padding: 14, gap: 10 },
  reportTitle: { fontSize: 14 },
  reasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  reasonChip: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  reportInput: { borderWidth: 1, minHeight: 72, padding: 10, fontSize: 13, textAlignVertical: 'top' },
  reportButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  reportButton: { minHeight: 40, minWidth: 104, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  footer: { borderTopWidth: 1, paddingHorizontal: 12, paddingTop: 10, gap: 10 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    maxHeight: 120,
    // A single line still clears the 44pt touch target.
    minHeight: 44,
  },
  send: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  requestNote: { fontSize: 13, textAlign: 'center' },
  requestButtons: { flexDirection: 'row', gap: 10 },
  requestButton: {
    flex: 1,
    borderWidth: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestPrimary: {},
  requestButtonText: { fontSize: 15 },
});
