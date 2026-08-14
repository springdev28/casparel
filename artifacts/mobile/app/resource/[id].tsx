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
import { useLocalSearchParams } from 'expo-router';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Badge } from '@workspace/edu-ds/components/native/badge';
import { Button } from '@workspace/edu-ds/components/native/button';
import { Skeleton } from '@workspace/edu-ds/components/native/skeleton';
import { Empty } from '@workspace/edu-ds/components/native/empty';
import { useGetResource, useListResourceReviews } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import type { Review } from '@workspace/api-client-react';
import { SourceReviewSection } from '@/components/SourceReviewSection';

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
  const colors = useColors();
  const date = new Date(item.createdAt).toLocaleDateString(undefined, {
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
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const resourceId = parseInt(id, 10);

  const { data: resource, isLoading } = useGetResource(resourceId);
  const { data: reviews, isLoading: reviewsLoading } = useListResourceReviews(resourceId);

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
      <Empty icon="alert-circle" title="Resource not found" />
    );
  }

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
              {resource.format}
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
                  ? 'A reviewer did not approve this source.'
                  : 'Not yet reviewed — check the source before you rely on it.'}
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
            About
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

      {/* Open Button */}
      <Button
        onPress={() => Linking.openURL(resource.url)}
        size="lg"
        style={{ marginTop: 4 }}
      >
        Open Resource
      </Button>

      {/* AI Source Research (deep mode is a Premium feature) */}
      <SourceReviewSection resourceId={resourceId} />

      {/* Reviews */}
      <View style={[styles.section, { marginTop: 24 }]}>
        <Text
          style={[
            styles.sectionTitle,
            { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold },
          ]}
        >
          Reviews
        </Text>

        {reviewsLoading ? (
          <View style={{ gap: 8 }}>
            {[1, 2].map((i) => (
              <Skeleton key={i} width="100%" height={70} borderRadius={8} />
            ))}
          </View>
        ) : !reviews?.length ? (
          <Empty icon="star" title="No reviews yet" description="Be the first to review this resource" />
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
});
