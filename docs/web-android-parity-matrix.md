# Web → Android parity matrix

This matrix records the production web route baseline at commit
`1ecd8e0d70d5f478f25cf889a2308a598073fc07` and the Android entry that exposes
the same account data and actions. `web-route-parity.test.ts` compares the
declared web routes to the machine-readable inventory in
`artifacts/mobile/utils/web-workspaces.ts`; a future web route without an
Android decision fails the mobile suite.

## Route and action coverage

| Web route / feature | Android entry | Implementation and actions |
| --- | --- | --- |
| `/auth/login`, `/auth/register` | `/login`, `/register` | Native forms use the same generated API, `schoolar_token`, secure storage, show/hide password, validation, registration, account-recovery support link, and canonical BrandMark. Logout clears secure data and the entire query cache. |
| Session restoration | App root | Cached identity makes restart immediate, then `/users/me` refreshes the complete authoritative role/activeRole/profile. Invalid tokens are removed; offline refresh failure keeps the locally restored session. RevenueCat waits for auth restoration before configuration. |
| `/` and `/dashboard` | `/(tabs)` | Installed-app home is a native adaptive dashboard with summary, due work, goals, study, activity, messages, refresh/error states, and the selected student/teacher workspace. |
| `/resources`, `/resources/:id` | Resources tab, `/resource/[id]`; More → Resource studio | Native browse/search/details, save-to-list, credibility/source review and AI discovery/deep review through the same API. The complete submit/edit/delete/review/recommend workflow is reachable in Resource studio. |
| Study tools | Dashboard and `/study`, `/study/[id]` | Native full set list and study session; the former dead `/study` destination now exists. Creation/editing reachable through Activities workspace where the complete web form is retained. |
| `/goals` | `/goals`, `/goals/[id]` | Native list, create/edit/delete, step completion and linked resources. |
| `/lists`, `/lists/:id` | `/lists`, `/lists/[id]` | Native list/create/edit/delete, resource add/remove and details. |
| `/messages` | `/messages`, `/messages/[id]` | Native requests, conversations, send, block/report and error/loading states. |
| `/activities`, `/activities/shared/:token` | More → Activities; `/activities/shared/[token]` | Complete authenticated activity builder/assign/share workflow in the bridged web workspace; shared links have a public Android route. |
| `/canvases`, `/canvases/:id`, `/canvas/shared/:token` | More → Canvases; `/canvas/shared/[token]` | Complete create/edit/share canvas workspace; shared links have a public Android route. |
| `/forum` | More → Community | Complete posts, replies, repost/quote, moderation, block/report and links in the authenticated workspace. |
| `/catalog` | More → Catalog | Complete browse/filter/open/copy flow in the authenticated workspace. |
| `/people`, `/profile/:userId` | More → People | Complete discovery, profile, follow/message/block/report actions in one internal navigation history. |
| `/profile` | Profile tab | Native account/profile/avatar/language/privacy/role mode/usage/sign-out controls. Authoritative `admin` displays Administrator; workspace mode is a separate label. |
| `/settings`, `/reset-account`, `/delete-account` | More → Settings | Complete appearance, integrations, password-protected reset/deletion and account controls. Public deletion remains linked from Support for signed-out users. |
| `/classes`, `/classes/:id` | Classes tab, `/class/[id]`; More → Classroom management | Native invitation responses, join/list/detail and roster overview. The complete create/delete/leave, member role/removal, resource/recommendation, private-note, seating and Google Classroom workflows are reachable in Classroom management and retain same-origin internal navigation. |
| `/schedule` | Schedule tab | Native create/edit/delete, week/day navigation, meeting/external links and calendar subscription. |
| `/plans` | `/paywall` | Native Google Play Billing only: exact Plus/Pro monthly/yearly RevenueCat packages, pending/cancel/error classification and visible Restore Purchases. Admin explicitly sees Administrator plan and no billing requirement. WebView redirects `/plans` here. |
| `/tutorial`, `/guide`, `/support` | More → Getting started, Guide, Support | Full responsive pages and support request form. Support accepts account recovery without inventing a nonexistent password-email flow. |
| Notification bell and browser assignment alerts | More → Notifications; dashboard/classes | The complete notification popover, read state and invitation responses are available through the dashboard workspace; native Due Work, Recent Activity and class invitations keep the phone-first actions on their primary screens. Web AdSense is suppressed inside the Android WebView. |
| `/admin` | More → Administration (admin only) | Complete user management, moderation, verification, support, usage and platform operations. Entry is only rendered for authoritative `role=admin`; active workspace never removes admin access. |
| `/terms`, `/privacy`, `/download`, `/code-signing` | Paywall/Support links | Public canonical pages open in the system browser. Download/signature pages concern obtaining desktop/mobile installers rather than an in-app Android workflow. |
| Unknown route | Native not-found | Accessible error and home action; no dead placeholder control. |

