/**
 * @fileOverview Mobile screen role: defines the Expo Router Resources screen or route layout.
 * System connection: composed by Expo Router and backed by auth, onboarding, purchases, secure storage, and the shared API.
 */
import React, { useState } from 'react';
import {
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Badge } from '@workspace/edu-ds/components/native/badge';
import { Empty } from '@workspace/edu-ds/components/native/empty';
import { Skeleton } from '@workspace/edu-ds/components/native/skeleton';
import {
  getGetUserPreferencesQueryKey,
  getListResourcesQueryKey,
  useGetUserPreferences,
  useListResources,
  useUpdateUserPreferences,
  type UserPreferences,
} from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import type { Resource } from '@workspace/api-client-react';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { ErrorState } from '@/components/ErrorState';
import { storage } from '@/utils/secure-storage';
import {
  MOBILE_RESOURCE_SEARCH_STORAGE_KEY,
  mergeMobileResourceQuery,
  mobileResourceQuery,
  storedMobileResourceQuery,
} from '@/utils/resource-search-state';
import { mobileOnboardingLearningNeed } from '@/utils/onboarding-state';

function getYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0];
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return v;
      const m = u.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/);
      if (m) return m[1];
    }
    return null;
  } catch { return null; }
}

function isVimeoUrl(url: string): boolean {
  try {
    return new URL(url).hostname.includes('vimeo.com');
  } catch { return false; }
}

function isLoomUrl(url: string): boolean {
  try {
    return new URL(url).hostname.includes('loom.com');
  } catch { return false; }
}

