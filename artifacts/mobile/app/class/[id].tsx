import React from 'react';
import {
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Badge } from '@workspace/edu-ds/components/native/badge';
import { Skeleton } from '@workspace/edu-ds/components/native/skeleton';
import { Empty } from '@workspace/edu-ds/components/native/empty';
import { useGetClass } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import type { ClassMember } from '@workspace/api-client-react';

function MemberRow({ member }: { member: ClassMember }) {
  const colors = useColors();
  const isTeacher = member.role === 'teacher';
  return (
    <View
      style={[
        styles.memberRow,
        { borderBottomColor: colors.border },
      ]}
    >
      <View
        style={[
          styles.avatar,
          {
            backgroundColor: isTeacher ? colors.primary + '20' : colors.accent + '15',
            borderRadius: 22,
          },
        ]}
      >
        <Text
          style={[
            styles.avatarText,
            {
              color: isTeacher ? colors.primary : colors.accent,
              fontFamily: colors.fontFamily.sansBold,
            },
          ]}
        >
          {member.user.name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.memberInfo}>
        <Text
          style={[
            styles.memberName,
            { color: colors.foreground, fontFamily: colors.fontFamily.sansMedium },
          ]}
        >
          {member.user.name}
        </Text>
        {member.user.gradeOrDept ? (
          <Text
            style={[
              styles.memberEmail,
              { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
            ]}
            numberOfLines={1}
          >
            {member.user.gradeOrDept}
          </Text>
        ) : null}
      </View>
      {isTeacher && (
        <Badge variant="default">Teacher</Badge>
      )}
    </View>
  );
}

export default function ClassDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const classId = parseInt(id, 10);

  const { data: cls, isLoading } = useGetClass(classId);

  const webBottomPad = Platform.OS === 'web' ? 34 : 0;

  if (isLoading) {
    return (
      <ScrollView
        style={[styles.flex, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
      >
        <Skeleton width="70%" height={26} />
        <Skeleton width="50%" height={18} style={{ marginTop: 8 }} />
        <Skeleton width="100%" height={80} borderRadius={12} style={{ marginTop: 20 }} />
      </ScrollView>
    );
  }

  if (!cls) {
    return <Empty icon="alert-circle" title="Class not found" />;
  }

  const teachers = cls.members.filter((m) => m.role === 'teacher');
  const students = cls.members.filter((m) => m.role === 'student');

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + webBottomPad + 32 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View
        style={[
          styles.hero,
          { backgroundColor: colors.accent, borderRadius: colors.radius },
        ]}
      >
        <View style={styles.heroInner}>
          <Text
            style={[
              styles.heroTitle,
              { color: colors.accentForeground, fontFamily: colors.fontFamily.sansBold },
            ]}
          >
            {cls.name}
          </Text>
          <View style={styles.heroBadges}>
            <Badge variant="outline" style={{ borderColor: colors.accentForeground + '60' }}>
              {cls.subject}
            </Badge>
            <Badge variant="outline" style={{ borderColor: colors.accentForeground + '60' }}>
              {cls.gradeLevel}
            </Badge>
          </View>
          {cls.description ? (
            <Text
              style={[
                styles.heroDesc,
                { color: colors.accentForeground + 'CC', fontFamily: colors.fontFamily.sans },
              ]}
              numberOfLines={3}
            >
              {cls.description}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Stats */}
      <View
        style={[
          styles.statsRow,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderRadius: colors.radius,
          },
        ]}
      >
        <View style={styles.statItem}>
          <Text
            style={[
              styles.statNum,
              { color: colors.foreground, fontFamily: colors.fontFamily.sansBold },
            ]}
          >
            {teachers.length}
          </Text>
          <Text
            style={[
              styles.statLabel,
              { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
            ]}
          >
            Teacher{teachers.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text
            style={[
              styles.statNum,
              { color: colors.foreground, fontFamily: colors.fontFamily.sansBold },
            ]}
          >
            {students.length}
          </Text>
          <Text
            style={[
              styles.statLabel,
              { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
            ]}
          >
            Student{students.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text
            style={[
              styles.statNum,
              { color: colors.foreground, fontFamily: colors.fontFamily.sansBold },
            ]}
          >
            {cls.memberCount ?? cls.members.length}
          </Text>
          <Text
            style={[
              styles.statLabel,
              { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
            ]}
          >
            Total
          </Text>
        </View>
      </View>

      {/* Members */}
      <View style={styles.section}>
        <Text
          style={[
            styles.sectionTitle,
            { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold },
          ]}
        >
          Members
        </Text>

        {cls.members.length === 0 ? (
          <Empty icon="users" title="No members yet" />
        ) : (
          <View
            style={[
              styles.membersList,
              { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
            ]}
          >
            {[...teachers, ...students].map((member) => (
              <MemberRow key={`${member.userId}-${member.classId}`} member={member} />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 12 },
  hero: { overflow: 'hidden' },
  heroInner: { padding: 20, gap: 10 },
  heroTitle: { fontSize: 22, letterSpacing: -0.3, lineHeight: 28 },
  heroBadges: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  heroDesc: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  statsRow: {
    flexDirection: 'row',
    borderWidth: 1,
    padding: 16,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 3 },
  statNum: { fontSize: 24, letterSpacing: -0.5 },
  statLabel: { fontSize: 11 },
  statDivider: { width: 1, marginHorizontal: 8 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 16 },
  membersList: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 16 },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 14 },
  memberEmail: { fontSize: 12, marginTop: 1 },
});