## WebView completeness boundary

The retained web workspaces are the production responsive implementation, not
screenshots or placeholders. The native bridge:

- injects only the current `schoolar_token` on Casparel's origin;
- keeps same-origin links and forms inside the workspace and redirects billing
  to the native Play Billing paywall;
- uses normal WebView upload controls and the existing Android photo/document
  permissions;
- converts authenticated/blob downloads to a cache file and opens Android's
  save/share sheet;
- opens only `http(s)`, `mailto`, and `tel` external schemes;
- consumes Android hardware Back when the web history can go back, otherwise
  lets Expo Router close the screen;
- provides loading, retry, HTTP 5xx and network-error states; and
- preserves labels/accessibility roles on the native wrapper and controls.

## Identity, permission, plan and state matrix

| Account state | Authoritative role | Active workspace | Access/limits | Ads |
| --- | --- | --- | --- | --- |
| Free student | Student | Student | Server Free student capacities | One consented contextual dashboard placement only |
| Free teacher | Teacher | Student or Teacher | Server Free capacities; teacher actions only in Teacher workspace | One consented contextual dashboard placement only |
| Plus | Student/Teacher unchanged | Student or Teacher as permitted | Server Plus limits + RevenueCat Plus | None as soon as either source reports Plus |
| Pro | Student/Teacher unchanged | Student or Teacher as permitted | Server Pro limits + RevenueCat Pro | None as soon as either source reports Pro |
| Administrator in Student workspace | Administrator | Student | Admin routes and server unlimited policy remain; student-mode workspace | Never |
| Administrator in Teacher workspace | Administrator | Teacher | Admin routes and server unlimited policy remain; teacher-mode workspace | Never |

Role switching calls `PATCH /users/me/role`, stores the returned fresh token
and complete user, and clears all cached workspace queries. The database
migration normalizes historical `active_role=admin` rows to Student; the API,
JWT and admin editor now allow only Student or Teacher as an active workspace.

## Subscription and advertising state

- Web Billing and Android both configure RevenueCat with the stable numeric
  Casparel user ID. The server webhook is authenticated, persistently
  idempotent, maps only known entitlements/products, preserves legacy
  `premium` as Pro, and handles purchase, renewal, uncancellation/restoration,
  product change, cancellation, billing issue, expiry and transfer semantics.
- Purchase/restore success updates local RevenueCat state immediately and
  refetches server usage over the bounded webhook delivery window. Ad policy
  requires both RevenueCat and the server to say Free and fails closed while
  either is unknown.
- Android uses UMP before SDK initialization, child-directed treatment,
  general-audience content rating and non-personalized requests. Web requests
  a local privacy choice before loading AdSense and requests non-personalized
  inventory. Production identifiers are environment-only and release checks
  reject missing values or Google's sample IDs.

Actual store/web transactions, live webhook delivery and filled ad requests
still require the external RevenueCat, Stripe, Play Console, AdMob and AdSense
accounts described in the release report; source and fixture coverage is not a
claim that those console tests occurred.