/** Server-side OEmbed proxy, avoids CORS and third-party rate-limit failures. */
function useOembedThumbnail(url: string, enabled: boolean) {
  return useQuery<string | null>({
    queryKey: ['oembed-thumbnail', url],
    queryFn: async () => {
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      const baseUrl = domain ? `https://${domain}` : '';
      const res = await fetch(`${baseUrl}/api/resources/oembed?url=${encodeURIComponent(url)}`);
      if (!res.ok) return null;
      const data = await res.json() as { thumbnailUrl: string | null };
      return data.thumbnailUrl ?? null;
    },
    enabled,
    staleTime: 1000 * 60 * 60, // 1 hour, thumbnail URLs don't change
    retry: false,
  });
}

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
  const [failedThumb, setFailedThumb] = React.useState<string | null>(null);
  const formatIcon = FORMAT_ICONS[item.format] ?? 'link';

  const ytId = getYouTubeId(item.url);
  const needsOembed = !ytId && (isVimeoUrl(item.url) || isLoomUrl(item.url));
  const { data: oembedThumb } = useOembedThumbnail(item.url, needsOembed);
  const thumb = ytId
    ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`
    : oembedThumb ?? (item.thumbnailUrl ?? null);
  const showThumb = !!thumb && thumb !== failedThumb;

  return (
    <AnimatedPressable
      onPress={onPress}
      haptic="selection"
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      {showThumb ? (
        <View style={[styles.thumbnail, { borderRadius: colors.radius - 2 }]}>
          <Image
            source={{ uri: thumb! }}
            style={styles.thumbnailImage}
            resizeMode="cover"
            onError={() => setFailedThumb(thumb)}
          />
        </View>
      ) : null}
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
            {item.verificationStatus === 'unverified' ? (
              <View style={[styles.verifyChip, { borderColor: colors.chart3 + '66', backgroundColor: colors.chart3 + '1A' }]}>
                <Feather name="shield" size={10} color={colors.chart3} />
                <Text style={[styles.verifyChipText, { color: colors.chart3, fontFamily: colors.fontFamily.sansSemiBold }]}>
                  Pending review
                </Text>
              </View>
            ) : item.verificationStatus === 'rejected' ? (
              <View style={[styles.verifyChip, { borderColor: colors.destructive + '66', backgroundColor: colors.destructive + '1A' }]}>
                <Feather name="shield-off" size={10} color={colors.destructiveText} />
                <Text style={[styles.verifyChipText, { color: colors.destructiveText, fontFamily: colors.fontFamily.sansSemiBold }]}>
                  Not approved
                </Text>
              </View>
            ) : null}
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
    </AnimatedPressable>
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
  const routeParams = useLocalSearchParams<{ onboarding?: string; goal?: string }>();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchHydration, setSearchHydration] = useState<'checking-local' | 'waiting-server' | 'ready'>('checking-local');
  const [syncError, setSyncError] = useState('');
  const preferencesQuery = useGetUserPreferences();
  const updatePreferences = useUpdateUserPreferences();
  const preferencesRef = React.useRef<UserPreferences | null>(null);
  const syncInFlightRef = React.useRef(false);
  const pendingSyncRef = React.useRef<string | null>(null);
  const onboardingGoal = mobileOnboardingLearningNeed(
    routeParams.onboarding === '1' ? routeParams.goal : null,
  );

  React.useEffect(() => {
    if (!onboardingGoal) return;
    // Tabs may stay mounted while onboarding temporarily owns the root route.
    // The explicit route intent makes the handoff update in-memory Search as
    // well as the device snapshot written before navigation.
    setSearch(onboardingGoal);
    setDebouncedSearch(onboardingGoal);
    setSearchHydration('ready');
  }, [onboardingGoal]);

  React.useEffect(() => {
    if (!preferencesQuery.data) return;
    preferencesRef.current = preferencesQuery.data;
    if (pendingSyncRef.current !== null) void flushPreferenceSync();
  }, [preferencesQuery.data]);

  React.useEffect(() => {
    let active = true;
    void storage.getItemAsync(MOBILE_RESOURCE_SEARCH_STORAGE_KEY).then((value) => {
      if (!active) return;
      const restored = storedMobileResourceQuery(value);
      if (restored !== null) {
        setSearch(restored);
        setDebouncedSearch(restored);
        setSearchHydration('ready');
      } else {
        setSearchHydration('waiting-server');
      }
    });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (searchHydration !== 'waiting-server' || preferencesQuery.isLoading) return;
    const restored = mobileResourceQuery(preferencesQuery.data?.resourceSearchState) ?? '';
    setSearch(restored);
    setDebouncedSearch(restored);
    setSearchHydration('ready');
  }, [preferencesQuery.data, preferencesQuery.isLoading, searchHydration]);

  async function flushPreferenceSync() {
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    try {
      while (pendingSyncRef.current !== null) {
        const query = pendingSyncRef.current;
        pendingSyncRef.current = null;
        const updated = await updatePreferences.mutateAsync({
          data: {
            resourceSearchState: mergeMobileResourceQuery(
              preferencesRef.current?.resourceSearchState,
              query,
            ),
          },
        });
        preferencesRef.current = updated;
        queryClient.setQueryData(getGetUserPreferencesQueryKey(), updated);
      }
      setSyncError('');
    } catch {
      // Retain the latest desired value so the visible Retry action can safely
      // continue the serialized queue without losing local restoration.
      if (pendingSyncRef.current === null) pendingSyncRef.current = debouncedSearch;
      setSyncError('Search is saved on this device, but account sync failed.');
    } finally {
      syncInFlightRef.current = false;
    }
  }

  async function retryPreferenceSync() {
    if (!preferencesRef.current) {
      const refreshed = await preferencesQuery.refetch();
      if (!refreshed.data) {
        setSyncError('Search is saved on this device, but account sync failed.');
        return;
      }
      preferencesRef.current = refreshed.data;
    }
    await flushPreferenceSync();
  }

  const debounceRef = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleSearch = (text: string) => {
    setSearch(text);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(text), 400);
  };

  React.useEffect(() => () => clearTimeout(debounceRef.current), []);

  React.useEffect(() => {
    if (searchHydration !== 'ready') return;
    const nextState = mergeMobileResourceQuery(null, debouncedSearch);
    void storage.setItemAsync(MOBILE_RESOURCE_SEARCH_STORAGE_KEY, JSON.stringify(nextState));
    pendingSyncRef.current = debouncedSearch;
    if (preferencesRef.current) {
      void flushPreferenceSync();
    } else if (preferencesQuery.isError) {
      setSyncError('Search is saved on this device, but account sync failed.');
    }
  }, [debouncedSearch, preferencesQuery.isError, searchHydration]);

  const resourceParams = { q: debouncedSearch || undefined };
  const {
    data,
    error,
    isError,
    isFetching,
    isLoading,
    refetch,
  } = useListResources(
    resourceParams,
    {
      query: {
        enabled: searchHydration === 'ready',
        queryKey: getListResourcesQueryKey(resourceParams),
      },
    },
  );
  // A failed first request has no collection to describe. Keeping this state
  // separate prevents network/server failures from becoming "No results".
  const failed = isError && data === undefined;

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
            editable={searchHydration === 'ready'}
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
            <Pressable
              accessibilityLabel="Clear resource search"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => { setSearch(''); setDebouncedSearch(''); }}
            >
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
        {syncError ? (
          <View
            accessibilityRole="alert"
            style={[
              styles.syncError,
              { backgroundColor: colors.destructive + '10', borderColor: colors.destructive, borderRadius: colors.radius },
            ]}
          >
            <Text style={{ color: colors.destructiveText, flex: 1, fontFamily: colors.fontFamily.sans }}>
              {syncError}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void retryPreferenceSync();
              }}
            >
              <Text style={{ color: colors.primary, fontFamily: colors.fontFamily.sansSemiBold }}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {searchHydration !== 'ready' || isLoading ? (
        <FlatList
          data={[1, 2, 3, 4, 5]}
          keyExtractor={(item) => String(item)}
          renderItem={() => <ResourceSkeleton />}
          contentContainerStyle={styles.listContent}
          scrollEnabled={false}
        />
      ) : failed ? (
        <ErrorState
          error={error}
          retrying={isFetching}
          onRetry={() => {
            void refetch();
          }}
          style={styles.errorState}
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
  errorState: { flex: 1 },
  syncError: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', gap: 10, padding: 10 },
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
  thumbnail: { width: '100%', height: 140, overflow: 'hidden', marginBottom: 4 },
  thumbnailImage: { width: '100%', height: '100%' },
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
  verifyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  verifyChipText: { fontSize: 10 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stars: { flexDirection: 'row', gap: 2 },
  ratingText: { fontSize: 11 },
});
