# Casparel distribution and monetization

## Distribution decision

Casparel remains one product with shared accounts and data across web, mobile and desktop.

| Surface | Distribution |
| --- | --- |
| Web | `casparel.com` |
| Android | Google Play |
| Windows | Direct installer from the Casparel website |
| macOS | Direct installer from the Casparel website |
| iOS | Deferred until there is a product reason to ship it |

The website should always preserve **Continue on Web** alongside the relevant install action. Windows and macOS do not require Microsoft Store or Mac App Store distribution for the current plan.

Desktop installers are built by the existing desktop release workflow. The website may link directly to platform-specific release artifacts or to a Casparel-controlled download endpoint that resolves the current signed release. Desktop update metadata remains under Casparel's control rather than relying on a desktop app store.

For Shipaton, Android/Google Play is the prioritized store surface. Do not describe the Play listing as live until it has actually passed review and is installable.

## RevenueCat subscriptions

The Expo client already uses `react-native-purchases` for:

- RevenueCat SDK configuration with platform-specific public keys;
- App User ID login/logout;
- offerings and packages;
- purchases;
- restore purchases;
- CustomerInfo refresh;
- entitlement-driven plan state and ad-free paid access.

The current paywall and `PurchasesProvider` remain the subscription implementation. The ad work extends RevenueCat rather than replacing the purchase stack.

## Sponsored learning resource

Free-tier mobile users may receive **one** native sponsored card near the top of the dashboard. Paid subscribers do not receive it.

The card must:

- say **Sponsored learning resource** and **AD** before the creative;
- state that sponsorship does not influence Casparel rankings or credibility scores;
- remain outside search ranking, credibility analysis, Learning Lists, Learning Paths and teacher recommendations;
- use a native ad format so the ad network controls click/impression registration;
- fail closed: a missing production ad unit means no card, not a placeholder or broken dashboard.

## AdMob and RevenueCat Ads data flow

```text
Google AdMob native ad
        ↓
Casparel dashboard card
        ↓
AdMob load / impression / click / paid callbacks
        ↓
RevenueCat Purchases.adTracker
        ↓
RevenueCat Ads + subscription analytics
```

RevenueCat Ads does not supply creatives. AdMob is the serving network. RevenueCat AdTracker receives load, impression, click, failure and impression-level revenue events.

The implementation uses:

- `react-native-google-mobile-ads` for the native creative;
- `react-native-purchases` for subscriptions and RevenueCat Ads tracking;
- the AdMob native ad `responseId` as the consistent impression ID;
- non-personalized ad requests;
- education-related request keywords;
- a conservative PG maximum content rating;
- an under-age-of-consent treatment flag as a student-safe default.

Education keywords are only contextual signals. They do **not** guarantee education-only inventory. Production must also use AdMob account-level category/content controls and all applicable consent/privacy configuration.

## Required production configuration

Set these for EAS/release builds:

```text
EXPO_PUBLIC_RC_ANDROID_KEY
ADMOB_ANDROID_APP_ID
EXPO_PUBLIC_ADMOB_ANDROID_DASHBOARD_NATIVE_AD_UNIT_ID
```

The iOS equivalents exist for future use. Development builds use Google's official test app/ad IDs. Release builds intentionally render no sponsored card if a production native ad-unit ID is missing.

In external dashboards before release:

1. Create the Android app and native dashboard ad unit in AdMob.
2. Enable AdMob impression-level ad revenue (ILRD).
3. Enable RevenueCat Ads beta access for the RevenueCat project.
4. Verify RevenueCat products, entitlement and current offering.
5. Configure AdMob blocked categories/content controls for the education product.
6. Complete consent/privacy configuration for the markets and ages Casparel serves.
7. In Google Play Console, declare that the app contains ads.
8. Test purchases and ad events using sandbox/test inventory before production.

## Trust boundary

Advertising is a funding surface, not a recommendation signal. No sponsored payment can raise a resource's ranking, credibility result, learner-fit result or teacher-facing recommendation. If this boundary cannot be made obvious in the UI, the ad surface should be removed rather than blended into product content.
