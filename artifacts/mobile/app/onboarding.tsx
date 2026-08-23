/**
 * @fileOverview Mobile screen role: prepares a resumable learning task and hands it into real resource search.
 * System connection: persists a device draft, releases root navigation through OnboardingContext, and starts save-based activation tracking.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { Button } from '@workspace/edu-ds/components/native/button';
import { recordProductEvent } from '@workspace/api-client-react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { beginMobileOnboardingActivation } from '@/utils/onboarding-activation';
import {
  MOBILE_ONBOARDING_DRAFT_STORAGE_KEY,
  MOBILE_ONBOARDING_STEP_COUNT,
  mobileOnboardingProgressPercent,
  mobileOnboardingSearchDestination,
  parseMobileOnboardingDraft,
  type MobileOnboardingDraft,
} from '@/utils/onboarding-state';
import {
  mergeMobileResourceQuery,
  MOBILE_RESOURCE_SEARCH_STORAGE_KEY,
} from '@/utils/resource-search-state';
import { storage } from '@/utils/secure-storage';

const WORKFLOW = [
  { icon: 'search', label: 'Find', detail: 'Search for a real topic or skill.' },
  { icon: 'shield', label: 'Verify', detail: 'Inspect the creator, source, and limitations.' },
  { icon: 'bookmark', label: 'Save', detail: 'Keep only a resource that is genuinely useful.' },
  { icon: 'list', label: 'Organize', detail: 'Place it in an ordered Learning List.' },
  { icon: 'play-circle', label: 'Study', detail: 'Continue through a focused learning path.' },
  { icon: 'check-circle', label: 'Prove', detail: 'Record reflection and evidence of progress.' },
] as const;

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { complete, needsOnboarding, replaying } = useOnboarding();
  // Capture the entry mode once. complete() changes context before this route
  // unmounts, but that must not turn a replay into first-run analytics.
  const [firstRun] = useState(needsOnboarding && !replaying);
  const [draft, setDraft] = useState<MobileOnboardingDraft>(() =>
    parseMobileOnboardingDraft(null),
  );
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const draftWriteRef = useRef<Promise<void>>(Promise.resolve());
  const finishingRef = useRef(false);
  const normalizedNeed = draft.learningNeed.trim();
  const progress = mobileOnboardingProgressPercent(draft.step);

  useEffect(() => {
    let active = true;
    void storage
      .getItemAsync(MOBILE_ONBOARDING_DRAFT_STORAGE_KEY)
      .then((raw) => {
        if (active) setDraft(parseMobileOnboardingDraft(raw));
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated || finishingRef.current) return;
    // Persist every meaningful edit so reloads and interrupted app sessions
    // restore the exact task and step rather than restarting a slideshow. The
    // serialized chain also lets completion wait before deleting the draft.
    draftWriteRef.current = draftWriteRef.current
      .then(() => storage.setItemAsync(MOBILE_ONBOARDING_DRAFT_STORAGE_KEY, JSON.stringify(draft)))
      .catch(() => undefined);
  }, [draft, hydrated]);

  useEffect(() => {
    if (!firstRun) return;
    void recordProductEvent({
      event: 'onboarding_started',
      context: { surface: 'mobile_onboarding' },
    }).catch(() => undefined);
  }, [firstRun]);

  async function skip() {
    if (busy) return;
    setBusy(true);
    finishingRef.current = true;
    try {
      await draftWriteRef.current;
      await storage.deleteItemAsync(MOBILE_ONBOARDING_DRAFT_STORAGE_KEY);
    } catch {
      // Completion state is authoritative; a stale draft is safe to ignore.
    }
    await complete();
  }

  async function startRealTask() {
    if (!normalizedNeed || busy) return;
    setBusy(true);
    finishingRef.current = true;
    const searchState = mergeMobileResourceQuery(null, normalizedNeed);

    // Search restoration must be written before root navigation releases this
    // route. Activation is marked only for a true first run, never a replay.
    await draftWriteRef.current;
    await Promise.all([
      storage
        .setItemAsync(MOBILE_RESOURCE_SEARCH_STORAGE_KEY, JSON.stringify(searchState))
        .catch(() => undefined),
      storage.deleteItemAsync(MOBILE_ONBOARDING_DRAFT_STORAGE_KEY).catch(() => undefined),
      firstRun ? beginMobileOnboardingActivation() : Promise.resolve(),
    ]);
    await complete(mobileOnboardingSearchDestination(normalizedNeed));
  }

  function moveTo(step: number) {
    setDraft((current) => ({ ...current, step }));
  }

  if (!hydrated) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator accessibilityLabel="Restoring tutorial" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.flex, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <View>
            <Text style={[styles.eyebrow, { color: colors.primary, fontFamily: colors.fontFamily.sansSemiBold }]}>
              GUIDED FIRST TASK
            </Text>
            <Text style={[styles.stepLabel, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
              Step {draft.step + 1} of {MOBILE_ONBOARDING_STEP_COUNT}
            </Text>
          </View>
          <TouchableOpacity
            accessibilityLabel="Skip the tutorial"
            accessibilityRole="button"
            disabled={busy}
            hitSlop={10}
            onPress={() => {
              void skip();
            }}
            style={styles.skipButton}
          >
            <Text style={{ color: colors.mutedForeground, fontFamily: colors.fontFamily.sansMedium }}>
              Skip
            </Text>
            <Feather name="x" size={17} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        <View
          accessibilityLabel="Tutorial progress"
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: progress }}
          style={[styles.progressTrack, { backgroundColor: colors.muted }]}
        >
          <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${progress}%` }]} />
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.radius + 8,
            },
          ]}
        >
          {draft.step === 0 ? (
            <View style={styles.stepContent}>
              <LinearGradient
                colors={[colors.primary, colors.accent]}
                end={{ x: 1, y: 1 }}
                start={{ x: 0, y: 0 }}
                style={[styles.heroIcon, { borderRadius: colors.radius + 4 }]}
              >
                <Feather name="feather" size={26} color={colors.primaryForeground} />
              </LinearGradient>
              <Text style={[styles.title, { color: colors.foreground, fontFamily: colors.fontFamily.sansBold }]}>
                What do you need to learn or teach right now?
              </Text>
              <Text style={[styles.body, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
                Start with a genuine topic, question, or skill. Casparel will carry it into Search; this guide does not create sample progress or fake data.
              </Text>
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.foreground, fontFamily: colors.fontFamily.sansMedium }]}>
                  Learning need
                </Text>
                <TextInput
                  accessibilityLabel="Learning need"
                  autoFocus
                  maxLength={300}
                  multiline
                  onChangeText={(learningNeed) =>
                    setDraft((current) => ({ ...current, learningNeed }))
                  }
                  placeholder="For example: understand derivatives from scratch"
                  placeholderTextColor={colors.mutedForeground}
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                      borderRadius: colors.radius,
                      color: colors.foreground,
                      fontFamily: colors.fontFamily.sans,
                    },
                  ]}
                  textAlignVertical="top"
                  value={draft.learningNeed}
                />
                <Text style={[styles.hint, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
                  Saved only on this device until you launch Search.
                </Text>
              </View>
            </View>
          ) : null}

          {draft.step === 1 ? (
            <View style={styles.stepContent}>
              <View style={[styles.iconTile, { backgroundColor: colors.primary + '16', borderRadius: colors.radius }]}>
                <Feather name="compass" size={24} color={colors.primary} />
              </View>
              <Text style={[styles.title, { color: colors.foreground, fontFamily: colors.fontFamily.sansBold }]}>
                A resource is the beginning, not the finish
              </Text>
              <Text style={[styles.body, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
                For <Text style={{ color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }}>{normalizedNeed}</Text>, Casparel connects six real actions. Stop after saving or continue into a path when it helps.
              </Text>
              <View style={styles.workflowGrid}>
                {WORKFLOW.map((item, index) => (
                  <View
                    key={item.label}
                    style={[
                      styles.workflowItem,
                      {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                        borderRadius: colors.radius,
                      },
                    ]}
                  >
                    <Feather name={item.icon} size={18} color={colors.primary} />
                    <View style={styles.workflowText}>
                      <Text style={{ color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }}>
                        {index + 1}. {item.label}
                      </Text>
                      <Text style={[styles.workflowDetail, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
                        {item.detail}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {draft.step === 2 ? (
            <View style={styles.stepContent}>
              <View style={[styles.iconTile, { backgroundColor: colors.primary + '16', borderRadius: colors.radius }]}>
                <Feather name="search" size={24} color={colors.primary} />
              </View>
              <Text style={[styles.title, { color: colors.foreground, fontFamily: colors.fontFamily.sansBold }]}>
                Find your first useful resource
              </Text>
              <Text style={[styles.body, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
                Search opens with <Text style={{ color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }}>{normalizedNeed}</Text> restored. Choose a result, inspect its evidence, and save only what is useful.
              </Text>
              <View style={[styles.checklist, { backgroundColor: colors.background, borderColor: colors.border, borderRadius: colors.radius }]}>
                <Text style={{ color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }}>
                  Your activation checklist
                </Text>
                {[
                  ['search', 'Run the restored search.'],
                  ['shield', 'Check the source and its limitations.'],
                  ['bookmark', 'Save one useful result to complete activation.'],
                ].map(([icon, label]) => (
                  <View key={label} style={styles.checkRow}>
                    <Feather name={icon as never} size={17} color={colors.primary} />
                    <Text style={[styles.checkText, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
                      {label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.actions}>
          <Button
            disabled={busy || draft.step === 0}
            onPress={() => moveTo(draft.step - 1)}
            style={styles.actionButton}
            variant="outline"
          >
            Back
          </Button>
          {draft.step < MOBILE_ONBOARDING_STEP_COUNT - 1 ? (
            <Button
              disabled={busy || !normalizedNeed}
              onPress={() => moveTo(draft.step + 1)}
              style={styles.actionButton}
            >
              Continue
            </Button>
          ) : (
            <Button
              disabled={!normalizedNeed}
              loading={busy}
              onPress={() => {
                void startRealTask();
              }}
              style={styles.actionButton}
            >
              Start the real search
            </Button>
          )}
        </View>

        <Text style={[styles.replayHint, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
          You can skip now and replay this guided task from Profile.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  scrollContent: { gap: 16, paddingHorizontal: 18 },
  topRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  eyebrow: { fontSize: 11, letterSpacing: 0.8 },
  stepLabel: { fontSize: 12, marginTop: 2 },
  skipButton: { alignItems: 'center', flexDirection: 'row', gap: 5, minHeight: 44, paddingHorizontal: 4 },
  progressTrack: { borderRadius: 4, height: 7, overflow: 'hidden' },
  progressFill: { borderRadius: 4, height: 7 },
  card: { borderWidth: 1, minHeight: 470, overflow: 'hidden', padding: 20 },
  stepContent: { gap: 16 },
  heroIcon: { alignItems: 'center', height: 54, justifyContent: 'center', width: 54 },
  iconTile: { alignItems: 'center', height: 48, justifyContent: 'center', width: 48 },
  title: { fontSize: 25, letterSpacing: -0.5, lineHeight: 31 },
  body: { fontSize: 14, lineHeight: 21 },
  field: { gap: 7, marginTop: 4 },
  fieldLabel: { fontSize: 14 },
  input: { borderWidth: 1, fontSize: 15, minHeight: 98, paddingHorizontal: 12, paddingVertical: 11 },
  hint: { fontSize: 11, lineHeight: 16 },
  workflowGrid: { gap: 9 },
  workflowItem: { alignItems: 'flex-start', borderWidth: 1, flexDirection: 'row', gap: 10, padding: 11 },
  workflowText: { flex: 1, gap: 2 },
  workflowDetail: { fontSize: 12, lineHeight: 17 },
  checklist: { borderWidth: 1, gap: 12, padding: 14 },
  checkRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 9 },
  checkText: { flex: 1, fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 10 },
  actionButton: { flex: 1 },
  replayHint: { fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
