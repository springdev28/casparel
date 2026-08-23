# Mobile resource-to-learning workflow audit

Last updated: 2026-08-23

## Why this document exists

This is the implementation map for the mobile workflow described in the product specifications. It records what each screen is responsible for, how it connects to the shared API, which runtime states already exist, and what remains before the flow is dependable.

The target journey is:

`Dashboard → Search → Resource detail → Save → Learning list → Path review → Study → Evidence → Dashboard`

The order is intentional. A later screen is not considered complete until the data created by the earlier screen survives a query refetch, sign-in recovery, and an app restart.

## Screen and state matrix

| Step | Current mobile route | Data source | Loading | Empty | Read failure | Write failure | Persistent/idempotent | Motion/accessibility | Priority and gap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Dashboard | `/(tabs)` | `useGetDashboardSummary`, `useGetRecentActivity`, `useGetMe`, `useListLearningGoals` | Skeletons, including path continuation | Recent-activity empty state; no unfinished goal omits the resume card | Retry UI for summary, activity, and goal reads | Not applicable yet | Server-backed; links to Search/Lists/Paths and resumes the latest unfinished path | Shared press/haptic policy plus accessible reduced-motion progress | Implemented for continuation; later validate ranking if users commonly keep several active paths |
| Search/results | `/(tabs)/resources` | `useListResources`, synchronized user preferences, platform-safe local storage, and the oEmbed thumbnail proxy | Restoration plus result skeletons | Search-aware empty state | Result failure is distinct from empty; preference-sync failure preserves local recovery and offers retry | Serialized preference writes avoid out-of-order search state | Query survives navigation/restart locally and account recovery through `resourceSearchState.mobileQuery` | Resource cards use `AnimatedPressable`; clear control is labeled; skeletons honor reduced motion | Implemented for query restoration; richer filters remain a later product decision |
| Resource detail/credibility | `/resource/[id]` (plural alias also exists) | `useGetResource`, `useListResourceReviews`, `useListResourceListMemberships`, `SourceReviewSection` | Page, saved-state, and review skeletons | Invalid, not-found, unsaved, and no-reviews states | Resource, current membership, and review failures are explicit and retryable | Save errors remain inside the Save sheet | Current list membership is server-derived on every mount; historical workflow events are not misused as saved truth | Shared Save success haptic and visible server-confirmed list names | Implemented; device-test long list names and rapid save/reopen |
| Save sheet | Resource-detail modal | `useListResourceLists`, `useCreateResourceList`, `useAddListItem` | List skeletons | Creates the first list inline | Retryable list-read failure | Inline validation and mutation failure | API/database save is race-safe and idempotent; list membership is invalidated before success closes the sheet | Reduced-motion modal, accessible list choices, safe success/error haptics | Implemented; verify keyboard/focus and layout on iOS and mid-range Android |
| Learning lists | `/lists` and `/lists/[id]` | `useListResourceLists`, `useGetResourceList`, `useReorderListItems` | List/detail skeletons | Index and detail empty states | Retryable index/detail failures | Reorder rollback plus visible error | Server-backed, reorder-persistent, and deep-link/auth-return safe | Accessible arrow controls, shared press feedback, reduced-motion skeletons | P2: add list rename/delete only if user research shows it is needed in the core flow |
| Path review | `/lists/[id]/path-review` | `useGetResourceList`, `useCreateLearningGoalFromList` | Review skeletons | Empty list disables confirmation | Retryable list-read failure | Visible create failure and safe retry | Idempotent through `sourceListId`; retries reopen the same goal | Explicit ordered preview, safe success/error haptics | Implemented; device-test long titles and large lists |
| Learning path | `/goals` and `/goals/[id]` | `useListLearningGoals`, `useListLearningEvidence`, `useUpdateLearningGoal` | List/detail skeletons | No-path and no-step states | Goal and evidence reads fail independently with retry | Visible progress-write failure | Step completion, evidence counts, and goal status persist through the API | Accessible bounded progress, reduced-motion timing, safe haptics | Implemented as the resumable bridge into focused study |
| Focused study | `/goals/[id]/study/[stepId]` | Goal state plus an absolute-timestamp local clock | Goal skeleton | Invalid/missing goal-step states | Retryable goal read | Reflection form retains input and reports write stage | Timer survives normal background throttling; durable output is evidence rather than a fake calendar meeting | Accessible timer/progress, radio semantics, safe haptics | Implemented; device-test long backgrounding and OS process termination separately |
| Collaborative session | `/(tabs)/schedule` | Schedule blocks plus study-session API | Combined-feed skeletons and search progress | Confirmed per-day empty state | Total failure blocks the empty state; partial source failure preserves available events under retry; invitee/resource search failures are separate | Inline create/RSVP errors | Server-backed meeting/invitation model | Several one-off pressables/modals remain | Read-state sweep implemented; later align the remaining one-off controls with shared motion primitives |
| Evidence/completion | Focus screen plus evidence badges on `/goals/[id]` | `useCreateLearningEvidence`, `useListLearningEvidence`, `useUpdateLearningGoal` | Goal screen keeps evidence loading non-blocking | Zero evidence shows no false badge | Evidence failure is distinct and retryable | Stable submission key makes save retries converge; partial path update can be retried safely | Goal ownership and path-step membership validated server-side; elapsed time and reflection persist | Explicit choices, accessible alerts, progress and success feedback | Implemented; future recommendation quality still needs live beta evidence |
| Updated dashboard | `/(tabs)` | Dashboard summary, activity, and learning goals | Goal-aware skeleton | No unfinished goal intentionally omits the card | Retryable goal-read banner | Not applicable | Evidence completion invalidates goals; the card advances to the next unfinished step after server reconciliation | Accessible resume label, bounded progress, shared haptic/motion policy | Implemented; recommendation effects still require live beta verification |
| Tutorial | `/tutorial` on web and `/onboarding` on mobile | Validated local/device drafts, user tutorial preference, Resources search state, and server-confirmed list save | Draft restoration indicator on mobile; synchronous local restoration on web | Not applicable; a genuine learning need is required before advancing | Corrupt drafts reset safely; preference/telemetry storage is best-effort and never traps the user | Search and Save own their existing retry UI after handoff | Exact step/input restore; Skip clears the draft; first-run completion is counted only after a real save | Accessible progress; no decorative entry animation; Skip and Profile/Settings replay remain available | Implemented; device-test keyboard, font scaling, screen readers, interruption/restoration, and long learning needs |

