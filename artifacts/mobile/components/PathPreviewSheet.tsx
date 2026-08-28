/**
 * @fileOverview Mobile UI role: shows what a learning path built from a list would contain, before it is built.
 * System connection: opened by the Learning List screen and backed by the generated build-path hook.
 */
/**
 * The review before the path exists.
 *
 * The workflow specification is explicit that generated work is not activated
 * on the learner's behalf: they see the steps, they can still change their
 * mind, and Activate is a decision rather than a side effect. That is easy to
 * honour here because there is nothing generated to preview -- the steps are
 * the list, in the order the learner arranged it, so this sheet shows what it
 * already has rather than asking a server what it would make.
 *
 * No estimated durations, no percentage, no "analysing your list": the app
 * knows none of those things, and saying them would be an invention on the
 * screen where the learner is deciding whether to trust it.
 */
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Button } from '@workspace/edu-ds/components/native/button';
import type { ListItem } from '@workspace/api-client-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useMotion } from '@/contexts/MotionContext';

type PathPreviewSheetProps = {
  visible: boolean;
  listName: string;
  items: ListItem[];
  building: boolean;
  failure: string | null;
  onClose: () => void;
  onBuild: () => void;
};

export function PathPreviewSheet({
  visible,
  listName,
  items,
  building,
  failure,
  onClose,
  onBuild,
}: PathPreviewSheetProps) {
  const { t } = useLanguage();
  const colors = useColors();
  const { reduceMotion } = useMotion();
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!visible) setConfirmed(false);
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'fade' : 'slide'}
      onRequestClose={building ? () => {} : onClose}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Close')}
          disabled={building}
          style={styles.backdrop}
          onPress={onClose}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderTopLeftRadius: colors.radius * 2,
              borderTopRightRadius: colors.radius * 2,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text
            style={[
              styles.title,
              { color: colors.foreground, fontFamily: colors.fontFamily.sansBold },
            ]}
          >
            {t('Build a learning path')}
          </Text>
          <Text
            style={[
              styles.description,
              { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
            ]}
          >
            {t('These steps come from this list, in this order. You can change them afterwards.')}
          </Text>

          <ScrollView style={styles.body} contentContainerStyle={styles.steps}>
            {items.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.step,
                  { borderColor: colors.border, borderRadius: colors.radius },
                ]}
              >
                <Text
                  style={[
                    styles.position,
                    { color: colors.mutedForeground, fontFamily: colors.fontFamily.sansSemiBold },
                  ]}
                >
                  {index + 1}
                </Text>
                <Text
                  numberOfLines={2}
                  style={[
                    styles.stepTitle,
                    { color: colors.foreground, fontFamily: colors.fontFamily.sans },
                  ]}
                >
                  {item.resource.title}
                </Text>
              </View>
            ))}
          </ScrollView>

          {failure ? (
            <View
              accessibilityRole="alert"
              style={[
                styles.notice,
                {
                  backgroundColor: colors.destructive + '12',
                  borderColor: colors.destructive,
                  borderRadius: colors.radius,
                },
              ]}
            >
              <Feather name="alert-circle" size={16} color={colors.destructiveText} />
              <Text style={[styles.noticeText, { color: colors.foreground }]}>{failure}</Text>
            </View>
          ) : null}

          <Text
            style={[
              styles.footnote,
              { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
            ]}
          >
            {`${t('The goal will be called')} “${listName}”.`}
          </Text>

          <View style={styles.footerRow}>
            <Button variant="ghost" onPress={onClose} disabled={building}>
              {t('Cancel')}
            </Button>
            <Button
              loading={building}
              disabled={building || confirmed}
              onPress={() => {
                setConfirmed(true);
                onBuild();
              }}
            >
              {failure ? t('Retry') : t('Build the path')}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  sheet: {
    borderWidth: 1,
    padding: 18,
    paddingBottom: 28,
    gap: 12,
    maxHeight: '82%',
  },
  handle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 2,
  },
  title: { fontSize: 18 },
  description: { fontSize: 13, lineHeight: 18 },
  body: { flexShrink: 1 },
  steps: { gap: 8 },
  step: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    minHeight: 46,
    paddingVertical: 8,
  },
  position: { fontSize: 13, minWidth: 16, textAlign: 'center' },
  stepTitle: { flex: 1, fontSize: 14, lineHeight: 19 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    padding: 10,
  },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 17 },
  footnote: { fontSize: 12, lineHeight: 16 },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
});
