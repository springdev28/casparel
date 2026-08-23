/**
 * @fileOverview Mobile screen role: defines the Expo Router Id screen or route layout.
 * System connection: composed by Expo Router and backed by auth, onboarding, purchases, secure storage, and the shared API.
 */
import React from 'react';
import {
  FlatList,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Badge } from '@workspace/edu-ds/components/native/badge';
import { Button } from '@workspace/edu-ds/components/native/button';
import { Skeleton } from '@workspace/edu-ds/components/native/skeleton';
import { Empty } from '@workspace/edu-ds/components/native/empty';
import {
  getGetUserLibraryQueryKey,
  useCreateResource,
  useGetMe,
  useGetResource,
  useGetUserLibrary,
  useListResourceReviews,
} from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import type { Resource, Review } from '@workspace/api-client-react';
import { SourceReviewSection } from '@/components/SourceReviewSection';
import { SaveToListSheet } from '@/components/SaveToListSheet';
import { useLanguage } from '@/contexts/LanguageContext';
import { useMotion } from '@/contexts/MotionContext';
import { describeApiFailure } from '@/utils/api-failure';
import { findSavedResource } from '@/utils/resource-library';
import { formatLabel } from '@/utils/labels';

function StarRow({ rating }: { rating: number }) {
  const colors = useColors();
  const filled = Math.round(rating);
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Feather
          key={i}
          name="star"
          size={16}
          color={i <= filled ? colors.chart3 : colors.border}
        />
      ))}
    </View>
  );
}

