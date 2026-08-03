import React, { useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Badge } from '@workspace/edu-ds/components/native/badge';
import { Empty } from '@workspace/edu-ds/components/native/empty';
import { Skeleton } from '@workspace/edu-ds/components/native/skeleton';
import { useListResources } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import type { Resource } from '@workspace/api-client-react';

const FORMAT_ICONS: Record<string, string> = {
  article: 'file-text',
  video: 'video',
  pdf: 'file',
  podcast: 'headphones',
  interactive: 'monitor',
  other: 'link',
};

function StarRating({ rating }: { rating: number }) {
  const colors = useColors();
  const stars = Math.round(rating);
  return (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Feather
          key={i}
          name="star"
          size={11}
          color={i <= stars ? colors.chart3 : colors.border}
        />
      ))}
    </View>
  );
}

function ResourceCard({ item, onPress }: { item: Resource; onPress: () => void }) {
  const colors = useColors();
  const formatIcon = FORMAT_ICONS[item.format] ?? 'link';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <View
          style={[
            styles.formatIcon,
            { backgroundColor: colors.primary + '15', borderRadius: colors.radius - 2 },
          ]}
        >
          <Feather name={formatIcon as never} size={16} color={colors.primary} />
        </View>
        <View style={styles.cardHeaderText}>
          <Text
            style={[
              styles.cardTitle,
              { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold },
            ]}
            numberOfLines={2}
          >
            {item.title}
          </Text>
          <View style={styles.badgeRow}>
            <Badge variant="default">{item.format}</Badge>
            <Badge variant="secondary">{item.subject}</Badge>
          </View>
        </View>
      </View>
      <View style={styles.cardFooter}>
        <Text
          style={[styles.gradeBadge, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}
        >
          {item.gradeLevel}
        </Text>
        <View style={styles.ratingRow}>
          <StarRating rating={item.avgRating} />
          <Text
            style={[
              styles.ratingText,
              { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
            ]}
          >
            ({item.reviewCount})
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function ResourceSkeleton() {
  const colors = useColors();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
      ]}
    >
      <View style={styles.cardHeader}>
        <Skeleton width={40} height={40} borderRadius={8} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width="80%" height={16} />
          <Skeleton width="50%" height={14} />
        </View>
      </View>
    </View>
  );
}

export default function ResourcesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const debounceRef = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleSearch = (text: string) => {
    setSearch(text);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(text), 400);
  };

  const { data, isLoading, refetch } = useListResources({
    q: debouncedSearch || undefined,
  });

  const [refreshing, setRefreshing] = React.useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const webTopPad = Platform.OS === 'web' ? 67 : 0;

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      {/* Search Bar */}
      <View
        style={[
          styles.searchContainer,
          {
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
            paddingTop: insets.top + webTopPad + 12,
          },
        ]}
      >
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: colors.muted,
              borderColor: colors.border,
              borderRadius: colors.radius,
            },
          ]}
        >
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            value={search}
            onChangeText={handleSearch}
            placeholder="Search resources…"
            placeholderTextColor={colors.mutedForeground}
            style={[
              styles.searchInput,
              { color: colors.foreground, fontFamily: colors.fontFamily.sans },
            ]}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => { setSearch(''); setDebouncedSearch(''); }}>
              <Feather name="x" size={15} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
        <Text
          style={[
            styles.sectionTitle,
            { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold },
          ]}
        >
          Resources
        </Text>
      </View>

      {isLoading ? (
        <FlatList
          data={[1, 2, 3, 4, 5]}
          keyExtractor={(item) => String(item)}
          renderItem={() => <ResourceSkeleton />}
          contentContainerStyle={styles.listContent}
          scrollEnabled={false}
        />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <ResourceCard
              item={item}
              onPress={() => router.push(`/resource/${item.id}`)}
            />
          )}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 80 },
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <Empty
              icon="book-open"
              title={debouncedSearch ? 'No results found' : 'No resources yet'}
              description={
                debouncedSearch
                  ? `Try a different search term`
                  : 'Resources will appear here once they are added'
              }
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
  searchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  sectionTitle: { fontSize: 22, letterSpacing: -0.3 },
  listContent: {
    padding: 16,
    gap: 10,
  },
  card: {
    borderWidth: 1,
    padding: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeader: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  formatIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardHeaderText: { flex: 1, gap: 6 },
  cardTitle: { fontSize: 15, lineHeight: 20 },
  badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  gradeBadge: { fontSize: 12 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stars: { flexDirection: 'row', gap: 2 },
  ratingText: { fontSize: 11 },
});
