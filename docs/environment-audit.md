# Environment and release audit

Every variable the shipped products read, where it is consumed, and what
happens when it is absent. No secret values appear here or belong here.

"Present in production" was established by reading the deployed bundle at
casparel.com and by asking the deployed server the questions it answers about
its own configuration (`GET /api/healthz`, `GET /api/discover/capabilities`).
Values that live only in the EAS environment cannot be read from outside a
build, and are marked as such rather than guessed at.

## Web (`artifacts/app`, inlined by Vite at build time)

Set in GitHub → Settings → Secrets and variables → Actions → **Variables**,
read by `.github/workflows/deploy-frontend.yml`.

| Variable | Consumed by | Absent means | In production |
| --- | --- | --- | --- |
| `VITE_REVENUECAT_WEB_API_KEY` | `src/lib/webBilling.ts` | No card checkout on the web; the plans page falls back to buy-on-mobile and tells an administrator exactly this | **No** — no `rcb_` key appears in the deployed `PlansPage` chunk |
| `VITE_ADSENSE_CLIENT_ID` | `src/lib/webAds.ts` | No web advertising; nothing is requested from Google | **No** — feature is new in this change |
| `VITE_ADSENSE_SLOT_INLINE` | `src/lib/webAds.ts` | As above | **No** — feature is new in this change |
| `VITE_ANDROID_APP_URL` | `src/lib/downloads.ts` | Falls back to the Play listing derived from the fixed application id, so the download control still works | Not set; the derived fallback covers it |
| `VITE_IOS_APP_URL` | `src/lib/downloads.ts` | iPhone is listed as not yet on the App Store | Not set (correct — no iOS listing yet) |
| `VITE_DESKTOP_DOWNLOAD_URL` | `src/lib/downloads.ts` | Desktop is listed as having no public installers | Not set |

## Mobile (`artifacts/mobile`, inlined into the JS bundle)

`EXPO_PUBLIC_*` values are inlined and therefore public by construction; none
of them is a secret. Real values live in the EAS environment named by the
build profile, not in this repository.

| Variable | Consumed by | Absent means | Guard |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_RC_ANDROID_KEY` | `utils/revenuecat.ts` | The paywall cannot sell anything | `scripts/check-release-config.mjs` fails a production Android build without it, and requires the `goog_` prefix |
| `EXPO_PUBLIC_RC_IOS_KEY` | `utils/revenuecat.ts` | As above, on iOS | Same check, requiring `appl_` |
| `EXPO_PUBLIC_RC_TEST_KEY` | `utils/revenuecat.ts` | Development and preview builds cannot show plans | Required for those profiles, and must start with `test_` |
| `EXPO_PUBLIC_RC_USE_TEST_STORE` | `utils/revenuecat.ts` | Defaults to Test Store only under `__DEV__` | `eas.json` pins `"false"` for production; the checker fails a production build that enables it, and `selectRevenueCatApiKey` refuses a `test_` key outside Test Store and a store key inside it |
| `EXPO_PUBLIC_ADMOB_ANDROID_DASHBOARD_NATIVE_AD_UNIT_ID` | `components/SponsoredLearningResourceCard.android.tsx` | No production ad unit, so no ads | `app.config.js` throws on a production build without it |
| `ADMOB_ANDROID_APP_ID` | `app.config.js`, written into the Android manifest | Google's test application id would ship | `app.config.js` throws on a production build without it |
| `ADMOB_IOS_APP_ID` | `app.config.js` | Reserved; iOS serves no ads today | — |
| `EXPO_PUBLIC_DOMAIN` | `utils/api-host.ts` | Defaults to `casparel.com` | Pinned in `eas.json` |

Build profiles are declared in `eas.json`. The production profile sets
`"environment": "production"`, so an EAS production build reads the
**Production** environment and not Default, Development or Preview.

## Server (`artifacts/api-server`)

| Variable | Consumed by | Absent means |
| --- | --- | --- |
| `REVENUECAT_WEBHOOK_AUTH` | `routes/webhooks.ts` | The webhook answers **503** rather than accepting unauthenticated entitlement writes |
| `DATABASE_URL` | `@workspace/db` | The server does not start |
| `SESSION_SECRET` | `lib/auth.ts` | The server does not start |
| `ADMIN_EMAILS` | `lib/adminAccess.ts` | No account is promoted to administrator on sign-in |
| `SITE_URL` / `APP_URL` / `ALLOWED_ORIGINS` | `app.ts` | Falls back to `casparel.com`; CORS refuses other origins |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` / `_API_KEY` | `lib/integrations-openai-ai-server` | Every AI feature fails; the catalogue, classes, schedules and lists keep working |
| `AI_PUBLIC_PROFILE_SEARCH_ENABLED` | `routes/resources.ts` | Enabled unless set to `"false"`. Production reports **true** |
| `AI_RESOURCE_SEARCH_ENABLED` | `routes/resources.ts` | Disabled unless set to `"true"`. Production reports **false** |
| `DATA_ENCRYPTION_KEY` | `lib/supportEncryption.ts` | Falls back to `SESSION_SECRET` for support-request encryption |
| `RATE_LIMIT_STORE` | `lib/rateLimitStore.ts` | In-memory rate limiting |
| `YOUTUBE_API_KEY`, `YOUTUBE_DAILY_QUOTA` | `lib/openSources.ts` | No YouTube results in the catalogue |
| `CATALOG_REMOTE_SEARCH_ENABLED`, `CATALOG_MAX_ITEMS`, `CATALOG_CONTACT_EMAIL` | `lib/catalog.ts` | Catalogue falls back to stored items |
| `GOOGLE_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` | Google Calendar integration | Calendar sync is unavailable |

There is no server-side RevenueCat API key, and no advertising configuration
on the server at all: entitlement reaches the account through the RevenueCat
webhook, and advertising is decided entirely on the client.

## Advertising identity

`artifacts/app/public/app-ads.txt` and `ads.txt` both declare publisher
`pub-9823563686565987`. `app-ads.txt` is what AdMob crawls for the Android
app, and it is only read if the Play listing's developer website points at
this domain. `ads.txt` is the equivalent for the website itself and is what
AdSense reads. Both must name the same publisher as the AdMob application id
configured in the EAS production environment, which cannot be verified from
outside that environment.
