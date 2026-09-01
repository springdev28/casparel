# Android distribution and monetization

This document explains how the Android ad and subscription pieces fit together,
which parts are code, and which parts must be configured in external dashboards.

## Runtime architecture

RevenueCat remains the source of truth for purchases and paid entitlements.
Google AdMob supplies the advertisement. RevenueCat Ads receives the lifecycle
and impression-level revenue events; it does not supply an ad creative.

```text
Google UMP privacy state
          ↓ permits
Google AdMob native ad ── callbacks ──→ RevenueCat Purchases.adTracker
          ↓                                  ↑
Android dashboard                      Casparel App User ID
          ↑                                  ↑
free entitlement ←── RevenueCat CustomerInfo / Google Play purchase
```

The implementation boundaries are:

- `contexts/PurchasesContext.tsx`: configures RevenueCat, associates the
  Casparel user ID, loads offerings and CustomerInfo, buys and restores;
- `contexts/AdsContext.android.tsx`: refreshes UMP at launch, applies the
  conservative request configuration, and initializes AdMob only when allowed;
- `components/SponsoredLearningResourceCard.android.tsx`: loads and registers
  the one native dashboard creative and destroys it on unmount;
- `utils/revenuecat-ads.ts`: forwards load, impression, click, failure, and
  paid-revenue callbacks to the same RevenueCat SDK instance;
- `app.config.js`: writes the AdMob application ID and delayed-measurement flag
  into the generated Android manifest.

## Product and privacy invariants

- Paid subscribers are ad-free. If RevenueCat cannot establish entitlement
  state, the ad is suppressed rather than risking an ad for a paid account.
- `review@casparel.com` is the dedicated Google Play reviewer seat. The API
  keeps that exact account on the highest finite `Institutional` tier, and the
  mobile purchase context mirrors the tier immediately so the reviewer never
  sees a paywall or sponsored card while RevenueCat loads. This exception does
  not grant administrator access, and its password belongs only in Play
  Console's private App access instructions.
- UMP runs before Google Mobile Ads initializes. If no valid current/cached
  consent state permits a request, the ad is suppressed.
- Casparel currently has no reliable age/guardian claim, so the Android ad
  surface uses under-age-of-consent treatment for the whole education audience,
  requests non-personalized ads, and sets a PG maximum content rating.
- The placement is explicitly labelled `Sponsored learning resource` and `AD`.
  It is outside search rankings, credibility scores, Learning Lists/Paths,
  adaptive suggestions, and teacher recommendations.
- A missing production identifier is a build failure. An SDK/network failure is
  an empty placement, never a broken dashboard or a fake placeholder.
- iOS and web remain ad-free. Platform-specific files keep the native AdMob
  module out of those bundles.

## Build configuration

Preview APKs use Google's official sample application/ad-unit IDs. They render
test inventory and are safe to install on devices. Production AAB builds require
these EAS environment variables:

```text
EXPO_PUBLIC_RC_ANDROID_KEY
ADMOB_ANDROID_APP_ID
EXPO_PUBLIC_ADMOB_ANDROID_DASHBOARD_NATIVE_AD_UNIT_ID
```

The identifiers are public client configuration, not secret credentials. They
must nevertheless reference Casparel's real RevenueCat/AdMob projects. Dynamic
Expo configuration refuses a `production` build without both AdMob IDs so a
test ID cannot accidentally reach Google Play.

`react-native-google-mobile-ads` is intentionally pinned to `16.0.0`. That
release uses Google Mobile Ads Android SDK 24.6, whose Kotlin metadata is
compatible with Expo 54's Kotlin 2.1 toolchain. Version 16.1 and newer move to
Google SDK 25, and 16.4/16.5 currently resolve SDK 25.4, which is compiled with
Kotlin 2.3 and fails an Expo 54 native build. Re-test a complete Android release
assembly before changing this pin; a passing JavaScript bundle cannot detect
native Kotlin metadata incompatibility.

The mobile package also declares `babel-preset-expo` directly because
`babel.config.js` names it directly. pnpm does not let Gradle's Metro process
reach through Expo's transitive dependency tree, even though `expo export`
can appear to work from the workspace root.

Onboarding and paywall entrance motion use React Native's built-in `Animated`
API. Keyboard-aware forms use the platform `ScrollView` keyboard insets. This
keeps those interactions while avoiding an unnecessary Reanimated/Worklets C++
linkage layer in the Android release build.

## External setup before production ads

1. Create `com.casparel.app` and one native dashboard ad unit in AdMob.
2. Configure Privacy & messaging in AdMob for all target regions and enable
   impression-level ad revenue.
3. Apply conservative blocked-category/content controls in AdMob. Contextual
   education keywords are hints, not an inventory guarantee.
4. Enable RevenueCat Ads/Charts and connect AdMob if ad-unit names should sync.
5. Verify the RevenueCat Android public key, products, packages, current
   offering, and all eight entitlement identifiers.
   Grant the `institutional` promotional entitlement to the reviewer account's
   numeric Casparel App User ID as defense in depth; the server remains the
   authority for the provisioned seat.
6. In Play Console, declare that the app contains ads and complete Data safety,
   Families/target-audience, content-rating, and subscription declarations.
7. Test UMP geographies, a free account, every paid entitlement, purchase,
   cancellation, restore, offline launch, and ad/revenue callbacks on a physical
   Android device before submitting the AAB.

Use `docs/release-runbook.md` for the EAS/Play delivery commands. Repository
tests prove configuration and bundle integrity; only the external dashboards,
RevenueCat sandbox, and a real device can prove billing and advertising end to
end.
