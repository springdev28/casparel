/**
 * The way into messages, and the only place the app says you have any.
 *
 * Not a sixth tab: iOS collapses a tab bar of six into five and a "More"
 * list, which would bury either this or something already there. An icon in
 * the dashboard header is where a phone puts this anyway, and it is on the
 * first screen after sign-in.
 *
 * It carries its own query rather than taking a count as a prop, because the
 * dashboard has no other reason to know about conversations and the badge has
 * to be right the moment the screen appears. React Query dedupes it against
 * the list screen's identical fetch, so opening messages does not re-request.
 *
 * A failure is silent. Not knowing whether there are unread messages is a
 * reason to show the icon without a badge, not a reason to put an error on
 * somebody's dashboard.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { useListConversations } from '@workspace/api-client-react';
import { useLanguage } from '@/contexts/LanguageContext';

export function MessagesButton() {
  const colors = useColors();
  const router = useRouter();
  const { t } = useLanguage();
  const { data } = useListConversations();

  const unread = (data ?? []).reduce(
    (total, conversation) => total + conversation.unreadCount,
    0,
  );
  const requests = (data ?? []).filter((c) => c.incomingRequest).length;
  // A request has nothing unread in it until it is accepted, and it is still
  // something waiting for you.
  const waiting = unread + requests;

  return (
    <Pressable
      onPress={() => router.push('/messages')}
      accessibilityRole="button"
      /*
       * A bare adjective is not a dictionary key: "3 unread" needs a noun to
       * agree with in the languages this ships in, and the badge counts message
       * requests as well as unread messages, so the noun is the conversation
       * rather than the message.
       */
      accessibilityLabel={
        waiting
          ? `${t('Messages')}, ${
              waiting === 1
                ? t('1 conversation needs attention')
                : `${waiting} ${t('conversations need attention')}`
            }`
          : t('Messages')
      }
      hitSlop={8}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Feather name="message-circle" size={19} color={colors.foreground} />
      {waiting ? (
        <View
          style={[
            styles.badge,
            { backgroundColor: colors.primary, borderColor: colors.background },
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              {
                color: colors.primaryForeground,
                fontFamily: colors.fontFamily.sansSemiBold,
              },
            ]}
          >
            {waiting > 9 ? '9+' : waiting}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    borderWidth: 2,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10 },
});
