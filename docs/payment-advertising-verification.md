# Payment and advertising verification

The payment fixes cover web checkout recovery, subscription management, native
account identity, purchase/restore reconciliation, and refreshing the hosted
workspace after returning from the native paywall. Existing subscriptions are
managed through their original billing provider. Web checkout checks fresh
Customer Info before opening a new purchase; native transactions serialize SDK
identity changes and use fresh store state for Android replacement purchases.

Set `REVENUECAT_SECRET_API_KEY` on the API server to a server-only RevenueCat v1
key with subscriber read access. Never place this key in a `VITE_*` or
`EXPO_PUBLIC_*` variable. The authenticated reconciliation endpoint reads the
account ID from the session and verifies entitlements with RevenueCat; it
accepts no client-supplied grant. It preserves manually provisioned Institutional
plans. Grace periods are respected and expired entitlements are excluded.

With this key configured, lifecycle webhooks also verify current subscriber
state, so delayed expiry events and transfers to anonymous aliases are handled
against the provider's current answer. Without it, webhooks retain their previous
event-based behavior and the new reconciliation endpoint returns 503. Completed
payments are not presented as failed just because this verification is unavailable.

The existing client configuration remains required:

- Web: `VITE_REVENUECAT_WEB_API_KEY`, `VITE_ADSENSE_CLIENT_ID`, and
  `VITE_ADSENSE_SLOT_INLINE` in the frontend build environment.
- Mobile: the appropriate RevenueCat public SDK key and Test Store setting;
  production Android also requires `ADMOB_ANDROID_APP_ID` and
  `EXPO_PUBLIC_ADMOB_ANDROID_DASHBOARD_NATIVE_AD_UNIT_ID`.
- RevenueCat: the four existing Plus/Pro package mappings in
  [plan-economics.md](plan-economics.md), and the webhook authorization value.

Advertising retains the existing Pro/Institutional/administrator Disable ads
preference. Signed-in account preferences and server entitlement state must resolve
before an ad request; guests do not wait for account or billing data. Android sound
changes no longer reload the creative, failed requests
carry their unit ID into diagnostics, and unavailable inventory leaves no empty
card. Web script failures/timeouts can retry on a later placement; each new DOM
slot gets its own request, and unfilled inventory is hidden. iOS advertising is
unchanged and remains unavailable.

The public web landing page now contains an inline placement. The Hostinger
workflow passes the AdSense IDs and RevenueCat web key into Vite; previously it
omitted all three even when repository variables existed. On September 7, the
GitHub repository had both AdSense variables but no `VITE_REVENUECAT_WEB_API_KEY`
variable or secret. This finding is specific to the GitHub/Hostinger build path;
it does not establish absence in Replit. That build needs access to the existing
Web Billing SDK key and a rebuilt/deployed frontend.

Mobile now has a native `/home` screen, available without signing in. The brand
links in login, registration and the hosted workspace open it. Role switching
updates the existing web session without a document reload and refreshes the
native account's stored role. The guest home includes the Android ad placement;
native consent no longer depends on having an authenticated account.

`artifacts/mobile/scripts/audit-home-navigation.mjs` exercises the Expo web export
and built workspace using fixture accounts. With `AUDIT_CONFIGURED_ADS=true` and
`WEB_AUDIT_BUILD` pointing to a build with test AdSense IDs, it also checks guest
homepage ads at phone and desktop widths. It substitutes a local SDK response,
so it verifies placement and consent without requesting real ad inventory.
Native SDK behavior still requires a device build. The latest recorded Android
production build at inspection was 1.0.1 (21), created September 5; these local
changes are not in that binary.

On September 7, an explicitly authorized, read-only query using the Expo
production Android SDK key successfully read RevenueCat's offerings. The key is
a Google Play SDK key, Test Store is disabled, and `current_offering_id` is
`default`. All four expected custom packages are present and map to the matching
bare product IDs listed in `plan-economics.md`. This rules out an invalid Android
SDK key or missing RevenueCat offering as the cause; it does not verify Play
product/base-plan availability on a device or a completed checkout. No purchase
or provider configuration change was made. Expo's production environment had no
`EXPO_PUBLIC_RC_IOS_KEY`; this finding applies to EAS production, not Replit.
The user confirmed the credentials are stored in Replit, with a screenshot
showing `REVENUECAT_SECRET_API_KEY` present there. Verify the appropriate existing
public SDK keys reach each actual build environment before requesting new keys.
The server secret must remain server-only and cannot substitute for a public SDK
key in web or mobile bundles.

A subsequent read-only inspection through the Casparel Replit connector confirmed
`REVENUECAT_SECRET_API_KEY` is present. It reported the web/iOS/Android public SDK
variables and both Vite AdSense variables absent, with no equivalent names found.
The inspection covered workspace environment and Replit secret configuration;
it did not inspect the deployed bundle/runtime injection. Android billing and
AdMob values had separately been verified in EAS, and AdSense variables in GitHub.
Keep these environment-specific findings distinct: the existing Replit server
secret does not need to be recreated.

Before a production release, verify with sandbox purchases and physical devices:

1. Buy each tier on a free account and check `/users/me/usage` on both clients.
2. Restore, restart, and switch accounts; confirm transactions stay attached to
   the initiating account and a purchase from another store opens management.
3. Replay an older expiration webhook after renewal and test a transfer to/from
   an anonymous alias with server verification configured.
4. Simulate provider/network failure after checkout; confirm there is no second
   purchase prompt and that access catches up after verification/webhook recovery.
5. Exercise consent, Disable ads, account switching, blocked scripts, no-fill,
   mute/unmute, and returning from the paywall to the hosted workspace.

Repository tests mock provider responses. They do not prove that live RevenueCat
products, AdSense inventory, AdMob consent/configuration, or store credentials
are operational. No provider dashboard configuration is changed by this patch.
