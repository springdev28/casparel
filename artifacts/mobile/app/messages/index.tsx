/**
 * @fileOverview Mobile screen role: defines the Expo Router Index screen or route layout.
 * System connection: composed by Expo Router and backed by auth, onboarding, purchases, secure storage, and the shared API.
 */
/**
 * Conversations, newest first, with the message requests at the top.
 *
 * Messaging is the most phone-shaped thing in this product and the phone did
 * not have it, because the five direct-message endpoints were absent from
 * openapi.yaml and the app has no hand-written API layer -- so there was
 * nothing to call. See contractDescribesEveryRoute.test.ts.
 *
 * A request is separated from a conversation on purpose. Casparel lets a
 * stranger open a conversation with you and lets you refuse, so a screen that
 * mixed the two would put "somebody you have never met wants to message you"
 * in the same list as your class group, ordered by whichever happened last.
 * The requests sit in their own section and say who sent them.
 */
import React from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Skeleton } from '@workspace/edu-ds/components/native/skeleton';
import { Empty } from '@workspace/edu-ds/components/native/empty';
import { useListConversations } from '@workspace/api-client-react';
import type { Conversation } from '@workspace/api-client-react';
import { ErrorState } from '@/components/ErrorState';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * "14:32" today, "Tue" this week, "3 Mar" beyond it.
 *
 * A conversation list is read by glancing down the right-hand edge, so the
 * stamp has to be short enough not to push the name around, and each of the
 * three forms answers the question you are actually asking at that distance.
 */
function When({ at }: { at: string }) {
  const colors = useColors();
  const { intlLocale } = useLanguage();
  const date = new Date(at);
  const ageMs = Date.now() - date.getTime();
  const label =
    ageMs < 24 * 60 * 60 * 1000
      ? date.toLocaleTimeString(intlLocale, {
          hour: '2-digit',
          minute: '2-digit',
        })
      : ageMs < 7 * 24 * 60 * 60 * 1000
        ? date.toLocaleDateString(intlLocale, { weekday: 'short' })
        : date.toLocaleDateString(intlLocale, { day: 'numeric', month: 'short' });
  return (
    <Text
      style={[
        styles.when,
        { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
      ]}
    >
      {label}
    </Text>
  );
}

function Avatar({ name }: { name: string }) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.avatar,
        { backgroundColor: colors.primary + '1A', borderRadius: 21 },
      ]}
    >
      <Text
        style={[
          styles.avatarText,
          { color: colors.primary, fontFamily: colors.fontFamily.sansSemiBold },
        ]}
      >
        {name.slice(0, 2).toUpperCase()}
      </Text>
    </View>
  );
}