## Shared interaction foundation

The implemented interaction foundation is deliberately small and reusable:

- A `MotionProvider` reads the operating-system reduced-motion preference and exposes deterministic durations to the app.
- Motion tokens name intent (`instant`, `quick`, `standard`, `deliberate`) instead of scattering milliseconds through screens.
- `AnimatedPressable` centralizes press feedback, accessibility defaults, and optional haptics.
- Skeletons must stop pulsing when reduced motion is enabled.
- Save success must be triggered only after the server confirms the write; optimistic appearance must not be mistaken for persistence.
- Query-backed screens must render four distinct outcomes: loading, data, genuine empty, and failure with retry.

`ProgressTransition` extends that foundation for path state: it clamps invalid values, exposes an exact accessibility percentage, and uses the same reduced-motion duration policy as other shared motion.

## Error-versus-empty sweep

The P1 audit sweep now treats an empty message as a fact that must come from a successful request. The reusable web `LoadFailure` and native `ErrorState` keep retry UI on screen instead of relying on a disappearing toast.

Covered core and supporting surfaces include:

- web Dashboard totals/activity, Lists, Classes, class assignments/resources/recommendations/rosters/seating, public-list share status, Resource Detail list/class/person pickers, Schedule feeds and selectors, and the admin resource-review queue;
- mobile Dashboard, Resources, Classes, Learning Lists, Learning Paths, Resource Detail, Schedule, Class Detail, Profile, Calendar status, and iCal status;
- stale cached collections remain usable with a warning, while a failed first load cannot render a genuine-empty message.

The repository tests cover the shared collection-state invariant. Device/browser beta execution must still force the failures at visible breakpoints before the release ledger can mark the manual cases `PASS`.

## First vertical slice acceptance checks

The initial `Dashboard → Search → Detail → Save → Learning List` slice is complete only when all of the following are true:

1. A user can enter Resource search from Dashboard and return without losing the query unexpectedly.
2. Search failure never renders as “No results”.
3. An invalid or failed resource detail request has a retryable error state.
4. A user can choose an existing list or create the first list while saving.
5. Repeating or racing the same save does not create duplicate list items.
6. Save success invalidates list queries and remains visible after refetch and app restart.
7. Reduced-motion mode removes scale/pulse transitions without removing meaning or controls.
8. Unsupported haptics never prevent the action or produce an unhandled rejection.

