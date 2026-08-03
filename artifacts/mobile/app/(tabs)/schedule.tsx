import React, { useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Empty } from '@workspace/edu-ds/components/native/empty';
import { Skeleton } from '@workspace/edu-ds/components/native/skeleton';
import { useListScheduleBlocks } from '@workspace/api-client-react';
import type { ScheduleBlock } from '@workspace/api-client-react';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const dayOfWeek = d.getDay(); // 0 = Sunday
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

function formatTime(time: string): string {
  // time is HH:MM or HH:MM:SS
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m} ${ampm}`;
}

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
        style={[
          styles.blockTitle,
          { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold },
        ]}
        numberOfLines={2}
      >
        {block.title}
      </Text>
      <Text
        style={[
          styles.blockTime,
          { color: colors.accent, fontFamily: colors.fontFamily.sansMedium },
        ]}
      >
        {formatTime(block.startTime)} – {formatTime(block.endTime)}
      </Text>
      {block.notes ? (
        <Text
          style={[
            styles.blockNotes,
            { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
          ]}
          numberOfLines={2}
        >
          {block.notes}
        </Text>
      ) : null}
    </View>
  );
}

export default function ScheduleScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const monday = getMondayOfWeek(new Date());
  const weekStart = formatDateParam(monday);

  const [selectedDay, setSelectedDay] = useState(() => {
    const today = new Date();
    const todayDay = today.getDay();
    return todayDay === 0 ? 6 : todayDay - 1; // 0=Mon, 6=Sun
  });

  const { data, isLoading, refetch } = useListScheduleBlocks({ weekStart });

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });

  const selectedDateStr = formatDateParam(weekDates[selectedDay]);
  const blocksForDay = data?.filter((b) => b.date === selectedDateStr) ?? [];

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

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
        <Text
          style={[
            styles.headerTitle,
            { color: colors.foreground, fontFamily: colors.fontFamily.sansBold },
          ]}
        >
          Schedule
        </Text>

        {/* Day Selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayScroll}>
          {DAY_LABELS.map((label, i) => {
            const date = weekDates[i];
            const dayNum = date.getDate();
            const isSelected = i === selectedDay;
            const isToday = formatDateParam(date) === formatDateParam(new Date());

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
                      color: isSelected
                        ? colors.primaryForeground
                        : isToday
                        ? colors.primary
                        : colors.mutedForeground,
                      fontFamily: isSelected
                        ? colors.fontFamily.sansSemiBold
                        : colors.fontFamily.sans,
                    },
                  ]}
                >
                  {label}
                </Text>
                <Text
                  style={[
                    styles.dayNum,
                    {
                      color: isSelected
                        ? colors.primaryForeground
                        : isToday
                        ? colors.primary
                        : colors.foreground,
                      fontFamily: isSelected
                        ? colors.fontFamily.sansBold
                        : colors.fontFamily.sans,
                    },
                  ]}
                >
                  {dayNum}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Blocks List */}
      {isLoading ? (
        <View style={styles.listContent}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} width="100%" height={80} borderRadius={8} style={{ marginBottom: 10 }} />
          ))}
        </View>
      ) : (
        <FlatList
          data={blocksForDay}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <BlockCard block={item} />}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 80 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <Empty
              icon="calendar"
              title="No blocks scheduled"
              description={`Nothing scheduled for ${DAY_LABELS[selectedDay]}`}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  headerTitle: { fontSize: 22, letterSpacing: -0.3 },
  dayScroll: { flexGrow: 0 },
  dayPill: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8,
    alignItems: 'center',
    minWidth: 52,
  },
  dayLabel: { fontSize: 11 },
  dayNum: { fontSize: 17, lineHeight: 22 },
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
  },
  blockTitle: { fontSize: 15 },
  blockTime: { fontSize: 13 },
  blockNotes: { fontSize: 12, lineHeight: 17, marginTop: 2 },
});
