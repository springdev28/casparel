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

## September 8: ad visibility and payment layout follow-up

The user confirmed payment options are working. Hostinger's environment listing
now includes `REVENUECAT_SECRET_API_KEY`; earlier reports of it being absent must
not be treated as the current configuration.

The Android workspace placed its native ad placeholder after the entire page,
so it was below the fold on ordinary workspaces. It now sits in the document
flow immediately below the toolbar, as the web placement does. The new
`audit-native-ads.mjs` checks the built application at 320px and 390px: eligibility
changes, visible placement messages without scrolling, dismissal, no AdSense
requests inside the native shell, and no placement on the plans page. It mocks
account responses and the WebView message bridge, not an actual AdMob creative.
New native builds publish creative readiness so unavailable inventory leaves no
blank card. Older installed builds retain their existing placement contract.

Failed UMP updates without usable cached consent, and failed Mobile Ads startup,
now retry after 30 seconds while foregrounded or upon returning to the app.
The consent gate stays closed until Google allows requests. A successful consent
response that disallows requests does not schedule a retry.

The native paywall now keeps badges inside cards, wraps long prices and purchase
labels, holds the close control in a separate header, and translates savings and
renewal text. Web checkout labels wrap instead of truncating the price. Rendered
native-screen checks passed in English and Turkish at 320px, 390px and 768px,
including a 160% text-size simulation and unusually long price fixtures. These
checks use React Native Web with mocked purchase data; they do not complete a
store purchase or prove physical-device rendering.

The AdMob dashboard inspected on September 8 showed the account approved and
Casparel Android with 3 requests and 2 impressions over the last seven days.
It also still showed a "Link to app store" setup task. This is evidence that
some ads have served, not proof that the installed app currently has inventory
or that its app-specific readiness review is complete. No live ads were clicked,
and no AdMob account settings were changed in this follow-up.

## September 8: ad controls, scrolling and feedback

The reported controls were inside `NativeAdView`, the overlay only appeared when
its entire placeholder fit onscreen, and DOM z-index could not place a native
surface behind the web sidebar. The placement bridge now communicates clipping,
measured creative height and visibility beneath dialogs/navigation. Vertical drags
starting over the ad are forwarded to the workspace scroller. Older installed
builds retain the old placement contract until they receive the native update.

The app controls sit outside the SDK touch surface with 44-point targets. One
native creative is prefetched for skip/video-end replacement, with consent,
background visibility, request timeouts, stale responses and disposal accounted
for. An immediate replacement still depends on available inventory. Native
video's own mute callbacks persist the preference. Changing the app's ad-sound
preference replaces the current creative using `startVideoMuted`: Google's
[VideoController](https://developers.google.com/admob/android/reference/com/google/android/gms/ads/VideoController)
only supports direct custom mute control for custom-controls-enabled inventory.
The SDK's own video controls remain available; Casparel does not pretend a global
`MobileAds.setAppMuted` call mutes an already-playing native video. Account writes
are serialized and SecureStore keys use supported characters.

Web replacement requires the explicit close/next button. AdSense automatic
refresh is excluded under its
[placement policy](https://support.google.com/adsense/answer/1346295?hl=en-GB).
Its video audio remains controlled by the ad player; Settings explains this
instead of offering an ineffective web sound switch.

Ordinary workspace controls get a 180ms pop/glow and quiet tones. Audio is unlocked
inside the first input gesture while sound recipes remain lazy. Native design
system buttons get a matching fast press pulse, haptics and original short PCM
cues via Expo Audio. Sound-effects preferences sync through the WebView bridge,
remain independent of ad audio, and respect reduced motion and the native silent
mode. Recording/microphone permissions remain disabled.

Verification includes `audit-native-ads.mjs` at 320/390px, the actual RN card in
`artifacts/mobile/scripts/audit-ad-controls.mjs` with a simulated SDK, and
`audit-interaction-feedback.mjs` against the built app. These check real rendered
controls and events, but do not prove physical Android SDK/video behavior. No
live ads are clicked. Workspace typechecks, API/mobile tests, both native bundles,
API/web builds, release config and the existing feedback audit are also required.