function Row({
  conversation,
  onPress,
}: {
  conversation: Conversation;
  onPress: () => void;
}) {
  const colors = useColors();
  const { t } = useLanguage();
  const unread = conversation.unreadCount > 0;
  const preview =
    conversation.lastMessage?.body ??
    (conversation.incomingRequest
      ? t('Wants to start a conversation')
      : t('No messages yet'));
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      /*
       * The name, then whether there is anything new. A list of these read as
       * "button, button, button" without it, and the unread count is the one
       * fact you are scanning for.
       */
      accessibilityLabel={
        unread
          ? `${conversation.other.name}, ${
              conversation.unreadCount === 1
                ? t('1 unread message')
                : `${conversation.unreadCount} ${t('unread messages')}`
            }`
          : conversation.other.name
      }
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Avatar name={conversation.other.name} />
      <View style={styles.rowText}>
        <View style={styles.rowTop}>
          <Text
            // A person's name is not the translation bridge's to rewrite, and
            // on this platform nothing rewrites it -- but it is still data,
            // and numberOfLines is what keeps a long one from pushing the
            // stamp off the row.
            style={[
              styles.name,
              {
                color: colors.foreground,
                fontFamily: unread
                  ? colors.fontFamily.sansSemiBold
                  : colors.fontFamily.sansMedium,
              },
            ]}
            numberOfLines={1}
          >
            {conversation.other.name}
          </Text>
          {conversation.lastMessage ? (
            <When at={conversation.lastMessage.createdAt} />
          ) : null}
        </View>
        <View style={styles.rowBottom}>
          <Text
            style={[
              styles.preview,
              {
                color: unread ? colors.foreground : colors.mutedForeground,
                fontFamily: colors.fontFamily.sans,
              },
            ]}
            numberOfLines={1}
          >
            {preview}
          </Text>
          {unread ? (
            <View style={[styles.unread, { backgroundColor: colors.primary }]}>
              <Text
                style={[
                  styles.unreadText,
                  {
                    color: colors.primaryForeground,
                    fontFamily: colors.fontFamily.sansSemiBold,
                  },
                ]}
              >
                {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function SectionHeading({ children }: { children: string }) {
  const colors = useColors();
  return (
    <Text
      style={[
        styles.heading,
        {
          color: colors.mutedForeground,
          fontFamily: colors.fontFamily.sansSemiBold,
        },
      ]}
    >
      {children}
    </Text>
  );
}

export default function MessagesScreen() {
  const { t } = useLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, isLoading, isError, error, isFetching, refetch } =
    useListConversations();

  const conversations = data ?? [];
  const requests = conversations.filter((item) => item.incomingRequest);
  const accepted = conversations.filter(
    (item) => !item.incomingRequest && item.status !== 'declined',
  );

  /*
   * One list, not two, so the whole screen scrolls as a unit and a long
   * conversation list does not scroll inside a short screen. The headings are
   * rows in it.
   */
  type Entry =
    | { kind: 'heading'; key: string; label: string }
    | { kind: 'conversation'; key: string; conversation: Conversation };
  const entries: Entry[] = [
    ...(requests.length
      ? [
          {
            kind: 'heading' as const,
            key: 'h-requests',
            label: t('Message requests'),
          },
          ...requests.map((conversation) => ({
            kind: 'conversation' as const,
            key: `r-${conversation.id}`,
            conversation,
          })),
        ]
      : []),
    ...(accepted.length
      ? [
          ...(requests.length
            ? [
                {
                  kind: 'heading' as const,
                  key: 'h-conversations',
                  label: t('Conversations'),
                },
              ]
            : []),
          ...accepted.map((conversation) => ({
            kind: 'conversation' as const,
            key: `c-${conversation.id}`,
            conversation,
          })),
        ]
      : []),
  ];

  if (isLoading) {
    return (
      <View style={[styles.flex, styles.padded, { backgroundColor: colors.background }]}>
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} width="100%" height={60} borderRadius={10} />
        ))}
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

  return (
    <FlatList
      style={[styles.flex, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.list,
        { paddingBottom: insets.bottom + 24 },
        entries.length ? null : styles.flex,
      ]}
      data={entries}
      keyExtractor={(entry) => entry.key}
      refreshControl={
        <RefreshControl
          refreshing={isFetching && !isLoading}
          onRefresh={() => {
            void refetch();
          }}
          tintColor={colors.mutedForeground}
        />
      }
      ListEmptyComponent={
        <Empty
          icon="message-circle"
          title={t('No conversations yet')}
          description={t(
            'Open a profile on the web to start a conversation, and it will appear here.',
          )}
        />
      }
      renderItem={({ item }) =>
        item.kind === 'heading' ? (
          <SectionHeading>{item.label}</SectionHeading>
        ) : (
          <Row
            conversation={item.conversation}
            onPress={() => router.push(`/messages/${item.conversation.id}`)}
          />
        )
      }
      ItemSeparatorComponent={() => (
        <View style={[styles.separator, { backgroundColor: colors.border }]} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  padded: { padding: 16, gap: 12 },
  list: { paddingHorizontal: 4, paddingTop: 8 },
  heading: {
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    // Above the 44pt touch target both stores ask for.
    minHeight: 68,
    paddingVertical: 10,
  },
  avatar: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15 },
  rowText: { flex: 1, gap: 3 },
  rowTop: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 15 },
  when: { fontSize: 12 },
  preview: { flex: 1, fontSize: 13 },
  unread: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: { fontSize: 11 },
  separator: { height: 1, marginLeft: 66 },
});