All first-slice persistence paths are now implemented: search restores from local storage first and synchronized account preferences when local state is absent; saved state is read from live list-item membership rather than inferred from an in-memory confirmation or historical workflow event. Restart and second-session behavior still require execution on a real device/test server before the beta ledger can say `PASS`.

## Reviewed-path slice acceptance checks

The `Learning List → Path Review → Learning Path` bridge now provides:

1. Accessible earlier/later controls that optimistically preview order and roll back on a failed write.
2. A review screen that shows the exact server order before any learning goal is created.
3. Idempotent confirmation: repeated taps, retries, and later re-entry resolve to one goal per source list.
4. A persistent Learning Paths index plus an authenticated/deep-link-safe detail route.
5. Step completion that updates the complete `pathSteps` value and derives the goal's `active` or `completed` status.
6. Bounded, accessible progress feedback that respects reduced-motion preferences.
7. A dashboard continuation card that resumes the most recently updated unfinished path at its first incomplete step.

## Focused-study and evidence acceptance checks

The `Learning Path → Focused Study → Evidence → next step` slice now provides:

1. A visible “Study this step” action for every path step and an authenticated/deep-link-safe destination.
2. A 10/25/45-minute focus clock derived from absolute time, so background timer throttling does not invent extra remaining time.
3. Explicit confidence, understanding, reflection, and optional misconception capture tied to the owned goal and exact path step.
4. An idempotent client submission key backed by a `(user_id, client_submission_id)` unique index; preflight duplicates and insert races return the canonical evidence record.
5. Server validation that a submitted step belongs to the caller's learning goal.
6. Convergent completion: if evidence succeeds but the goal update fails, the same submission can be retried without duplicating proof.
7. Evidence badges after query reconciliation, plus a success handoff to the next incomplete step or completed path.

Focused-study evidence is deliberately not stored as a collaborative Study Session. That model requires meeting URLs and invitees; using it for solo work would corrupt the product meaning. The focused timer's durable facts live on learning evidence as `pathStepId`, `studyDurationSeconds`, and `clientSubmissionId`.

## System connections

- Expo Router owns navigation and authentication return paths in `artifacts/mobile/app/_layout.tsx`.
- TanStack Query and the generated hooks in `@workspace/api-client-react` own server state and cache invalidation.
- `lib/api-spec/openapi.yaml` is the API contract. Generated client and Zod files must never be edited by hand.
- Express list behavior lives in `artifacts/api-server/src/routes/lists.ts`.
- Drizzle list persistence lives in `lib/db/src/schema/resourceLists.ts`; any constraint change requires a checked-in migration.
- `GET /resources/{resourceId}/list-memberships` exposes only the caller's current owned/workspace list items, so Resource Detail can distinguish durable saved state from historical workflow completion.
- Mobile search stores an immediate local snapshot and serializes merges into `users/me/preferences.resourceSearchState`; web preserves the mobile-owned field when updating its richer search cache.
- Web and mobile tutorials validate a three-step local draft, teach the complete Find → Verify → Save → Organize → Study → Prove loop, and hand a real learning need to Resources. Mobile root navigation distinguishes a deliberate Profile replay from a deferred deep link, while `SaveResourceSheet` consumes the first-run activation marker only after the API confirms the list save.
- Focused-study persistence lives in `lib/db/src/schema/learningEvidence.ts`; migration `0054_free_gabe_jones.sql` adds optional step/time/retry fields without rewriting older evidence.
- `artifacts/api-server/src/routes/learningEvidence.ts` validates ownership and idempotency before the mobile screen advances goal progress.
- Shared native visuals live in `artifacts/schoolar-edu/src/components/native`; app-specific orchestration remains in `artifacts/mobile`.

## Tutorial activation slice

The deferred tutorial improvement is now implemented without replacing the real product with a simulated walkthrough:

- previews the full “find, verify, save, organize, study, prove” loop;
- offers a short guided first save instead of a passive feature slideshow;
- can be skipped and reopened from Profile;
- restores the user to the exact step they were on;
- avoids decorative entry animation, so reduced-motion users receive the same stable layout;
- uses real UI and data states so the tutorial cannot drift away from the product.

The tutorial owns only the small learning-need draft and the handoff. Resources owns query restoration and results, Resource Detail owns provenance, and the Save sheet owns the server-confirmed activation milestone. Physical-device interruption, keyboard, font-scaling, VoiceOver, and TalkBack execution remain release evidence rather than repository proof.