function ReviewCard({ item }: { item: Review }) {
  // `undefined` here means the *device's* language, not the reader's, and
  // those differ for anybody using the app in a language their phone is not
  // set to -- which is most of the point of offering six.
  const { intlLocale } = useLanguage();
  const colors = useColors();
  const date = new Date(item.createdAt).toLocaleDateString(intlLocale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return (
    <View
      style={[
        styles.reviewCard,
        { borderBottomColor: colors.border },
      ]}
    >
      <View style={styles.reviewHeader}>
        <View style={styles.reviewerRow}>
          <View
            style={[
              styles.avatar,
              { backgroundColor: colors.primary + '20', borderRadius: 20 },
            ]}
          >
            <Text
              style={[
                styles.avatarText,
                { color: colors.primary, fontFamily: colors.fontFamily.sansBold },
              ]}
            >
              {item.user.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text
              style={[
                styles.reviewerName,
                { color: colors.foreground, fontFamily: colors.fontFamily.sansMedium },
              ]}
            >
              {item.user.name}
            </Text>
            <Text
              style={[
                styles.reviewDate,
                { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
              ]}
            >
              {date}
            </Text>
          </View>
        </View>
        <StarRow rating={item.rating} />
      </View>
      {item.comment ? (
        <Text
          style={[
            styles.reviewComment,
            { color: colors.foreground, fontFamily: colors.fontFamily.sans },
          ]}
        >
          {item.comment}
        </Text>
      ) : null}
    </View>
  );
}

export default function ResourceDetailScreen() {
  const { t, intlLocale } = useLanguage();
  const colors = useColors();
  const { selection, success } = useMotion();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const resourceId = parseInt(id, 10);

  const { data: me } = useGetMe();
  const userId = me?.id ?? 0;
  const { data: resource, isLoading } = useGetResource(resourceId);
  const { data: reviews, isLoading: reviewsLoading } = useListResourceReviews(resourceId);
  const library = useGetUserLibrary(userId, {
    query: {
      queryKey: getGetUserLibraryQueryKey(userId),
      enabled: userId > 0,
    },
  });
  const saveResource = useCreateResource();
  const [locallySaved, setLocallySaved] = React.useState<Resource | null>(null);
  const [saveSheetOpen, setSaveSheetOpen] = React.useState(false);
  const [saveFailure, setSaveFailure] = React.useState<string | null>(null);

  React.useEffect(() => {
    setLocallySaved(null);
    setSaveSheetOpen(false);
    setSaveFailure(null);
  }, [resourceId]);

  const savedResource = resource
    ? locallySaved ??
      findSavedResource(library.data?.resources, resource.url) ??
      (resource.submittedById === userId ? resource : null)
    : null;

  async function handleSave() {
    if (!resource || !userId || saveResource.isPending) return;
    if (savedResource) {
      selection();
      setSaveSheetOpen(true);
      return;
    }

    setSaveFailure(null);
    try {
      const saved = await saveResource.mutateAsync({
        data: {
          title: resource.title,
          url: resource.url,
          description: resource.description ?? undefined,
          format: resource.format,
          subject: resource.subject,
          gradeLevel: resource.gradeLevel,
          thumbnailUrl: resource.thumbnailUrl ?? undefined,
        },
      });
      // Optimistic-looking, but only after the server confirms: a failed write
      // never leaves the phone claiming the source is safely in the library.
      setLocallySaved(saved);
      await queryClient.invalidateQueries({
        queryKey: getGetUserLibraryQueryKey(userId),
      });
      success();
      setSaveSheetOpen(true);
    } catch (error) {
      setSaveFailure(
        describeApiFailure(
          error,
          t("This resource could not be saved. Try again."),
          t,
        ),
      );
    }
  }

  const webBottomPad = Platform.OS === 'web' ? 34 : 0;

  if (isLoading) {
    return (
      <ScrollView
        style={[styles.flex, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.content, { paddingTop: 20 }]}
      >
        <Skeleton width="80%" height={28} />
        <Skeleton width="50%" height={18} style={{ marginTop: 10 }} />
        <Skeleton width="100%" height={100} borderRadius={12} style={{ marginTop: 20 }} />
      </ScrollView>
    );
  }

  if (!resource) {
    return (
      <Empty icon="alert-circle" title={t('Resource not found')} />
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + webBottomPad + 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
      {/* Hero */}
      <View
        style={[
          styles.hero,
          { backgroundColor: colors.primary, borderRadius: colors.radius },
        ]}
      >
        <View style={styles.heroInner}>
          <Text
            style={[
              styles.heroTitle,
              { color: colors.primaryForeground, fontFamily: colors.fontFamily.sansBold },
            ]}
          >
            {resource.title}
          </Text>
          <View style={styles.heroBadges}>
            <Badge variant="outline" style={{ borderColor: colors.primaryForeground + '60' }}>
              {formatLabel(resource.format, t)}
            </Badge>
            <Badge variant="outline" style={{ borderColor: colors.primaryForeground + '60' }}>
              {resource.subject}
            </Badge>
          </View>
          {resource.verificationStatus === 'unverified' ||
          resource.verificationStatus === 'rejected' ? (
            <View
              style={[
                styles.verifyNotice,
                { backgroundColor: colors.primaryForeground + '1F', borderRadius: colors.radius },
              ]}
            >
              <Feather
                name={resource.verificationStatus === 'rejected' ? 'shield-off' : 'shield'}
                size={13}
                color={colors.primaryForeground}
              />
              <Text
                style={[
                  styles.verifyNoticeText,
                  { color: colors.primaryForeground, fontFamily: colors.fontFamily.sans },
                ]}
              >
                {resource.verificationStatus === 'rejected'
                  ? t('A reviewer did not approve this source.')
                  : t('Not yet reviewed, check the source before you rely on it.')}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Rating & Grade */}
      <View
        style={[
          styles.metaCard,
          { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
        ]}
      >
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <StarRow rating={resource.avgRating} />
            <Text
              style={[
                styles.metaValue,
                { color: colors.foreground, fontFamily: colors.fontFamily.sansBold },
              ]}
            >
              {resource.avgRating.toFixed(1)}
              <Text
                style={[
                  styles.metaCount,
                  { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
                ]}
              >
                {' '}({resource.reviewCount})
              </Text>
            </Text>
          </View>
          <View style={[styles.metaDivider, { backgroundColor: colors.border }]} />
          <View style={styles.metaItem}>
            <Feather name="tag" size={14} color={colors.mutedForeground} />
            <Text
              style={[
                styles.metaValue,
                { color: colors.foreground, fontFamily: colors.fontFamily.sansMedium },
              ]}
            >
              {resource.gradeLevel}
            </Text>
          </View>
        </View>
      </View>

      {/* Description */}
      {resource.description ? (
        <View style={styles.section}>
          <Text
            style={[
              styles.sectionTitle,
              { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold },
            ]}
          >
            {t('About')}
          </Text>
          <Text
            style={[
              styles.description,
              { color: colors.foreground, fontFamily: colors.fontFamily.sans },
            ]}
          >
            {resource.description}
          </Text>
        </View>
      ) : null}

      {/* Source review: quick is non-AI; deep AI requires Plus or Pro. */}
      <SourceReviewSection resourceId={resourceId} />

      {/* Reviews */}
      <View style={[styles.section, { marginTop: 24 }]}>
        <Text
          style={[
            styles.sectionTitle,
            { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold },
          ]}
        >
          {t('Reviews')}
        </Text>

        {reviewsLoading ? (
          <View style={{ gap: 8 }}>
            {[1, 2].map((i) => (
              <Skeleton key={i} width="100%" height={70} borderRadius={8} />
            ))}
          </View>
        ) : !reviews?.length ? (
          <Empty icon="star" title={t('No reviews yet')} description={t("Be the first to review this resource")} />
        ) : (
          <View
            style={[
              styles.reviewsList,
              { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
            ]}
          >
            {reviews.map((review) => (
              <ReviewCard key={review.id} item={review} />
            ))}
          </View>
        )}
        </View>
      </ScrollView>

      {/* Mobile keeps the two decisions that matter beside the learner's
          thumb: use the source, or keep it and organize the next step. */}
      <View
        style={[
          styles.stickyActions,
          {
            paddingBottom: insets.bottom + 10,
            backgroundColor: colors.card,
            borderTopColor: colors.border,
          },
        ]}
      >
        {saveFailure ? (
          <View accessibilityRole="alert" style={styles.saveFailureRow}>
            <Feather name="alert-circle" size={15} color={colors.destructiveText} />
            <Text
              style={[
                styles.saveFailureText,
                { color: colors.foreground, fontFamily: colors.fontFamily.sans },
              ]}
            >
              {saveFailure}
            </Text>
            <Pressable onPress={() => void handleSave()}>
              <Text
                style={{ color: colors.primary, fontFamily: colors.fontFamily.sansSemiBold }}
              >
                {t('Retry')}
              </Text>
            </Pressable>
          </View>
        ) : savedResource ? (
          <View style={styles.savedStateRow}>
            <Feather name="check-circle" size={14} color={colors.primary} />
            <Text
              style={{ color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }}
            >
              {t('Saved in your library')}
            </Text>
          </View>
        ) : null}
        <View style={styles.actionRow}>
          <Button
            variant="outline"
            onPress={() => void Linking.openURL(resource.url)}
            style={styles.actionButton}
          >
            {t('Open Resource')}
          </Button>
          <Button
            onPress={() => void handleSave()}
            loading={saveResource.isPending}
            disabled={!userId}
            style={styles.actionButton}
          >
            {savedResource ? t('Add to list') : t('Save')}
          </Button>
        </View>
      </View>

      <SaveToListSheet
        visible={saveSheetOpen && Boolean(savedResource)}
        resource={savedResource}
        userId={userId}
        onClose={() => setSaveSheetOpen(false)}
        onViewGoals={() => {
          setSaveSheetOpen(false);
          router.push('/goals');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 12 },
  hero: {
    overflow: 'hidden',
  },
  heroInner: {
    padding: 20,
    gap: 12,
  },
  heroTitle: { fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
  heroBadges: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  verifyNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 10,
  },
  verifyNoticeText: { flex: 1, fontSize: 12, lineHeight: 16 },
  metaCard: {
    borderWidth: 1,
    padding: 16,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  metaItem: { flex: 1, gap: 6, alignItems: 'center' },
  metaDivider: { width: 1, height: 40, marginHorizontal: 16 },
  metaValue: { fontSize: 16 },
  metaCount: { fontSize: 13 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 16 },
  description: { fontSize: 14, lineHeight: 22 },
  reviewsList: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  reviewCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  reviewerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 15 },
  reviewerName: { fontSize: 14 },
  reviewDate: { fontSize: 11, marginTop: 1 },
  reviewComment: { fontSize: 14, lineHeight: 20 },
  stickyActions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionButton: { flex: 1 },
  savedStateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  saveFailureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  saveFailureText: { flex: 1, fontSize: 12, lineHeight: 16 },
});
