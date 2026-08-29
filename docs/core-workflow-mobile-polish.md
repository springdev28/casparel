# Core workflow and mobile polish specification

Status: canonical implementation contract for product workflow and mobile interaction work.

This file mirrors the implementation-specific additions in the Drive documents **02 - Core Resource-to-Learning Workflow Specification** and **07 - Coding Agent Prompts & Execution Playbook**. Coding agents must inspect the current repository before applying it. Existing working behavior and data must be preserved through backwards-compatible changes.

## Product spine

```text
Dashboard
  -> Intent capture
  -> Learning-oriented search results
  -> Resource detail and credibility
  -> Save
  -> Learning List
  -> List-to-Path review
  -> Study session
  -> Evidence and completion
  -> Updated next action
```

Every feature must connect to this chain or clearly state why it belongs elsewhere. Do not optimize feature count.

## Actual learner journey

### 1. Dashboard entry

A new learner sees one primary prompt: **What do you want to learn?** Include a topic field and progressive context chips for level, available time, and preferred format. Do not lead with empty analytics or setup work.

A returning learner sees one **Next action** card with:

- the action;
- its goal, path, or class context;
- estimated effort when known;
- why it is recommended;
- one primary button.

Secondary sections may show due class work, current goals, saved resources, and recent evidence. Completing an action must update the recommendation.

### 2. Intent capture

Use a focused full-screen search on phones. The first field accepts normal language such as “understand electric fields for AP Physics C.” Optional chips reveal language, level, time, format, curriculum, and exclusions without turning search into a form.

On submit, keep the query visible in a compact header. Show immediate loading feedback and permit editing. Restore full query context from history. Expose important inferred assumptions as editable chips.

### 3. Learning-oriented results

Each card needs:

- a meaningful image or honest structured fallback;
- title and source;
- material type;
- language;
- subject and level when known;
- access state;
- a short description of usefulness;
- compact provenance information;
- Save, Check source, and More actions.

The first screenful should contain useful provider and material diversity. Wikipedia may be useful, but should not dominate ordinary learning queries. Search failures must never become empty-result states.

Card tap opens resource detail. Save works without navigation. Check source can open a sheet or the credibility section. Multi-select should appear only after a first save or an explicit Select action.

### 4. Resource detail and credibility

Keep educational fit and source investigation together but clearly separated.

The first section answers:

- What does this teach?
- Who is it for?
- What format and access conditions apply?

The credibility section answers:

- Who published it?
- What evidence was found?
- What are the strengths, limitations, currency, and unknowns?

Quick credibility should be understandable in under 20 seconds. Deep research is explicit and exposes progress, evidence links, failure, stale-evidence, and unknown states. Citation is optional.

On mobile, keep Save and one context-sensitive next action in a sticky action area. Once saved, replace Save with Add to list.

### 5. Save and Learning List creation

A successful save changes the control to Saved, persists state, and opens a compact confirmation sheet with:

- Add to existing list;
- Create learning list;
- Connect to goal or path;
- Done.

Closing the sheet must not undo the save. Creating a list first asks only for a purpose/title. Subject, level, deadline, and time budget are progressive options. The resource is preselected.

Saving and adding must be idempotent. Duplicate taps must not create duplicate data.

### 6. Learning List builder

A Learning List is an ordered learning set, not a folder. Each item shows learning role, rationale, source, preview, and relevant warnings.

Required interactions:

- reorder through drag handles;
- accessible move up/down alternatives;
- edit resource role;
- remove;
- add more resources;
- inspect quality;
- build a learning path.

Quality review checks gaps, duplication, prerequisites, level mismatch, provider concentration, and explanation/practice balance. Recommendations are reviewable and must never silently alter user order.

### 7. List-to-Path review

Do not immediately activate generated work.

1. Confirm outcome, level, time context, and prerequisites.
2. Preview ordered path steps, mapped resources, and suitable activities.
3. Let the learner add, edit, delete, and reorder steps.
4. Activate the reviewed path.

Generation may show honest stages such as mapping concepts, matching resources, and building practice. Do not show invented percentage progress. Failure preserves the list and input context.

Activation creates or links the main goal, records source list/version, and returns the learner to the first actionable step. Repeated submits must not create duplicate paths or goals.

### 8. Study session

Focus on one path step. Show purpose, resource, activity, progress inside the step, and Pause. Avoid full-app navigation competing with study.

Choose the activity according to the material and goal:

- reading or watching;
- active-recall flashcards;
- quiz;
- worked or practice problems;
- explain-back;
- reflection;
- source comparison;
- review checkpoint.

Do not equate opening a resource with learning. Preserve source attribution. Completion records appropriate evidence and offers the next action.

### 9. Completion and return

Completion shows:

- the completed step;
- evidence recorded;
- updated goal progress;
- the next recommended action.

Use brief celebration only for meaningful milestones. If a write fails, restore the incomplete state and explain what did not save. Return sessions reopen at the next action, not an empty generic dashboard.

## Mobile polish contract

“Shiny” means tactile response, clear depth, modern motion, polished state transitions, and intentional loading, empty, error, and success states. It does not mean permanent movement or excessive decoration.

The repository already includes:

- React Native Reanimated 4;
- React Native Gesture Handler;
- Expo Haptics;
- Expo Blur and Glass Effect;
- Expo Linear Gradient;
- Expo Image;
- Expo Symbols.

Use these before adding dependencies.

### Shared primitives

Build or consolidate:

- `MotionProvider`;
- motion-duration and easing tokens;
- `AnimatedPressable`;
- `AnimatedCard`;
- `ProgressTransition`;
- `SuccessFeedback`;
- content-shaped `Skeleton`;
- sheet and modal transitions;
- shared saved-state animation;
- reduced-motion handling.

Prefer the shared design-system/mobile component layer. Avoid one-off animation code copied across screens.

### Motion tokens

| Token    |      Duration | Use                                      |
| -------- | ------------: | ---------------------------------------- |
| instant  |         80 ms | press and release                        |
| quick    |        160 ms | toggles and small state changes          |
| standard |        240 ms | cards, sheets, ordinary transitions      |
| emphasis | 360 to 420 ms | major progress and milestone transitions |

Use springs for direct manipulation, sheet settling, saved-state feedback, and restrained success emphasis. Do not bounce ordinary navigation.

Animate transform and opacity by default. Avoid JS-thread layout loops, animated large blurs, and simultaneous full-screen effects. Target smooth 60 fps on mid-range Android.

### Required micro-feedback

| Interaction          | Required response                                           |
| -------------------- | ----------------------------------------------------------- |
| Tap                  | brief restrained compression or equivalent press state      |
| Save                 | icon morph/fill, Saved label, light haptic, brief highlight |
| Save failure         | reverse optimistic visual state, retain context, Retry      |
| Add to list          | count update and visual confirmation                        |
| Duplicate add        | “Already in this list,” not a generic error                 |
| Reorder              | lifted card, smooth gap movement, release haptic            |
| Path generation      | staged messages and path-shaped skeleton                    |
| Step completion      | pending to confirmed transition, progress update            |
| Loading              | final-content-shaped skeleton, never false empty state      |
| Invalid input        | local explanation; subtle shake is optional                 |
| Network/server error | keep content in place, explain, Retry                       |
| Meaningful milestone | brief glow, progress sweep, or restrained particles         |

Do not trigger confetti for ordinary saves or checkboxes.

### Visual language

Use one recognizable Casparel accent system. A controlled treasure-like gradient or luminous accent may identify primary actions, active progress, and major brand moments. Gradients should not cover every card.

Use clear surface and elevation hierarchy. Blur or glass belongs mainly on navigation, sheets, and overlays where legibility remains strong. Avoid stacks of transparent glass.

Meaningful resource imagery should be prominent. Structured fallbacks must look intentional without pretending to be real previews. Empty states offer one direct action. Success states state what changed. Errors preserve context. Light and dark modes must retain contrast and hierarchy.

### Accessibility and performance

Respect the system Reduce Motion setting. Reduced-motion mode removes parallax, stagger, large scale, and particles while preserving state through fades, icons, colors, and text.

Haptics must be subtle, optional, and absent when unsupported. All drag interactions need non-drag alternatives. Verify keyboard, screen reader labels, safe areas, contrast, and touch-target size.

Measure on mid-range Android hardware. Check dropped frames, long tasks, list virtualization, image loading, screen startup, and memory behavior. Do not accept desktop-simulator smoothness as mobile evidence.

## Implementation phases

### Phase 0: stability

Return main to green. Fix existing failing checks without mixing CI repair with broad visual refactoring.

### Phase 1: shared mobile foundation

Inventory current routes and components. Create or consolidate motion, haptic, loading, error, progress, saved-state, sheet, and reduced-motion primitives.

### Phase 2: shortest canonical slice

Complete Dashboard -> Search -> Detail -> Save -> Learning List with:

- real persistence;
- loading, empty, read-failure, and write-failure states;
- idempotency;
- authorization;
- analytics;
- reload/restart verification.

### Phase 3: list and path

Implement or reconcile Learning List roles, reordering, quality review, list-to-path review, editable steps, activation, provenance, staleness, and idempotency.

### Phase 4: study and evidence

Connect path steps to suitable activities, completion, evidence, goal progress, and next-action updates.

### Phase 5: polish and performance

Add defined transitions, stagger where useful, reordering feedback, progress motion, milestone feedback, preview refinement, theme checks, reduced motion, and real-device performance verification.

Polish is a required product phase, but state correctness comes first.

## Verification contract

For each vertical slice, test:

- successful flow;
- loading;
- genuine empty state;
- read failure;
- write failure;
- duplicate action;
- unauthorized action;
- reload and app restart;
- second session/device persistence;
- analytics;
- reduced motion;
- real mid-range Android performance.

Route rendering is not functional validation. Use a real staging/test database and record evidence.

## Current implementation ledger — 2026-08-23

The current vertical increment closes the highest-risk missing part of the phone journey: a learner can save from a search card or resource detail, keep that state after a query refresh, and immediately add the saved resource to an existing or newly created Learning List.

Implemented in this increment:

- shared `MotionProvider`, named duration tokens, safe haptic helpers, and system Reduce Motion state;
- reduced-motion-aware shared skeleton loading;
- non-navigating Save actions on mobile result cards;
- a sticky Open plus Save/Add-to-list action area on mobile resource detail;
- a compact post-save sheet with list loading, genuine empty, read-failure, create, add, duplicate, retry, success, and close states;
- Turkish coverage and screen-reader labels for the new learner-facing controls;
- server-authoritative, transactionally idempotent library saves and Learning List adds;
- explicit `200` existing versus `201` created API responses and generated client/Zod contracts;
- one Save analytics milestone per newly created library entry, without duplicate-tap inflation;
- concurrent double-tap database regression coverage for both writes;
- a documented cold-CI allowance for the production crawler integration setup.

Verification recorded for this increment:

- workspace library, API, and mobile type-checks passed;
- 59 mobile tests passed;
- 705 API assertions passed across 74 test files; environment-gated tests remained skipped;
- the eight-tap library-save and Learning-List-add regressions passed against the disposable PostgreSQL service in CI, proving each race leaves exactly one row;
- web production build and combined API production build passed;
- Expo release configuration passed;
- production Expo exports passed for iOS (1,673 modules) and Android (1,669 modules), each producing an approximately 6.4 MB Hermes bundle;
- authored-source overview audit and whitespace validation passed.

Still required after these increments:

- verify save, retry, restart persistence, screen-reader behavior, Reduce Motion, and frame performance on real iOS and mid-range Android hardware.

## Current implementation ledger — 2026-08-26

This increment closes the association the previous one was honest about not
having: a saved resource now reaches the goal it is for. A path step can carry
the resource it is about, so the chain from **Save** to **Learning List** to a
goal path is a single continuous flow rather than a save followed by a
navigation that connects nothing.

Implemented in this increment:

- an optional `resourceId` on a learning path step, backwards compatible with every step written before it and carried through the community-path copy and clone;
- `POST /learning-goals/{id}/resources`, server-authoritative and transactionally idempotent, with `201 created` and `200 already linked` responses that name the step;
- resource visibility enforced on the attachment, so a submission still in the review queue cannot be read through a write;
- a real **Connect to a goal** section in the post-save sheet, with loading, genuine empty, read-failure and retry, write-failure and retry, duplicate, and success states;
- a Retry that remembers which write failed, so a failed goal attachment is never retried as an unrelated list add;
- a goal path step that carries a resource opens it, on the phone and on the web;
- one `resource_linked_to_goal` analytics milestone per resource that reaches a path, without duplicate-tap inflation;
- one shared goal-ordering comparator behind the goals screen and the sheet, replacing the screen's private copy;
- Turkish coverage for the ten new learner-facing strings on the phone and the one on the web.

Verification recorded for this increment:

- every package type-checks;
- 756 API assertions passed across 85 test files against a real PostgreSQL instance; one file and five environment-gated tests remained skipped;
- 62 mobile tests passed;
- the eight-tap regression proved the write is idempotent and the path is not lost: two resources attached concurrently both survive, one step each, reported as created once and already-linked seven times. Removing the advisory lock fails it, with seven of eight taps claiming to have created the step;
- ticking a step off through `PATCH /learning-goals/{id}` keeps the resource on it — measured, because the response schema strips what the contract does not declare and this is exactly how the link would have disappeared silently;
- 63 end-to-end flow checks passed against a real server and database, including attach, attach again, read the goal back fresh, and a stranger's attempt;
- 26 authorization probes were refused, including attaching a resource to a goal belonging to another account;
- the catalogue still describes what the server sends;
- web production build passed, and the goals page renders and translates a resource-backed step.

## Agent prompt

Use this file as the product authority. Inspect the latest implementation, schema, API hooks, tests, and design-system components first. Map the current app against the canonical screen chain. Identify the smallest missing vertical slice. Implement it without duplicating existing systems or introducing parallel models. Use existing mobile animation dependencies. Keep sponsored content outside organic search, credibility, Learning Lists/Paths, adaptive recommendations, and teacher recommendations. Report the workflow gap fixed, transitions added, state and persistence behavior, shared primitives used, files/schema changed, tests, real-device evidence, accessibility, performance, analytics, docs updated, and remaining gaps.

## Definition of done

A screen is not complete because it renders or animates. It is complete when the learner understands the next action, taps receive immediate feedback, loading cannot be confused with emptiness, errors preserve context, successful writes persist, navigation maintains the product chain, animation remains smooth, reduced motion works, and light and dark modes feel intentionally designed.

## Current implementation ledger — 2026-08-26 (second increment)

The save sheet could create a Learning List on the phone, and the phone had
nowhere to show one. This increment gives Learning Lists a surface on the
device people study on, and makes the order that surface writes safe to write.

Implemented in this increment:

- a Learning Lists screen and a list screen on the phone, reached from the resources tab;
- accessible reordering: move up and move down per item, named for a screen reader, with no drag required;
- remove an item, and open the resource a row is about;
- optimistic order and removal with the previous state restored and explained when a write fails;
- loading skeletons, genuine empty states, read-failure retry, and a not-found state that does not pretend a list was deleted;
- `POST /lists/{id}/items/reorder` made atomic: the permutation is checked and every position written inside one transaction, in one statement;
- an empty list can be reordered, which previously would have been a SQL syntax error had anything asked;
- one shared `moveItem` helper behind the reorder controls, which never mutates the order it was given — the screen needs the old one to put back;
- Turkish coverage for the eleven new strings.

Verification recorded for this increment:

- every package type-checks;
- 758 API assertions passed across 86 test files against a real PostgreSQL instance;
- 67 mobile tests passed;
- the new order is read back in the order asked for, with positions 0..n rather than rows that merely sort correctly; a short order, a duplicate, and an item belonging to another list are each refused and leave the stored order untouched;
- 69 end-to-end flow checks passed against a real server and database, including add, reorder, read back, and a refused partial order that changed nothing;
- both new screens render in English and Turkish with every control carrying a screen-reader name.

## Current implementation ledger — 2026-08-28

A Learning List becomes a goal path. This is the join between organising and
studying, and it closes the **List-to-Path review** section of this document
for the phone and the web.

Implemented in this increment:

- `POST /lists/{id}/path`: the list's resources, in the list's order, as the steps of a learning goal;
- nothing generated and nothing invented — no AI call, no estimated durations, no percentage — because the learner already chose these resources and put them in this order;
- `learning_goals.source_list_id`, which is both the provenance the specification asks for and the idempotency key: a second attempt returns the goal that exists with `alreadyBuilt`, and eight concurrent taps leave one path;
- the goal outlives the list it came from — deleting the list clears the provenance and keeps the path;
- an empty list is refused rather than becoming a goal with no steps, and only the list's owner can build from it;
- a review sheet on the phone: the steps that will be created, drawn from the list already on screen, with Cancel and Build — the specification's "do not immediately activate generated work", honoured without pretending there is generation to preview;
- the same action on the web list page, and a link on the goal back to the list it came from;
- one analytics milestone per resource that reached the path, written in one statement rather than one per resource;
- a plan-capacity check that refuses a *new* goal at the limit but never blocks opening a path built earlier;
- Turkish coverage for the eight new phone strings and the five new web ones.

Verification recorded for this increment:

- every package type-checks;
- 787 API assertions across 92 test files against a real PostgreSQL instance;
- 67 mobile tests;
- the order, the idempotency (including eight concurrent taps), the refusal of an empty list, the refusal of somebody else's list, and the path surviving its list's deletion are all asserted against a real database;
- 74 end-to-end flow checks against a real server, including building, building again, and a stranger's attempt — and the path following the list's *reordered* order, since the same run reorders it first;
- the phone app renders the list and goal screens in English and Turkish with every new control named for a screen reader;
- the web production build passed.

A trap worth recording: `drizzle-kit generate` stamps the wall clock, and this
repository's migration journal carries timestamps weeks ahead of it, so the
generated entry sorted *behind* the previous one — and Drizzle skips a
migration whose `when` is not greater than the last applied, reporting success
while doing it. The column silently did not exist. `migrationsCanApply.test.ts`
now fails on a journal that is out of order or missing a file.

## Quality review — what it checks, and what it will not

The list builder's **inspect quality** requirement names six things: gaps,
duplication, prerequisites, level mismatch, provider concentration, and
explanation/practice balance.

Three are arithmetic over rows the app already holds, and are implemented in
`artifacts/api-server/src/lib/listQuality.ts`:

| Finding          | When it is reported                                                    |
| ---------------- | ---------------------------------------------------------------------- |
| `one_provider`   | three items or more, and 70% or more share a source family              |
| `one_format`     | three items or more, and every item is the same format                  |
| `duplicate_link` | two items whose canonical URL is identical                              |
| `level_mismatch` | a majority level exists and some items are aimed elsewhere              |
| `no_practice`    | three items or more **labelled**, and none of them labelled practice    |

The last one only became answerable when the learner could answer it. A format
is not a role — the catalogue records what something is, not whether it asks
the reader to do anything — so `list_items.role` is the learner's own note
about the part an item plays: explanation, practice, example or reference. The
check reads only the items somebody labelled: a list with no roles on it is not
a list with nothing to practise on, it is a list nobody has said anything
about, and the two must not read the same.

Gaps and prerequisites remain unimplemented, and must not be invented. They are
claims about a subject that nothing in this product knows; a plausible sentence
about them is invention dressed as advice, on the screen where somebody decides
what to study next.

The endpoint returns facts with their numbers rather than sentences, so each
client phrases them for its own reader; a sentence built on the server could
only ever be in one language. Both screens say which checks were made, so the
absence of a finding is not read as a claim about everything.

## Current implementation ledger — 2026-08-28 (Phase 4, completion and evidence)

Finishing a step is where the product finally learns something. This increment
connects **completion, evidence, goal progress and the next action** — the
first four of Phase 4's five; choosing an activity by material is the one still
open.

Implemented in this increment:

- `POST /learning-goals/{id}/steps/{stepId}/completion`: one step, under the goal's lock, rather than the whole path sent back;
- an optional check-in on the tick — "Not yet", "Almost", "I can", the same three answers and the same confidence/understanding mapping the web dashboard has used since check-ins existed, so a teacher's class signals aggregate across both surfaces;
- the check-in recorded as learning evidence against the step (`learning_evidence.path_step_id`), once: ticking, unticking and ticking again is one piece of evidence, not three;
- nothing invented when the check-in is skipped — a tick with no answer records that the step is done and claims nothing about understanding, because a middling number written on somebody's behalf reaches a teacher's dashboard as something they said;
- unticking leaves the evidence, because a check-in is a record of what somebody said at a moment rather than a property of a step;
- the completion screen the specification asks for: what was recorded, where the goal now stands, and the next step — with its resource one tap away when it has one;
- a persistent "checked in" mark on the goal's steps, so returning to a goal shows what was said and not only what was ticked;
- the same write on the web's goal page, which fixes the same lost update there;
- a `path_step_completed` analytics milestone per step actually finished.

The lost update is worth stating plainly. Both surfaces used to tick a box by
sending the whole `pathSteps` array, so a tick on the phone and a resource
attached on the laptop — or two ticks on two devices — meant whichever wrote
second erased the other's work. The database test finishes two steps
concurrently and requires both to survive; against a whole-array write it fails.

Verification recorded for this increment:

- every package type-checks;
- 802 API assertions across 94 test files against a real PostgreSQL instance;
- 74 mobile tests;
- the check-in written once, kept through an untick, refused when half-given, and two concurrent completions both surviving — all against a real database;
- 84 end-to-end flow checks against a real server, including the check-in appearing exactly once in the learner's own evidence and a stranger who cannot tick somebody else's step;
- the phone renders the goal and check-in screens in English and Turkish with every control named for a screen reader.

## Current implementation ledger — 2026-08-28 (Phase 4, choosing the activity)

The other half of §8, and the last one Phase 4 was waiting on: a step now says
what to *do* with it, not only that it exists. Opening a resource is not
studying, and a path that hands somebody a link and stops has left the decision
— read this, or work through it, or go and find something — to the learner
every single time.

Implemented in this increment:

- `GET /learning-goals/{id}/steps/{stepId}/activity`, which answers with one of five things the product can actually offer: watch, listen, work through, read, or go and find something;
- a decision made from the three facts this product genuinely holds — what the material is, what the learner said it was for, and whether they have a study set in the subject — rather than from a curriculum it does not have;
- the learner's own label beating the catalogue's: a resource they marked as **practice** in the list the path came from is something to work through, whatever format the file is;
- the reason returned alongside the answer, and shown only when it is worth admitting — "you marked this as practice" tells somebody something, "because it is a video" tells them what they can already see;
- the role read only from the list the path was built from, so a role set on the same resource in a different list does not leak into this arrangement of it;
- resource visibility enforced on the read, so a step pointing at a submission still in the review queue reports honestly that there is nothing to open rather than describing material the reader cannot see;
- a **Next** card on the goal screen: the first outstanding step, what it asks for, and one way in — the resource, and the learner's own study set beside it when they have one to revise with;
- both buttons navigating with the id the payload itself carried, so a card cannot draw from one source and move from another;
- Turkish coverage for the nine new learner-facing strings.

What it deliberately does not do is worth stating. The specification lists
eight activity kinds, including explain-back and source comparison. There is no
branch here for either, because nothing in this product produces them, and a
screen that tells somebody to do a thing that is not there is worse than a
screen that says less.

Verification recorded for this increment:

- every package type-checks;
- 807 API assertions across 95 test files against a real PostgreSQL instance; one file and nine environment-gated tests remained skipped;
- 77 mobile tests;
- 86 end-to-end flow checks against a real server and database, covering both branches that matter: a bare step answering "go and find something", and a step with an article on it answering "read it" with the resource the server looked up;
- 26 authorization probes refused, and 21 class-access checks passed;
- the phone renders all fifteen routes in English and Turkish, the goal screen showing the **Next** card with its action, its way in and its revision set in both, and every control named for a screen reader;
- web production build passed.

## Current implementation ledger — 2026-08-28 (Phase 3, a path and the list it came from)

Phase 3 names **provenance and staleness** together, and only the first half
existed: a goal recorded which list it was built from, which was enough to link
back and no help at all once the list moved on. A learner keeps saving into the
list they organised, and the path built from it in September never mentioned
anything added in October. Nothing was wrong, and nothing said so either.

Implemented in this increment:

- `GET /learning-goals/{id}/list-drift`: the resources now in the source list that no step of the path carries, in the list's own order;
- `POST /learning-goals/{id}/steps/from-list`: append exactly those, under the goal's own lock, leaving every existing step as it was — so a finished step stays finished and its check-in stays attached;
- additions only, which is a product decision rather than an omission: a resource taken out of a list still has a step on the path, that step may be finished and carry a check-in a teacher has already read, and withdrawing it because somebody tidied a list would delete the record of work that happened;
- one definition of how a resource becomes a step, now shared by the single attach and the catch-up, because the 200-character truncation in it is load-bearing — a step over the contract's limit fails the response parse *after* the write has landed, so the learner sees an error and gets the step anyway;
- one definition of how the source list is read, shared by the report and the write, so the visibility rule and the ordering cannot differ between what a screen offers and what the write then accepts;
- resource visibility enforced on both, so a submission still in the review queue is neither described nor silently appended;
- a card on the phone's goal screen when there is something to add, with the count in it, and the same decision on the web's list page — where the drift is actually created — as a button beside **Build a learning path**;
- Turkish for the four new phone strings, and three dictionary entries plus two shape rules on the web.

Nothing is stored to make this work, and that is deliberate. The specification
says to record the source list *and version*, and a version integer answers
only "has the list changed" while costing a bump in every write that touches a
list — one forgotten bump and the answer is silently wrong. Comparing what is
actually in each answers "what does the path not have", which is the question a
learner can act on, and it is right in the two cases a counter gets wrong: a
resource added to a list and taken out again is not drift, and a resource the
learner attached to the goal by hand is not missing from it. Both are pinned by
tests.

Verification recorded for this increment:

- every package type-checks;
- 819 API assertions across 97 test files against a real PostgreSQL instance;
- 77 mobile tests;
- against a real database: a path level with its list reports nothing, a list that gains two reports both in list order, catching up appends in that order while the finished step and its single piece of evidence are untouched, a second catch-up adds nothing, a resource removed from the list is not reported and its step is not withdrawn, a stranger is refused both, and a goal never built from a list has nothing to be behind;
- eight simultaneous catch-ups add the new resource once. Removing the advisory lock fails that, with all eight claiming to have added it;
- 90 end-to-end flow checks against a real server, including a path told what its list gained, catching up, catching up again, and a stranger's attempt;
- 26 authorization probes refused, and 21 class-access checks passed;
- the phone renders all fifteen routes in English and Turkish, the goal screen showing the drift card and its button in both;
- the web production build passed and every visible string on it is still translated.

## Fix — a tick that overwrote the path around it

The completion increment built `POST /learning-goals/{id}/steps/{stepId}/completion`
because a learning path is one JSON column, and a client that flips one
`completed` flag and writes the whole array back overwrites everything else
about the path as it was when that client last read it. The phone was moved
onto it and so was the goals page.

The sidebar and the adaptive dashboard were not, and nothing failed. Two of
the three places a step can be ticked on the web still sent the path back
whole, so a tick on the phone and a tick in the sidebar lost one of the two,
and a tick on the dashboard erased a resource the phone had just attached —
the exact defect the endpoint exists to remove, in the exact feature that
removed it.

Both now write through the one-step endpoint, which also means a step
finished from either of them counts as one, since that write is where the
`path_step_completed` milestone is recorded. Renaming, adding, deleting and
reordering steps still send the path whole; those are edits to the path
rather than to one step, and the goals page is the one screen that makes them.

`tickingTouchesOneStep.test.ts` reads the four client files that draw a
tickable box and fails on a `pathSteps.map` with a flipped `completed` inside
it. The distinction it draws is the point: the correct write reads its step
with `pathSteps.find` and sends one flag, and a looser pattern flags the fix
as the defect. Measured by restoring the dashboard's old shape, which fails
it.

## Current implementation ledger — 2026-08-29 (the rest of the path edits)

The tick was moved onto an endpoint that touches one step because a learning
path is one JSON column and a client that rebuilds the array writes the path as
it was when that client last read it. Renaming, adding, deleting and reordering
were left on the whole-array write, with a comment saying that was right for
them. It was not. Each undoes whatever arrived in between — a tick from the
phone, a resource attached from the save sheet, a step brought forward from the
list, which the previous increment had just made easy to do from a second
device.

Implemented in this increment:

- `POST /learning-goals/{id}/steps`, `PATCH` and `DELETE .../steps/{stepId}`, and `POST .../steps/order`: one edit each, all through one locked read-modify-write in the goal's own lane, shared with ticking, attaching a resource and catching up with a list;
- reordering takes step **ids** rather than whole steps, so it cannot carry a stale title or a stale tick back with it;
- a step the caller never saw keeps its place after the ones they arranged, which is what a step appended on another device should do;
- an order naming a step that is not on the path is refused with a 409 rather than applied to the rest, because guessing what the caller meant is how the order they get stops being the order they chose;
- deleting a step keeps any check-in recorded against it, for the same reason unticking does: evidence is what somebody said at a moment, not a property of a step;
- the goals page and the sidebar moved onto all four, with a refused edit pulling server state back so the screen matches what is actually stored.

`pathEditsTouchOneStep.test.ts` replaces the narrower tick guard: it fails on
any `data: { pathSteps: … }` in the four client files that can change a path,
whatever the array is made of — a `.map` with a flag flipped, a spread with one
appended, a `.filter` with one removed. Reading the path is not writing it, so
it looks for the payload key rather than for any mention of the array.

Verification recorded for this increment:

- every package type-checks;
- 836 API assertions across 99 test files against a real PostgreSQL instance;
- four edits to one path at the same moment — a tick, a rename, a delete and an add — all survive. Removing the advisory lock fails that;
- against a real database: adding appends, renaming carries the query with it, reordering keeps a step the caller never named and refuses one that is gone, deleting keeps the check-in, and a stranger can do none of it;
- the guard fails when a whole-path delete is put back on the goals page, and passes when it is not;
- 96 end-to-end flow checks against a real server, including a rename that leaves a tick made a moment earlier on another step;
- 180 page renders clean across four palettes and two widths;
- the web production build passed and every visible string on it is still translated.

## Fix — twelve ways into somebody else's work that nobody was asking about

`e2e-authorization.mjs` is the only thing here that can see a missing
ownership check. A handler that forgets to compare the row's owner against the
caller returns 200 with the right shape and renders fine; the sole way to
notice is to ask for the row as a second account and find that it comes back.
That script is hand-written, and adding an endpoint does not add a probe.

Nothing noticed that it had fallen behind. Seven new ways into a learning goal
— add a step, rename one, delete one, reorder them, tick one, catch up with a
list, read what a step asks for — had arrived since it was written, and it
still asked about the two that existed then. Five more had been missed for
longer: editing an item in somebody's list, reordering their items, adding to
their list, building a goal from it, reviewing its quality, copying and
publishing their study set, answering an RSVP for a session they were not
invited to, and both single-row `.ics` exports.

All twelve are now probed, and all twelve refuse: 45 attempts, nothing of
Ana's reachable, up from 26. No hole was found — every one of these handlers
was already right. What was missing was the evidence, and the difference
matters, because "it was checked when it was written" is not a property
anybody can re-verify next month.

`everyOwnedRouteIsProbed.test.ts` closes the gap the twelve came through. It
reads the contract, takes every method and path under a family of rows that
belong to one account, and requires the script to name it — so an endpoint
added without a probe fails, which is measured by adding one. It cannot tell
whether a probe is a good one; it can tell that nobody thought about an
endpoint at all, which is the state all twelve were in. Two routes are
exempted in writing, each with the reason it is reachable by design.

One thing the probes needed to be worth anything: Ana's list now holds a real
item, and the goal probes name a step that exists. An id that is not there is
refused for the wrong reason — "no such item" rather than "not your list" —
and would pass against a handler that never checks whose list it is.

## Current implementation ledger — 2026-08-29 (the phone can arrange its own path)

§7 asks that a learner add, edit, delete and reorder steps. The web could; the
phone could not, and its empty state said so — "build a path for it on the web
and tick the steps off here", which is a phone app telling somebody to go and
find a laptop. The endpoints for all four now exist, so this is the surface
catching up with them.

Implemented in this increment:

- adding, renaming, removing and reordering steps on the goal screen, each through the endpoint that names one step;
- behind an **Edit steps** mode rather than on every row: studying is what the screen is for, and a tick, an open, a rename field and three rearranging buttons on every step is a screen somebody reads past to find the one thing they came to do;
- reordering by two buttons rather than a drag, matching the Learning List screen — a phone has no room for a drag handle a screen reader can also use, and the polish contract asks for a non-drag alternative regardless;
- reordering sends ids, so what the phone knows about a step's title or tick never travels with a move;
- no optimistic update on any of the four: unlike a tick, none is a control somebody taps repeatedly, and a refused reorder is exactly the case where guessing would leave the screen showing an order that was never saved;
- the rename field reads its value from `onEndEditing` rather than holding a draft, because React Native's blur event carries no text and a held draft is one a rename from another device cannot correct;
- an empty state that no longer sends somebody to a laptop;
- Turkish for the six new strings, and one orphaned translation removed.

The audit had to grow twice to see any of this, and both changes are worth
more than the increment that prompted them. A mode nobody has tapped into
renders none of its controls, so every string and every accessible name behind
one was unchecked: the audit now clicks into the editing mode by `testID` —
by id rather than by name, because the name is translated and finding it would
need the answer the run is checking — and treats the result as its own screen,
compared against its own English.

And `innerText` stops at the edge of an `<input>`. A screen whose content is a
column of text boxes read as a column of blank lines, so the editing mode —
four fields and nothing else — looked empty to a run that was passing it. The
audit now reads placeholders and field values too, which is words somebody
reads and a translation can miss, on every form in the app rather than only
this one.

Verification recorded for this increment:

- every package type-checks;
- 871 API assertions across 100 test files against a real PostgreSQL instance;
- 77 mobile tests;
- 32 screen renders across two languages, including the goal screen with its editing mode open, every control in it named for a screen reader, the three rename fields carrying their step titles and the add field its translated placeholder.

## Fix — a translation check that could not see a wrapped line break

`mobileSpeaksItsLanguages.test.ts` answers "is every string wrapped, and is
every wrapped string translated". It found the strings by matching `t('…')`
with the quote immediately after the bracket, so a long sentence that had been
wrapped — `t(\n  'Open a profile on the web…',\n)` — was not a `t()` call as
far as it was concerned. Two strings were invisible to it, which means a
missing translation in either would have shipped in silence, in every
language. The pattern now allows the whitespace and the trailing comma that
wrapping puts there; the companion check for *unwrapped* English already did.

The blind spot surfaced from the other side. The file checked that every
string a screen asks for is translated, and never that every translation is
still a string some screen asks for — so a key survives the deletion of the
sentence it translates, and the dictionary grows a layer describing an app
that has moved on. One was found by hand: the goal screen's old empty state,
still telling somebody to go and use the web. Seven more were leftovers of an
account-deletion flow that has since been rewritten with different words.

All eight are gone and the check now runs both ways. Two of the nine it first
reported were the wrapped-line-break false positives, which is how that came
to light.

The web dictionary deliberately gets no such check. Its bridge translates
whatever is in the rendered DOM, including strings a third-party component
produced — React Flow's own zoom and minimap labels are in there — so a key
with no match in this repository's source is not evidence of anything.

## Fix — the one listing that grows for as long as somebody studies

Every other listing in this product is bounded by something a person cannot
exceed: goals, lists, canvases and study sets are all capped by a plan, so
however long somebody uses Casparel, reading their lists costs what it cost in
week one. Learning evidence is not. A row is written every time anybody
finishes a step, forever, and `GET /learning-evidence` returned all of them.

The caller that made it matter was the phone's goal screen, which read every
check-in a learner had ever recorded — over whatever connection they were on —
in order to draw "checked in" beside three steps. Its own comment said "one
request for the goal's own evidence", which is what it needed and not what it
was doing.

The listing now takes a `goalId` and a `limit`, defaulting to the newest two
hundred and refusing a limit past five hundred, with an index on
`(user_id, created_at)` so the ordering comes off an index rather than off a
sort of everything the learner has written. Both callers were changed rather
than left on the default: the phone asks for one goal, and the dashboard now
makes two bounded requests instead of one unbounded one — the recent picture
for "the latest check-in anywhere", and a goal-filtered read for the panel
that counts a goal's check-ins and finds the latest one per step. Leaving that
panel on a client-side filter of the newest two hundred would have quietly
under-reported for exactly the learners who have used the product longest,
which is a worse failure than the one being fixed.

The database test writes a year of check-ins across two goals, with the goal
under test written *first* so its rows are the oldest — under a ceiling with
no filter, the newest page would not contain them at all.

The sweep that found it also found sixteen other listings with no limit. The
rest are all bounded in practice by plan capacity or class size, except the
forum's comments on one thread and the two administration listings, which are
recorded here rather than changed: each needs a paging story rather than a
ceiling, and inventing one for a screen nobody is complaining about is not
this increment's work.

Verification recorded for this increment:

- every package type-checks;
- 874 API assertions across 101 test files against a real PostgreSQL instance;
- one goal's evidence returned in full while the general listing stops at two hundred, newest first, and a limit past the cap is refused — all against a real database;
- the migration applies to a database that already had the table, and the index exists afterwards;
- 98 end-to-end flow checks against a real server;
- 32 phone screen renders across two languages, the goal screen still showing its check-in marks;
- 180 page renders clean, the web production build passed, and every visible string on it is still translated.

## Fix — one account, a hundred outbound requests a minute

Everything under `/api` carries the global limiter: a hundred requests a
minute. That is a ceiling on this server's own work, and it is not a ceiling
on what this server does to somebody else's. A handler that fetches a URL the
caller typed turns one account into a hundred outbound requests a minute,
aimed wherever that account chooses, which is a different thing from a hundred
reads of a page here.

`POST /resources/prefetch` is the one route that did that. `fetchPublicText`
is careful about *where* it will go — it re-checks the address at every
redirect hop, which is the bypass that catches naive guards — and says nothing
about how often. `POST /resources` does the same outbound work for the same
form and has always carried the stricter twenty-a-minute limiter; its other
half did not. Measured against a real server: twenty succeed, the next five
are refused.

A sweep of all 117 write routes found 57 without a per-route limiter. Almost
all are right as they are — sign-in and registration are covered more strictly
by their own limiters mounted in `app.ts`, and patching or deleting a row you
own is bounded by how many you own. The eleven that create rows or reach
outward were each read: reposts, likes and votes create rows but are toggles
bounded by how many posts exist, and twenty a minute would refuse a reader
scrolling a feed, so they keep the global ceiling on purpose.

`reachingOutIsLimited.test.ts` holds the rule for the routes that reach an
arbitrary address. Fetching Google's API with a token the account connected is
not one of them: it is bounded by having connected an account, and the address
is not the caller's to choose.

Its first version passed while the limiter was removed. It read the first few
hundred characters of the registration and looked for the word "limiter", and
the comment *explaining* why the limiter was there satisfied it. Comments are
stripped now and only the middleware chain is read — a guard a comment can
satisfy is a guard that describes the code instead of reading it, and the only
reason that was caught is that removing the fix and re-running is part of
adding one here.

## Current implementation ledger — 2026-08-29 (the path controls, driven in a browser)

`audit-live-ui.mjs` is the only check here that drives the real app against a
real server: a page audit answers the API from fixtures, so a button wired to a
route that does not exist renders perfectly. It covered registration, three
pages, sign-out and the two channels a person notices — an uncaught exception,
and an API call that failed behind a screen that looked fine. It did not touch
the core loop this document is about.

It does now. A goal is created, and then adding, ticking, renaming, reordering
and deleting a step all happen through the controls a person uses, in a
browser, with every assertion made against what the server holds afterwards
rather than against what the page draws. A screen that renders the change it
just made optimistically looks identical to one whose write landed.

The rename check is staged the way the defect actually happens, and the first
version of it was worthless. A tick made through the page refreshes the page's
own copy of the path, so a rename straight afterwards writes a copy that is
current and nothing is lost — that version passed with the old whole-array
write put back. What loses a tick is a change this page never saw. The second
tick now goes through the API with nothing telling the page, leaving it holding
a path one tick out of date, and then the rename is made through the form. Put
the whole-array rename back and the check fails; that is the two-device lost
update, caught through a browser rather than argued about.

Two things had to be fixed for any of it to be visible:

- `innerText` stops at the edge of an `<input>`, and the goals page draws every path step as an editable field — so a whole learning path was invisible to this file, which could assert that the page had rendered and never that it had rendered the right steps. It now reads field values and placeholders, the same repair the phone's audit needed and for the same reason.
- "opening a page to read it writes nothing" failed as soon as the audited account had a goal in it. The dashboard decides what to ask you next and stores that question on the account, so the same one appears on your phone. That is the mechanism by which a check-in follows somebody between devices, not an accident, and it happens once per goal. It is recorded as a named exception with that reason. The check had been green because the account was empty, which is a reminder that a read-only rule is only as strong as the state it is asked about.

Verification recorded for this increment:

- every package type-checks;
- 877 API assertions across 102 test files against a real PostgreSQL instance;
- 24 live UI checks against a real server serving the built app, up from 17;
- the rename check fails when the whole-array write is put back and passes when it is not;
- 180 page renders clean, and every visible string on the web is still translated.

## Current implementation ledger — 2026-08-29 (the phone, when nothing answers)

The verification contract asks for read failure alongside the successful flow,
and on the phone nothing had ever drawn one. `audit-languages.mjs` renders every
screen against a stub that always says 200 with a well-formed body — the happy
half, and the only half. Not one error state, offline state or retry in this
app had been rendered by a check. They are translated, because the source scan
reads their strings; they had never been seen.

`audit-failures.mjs` renders the eleven screens that read something, twice: once
with the request never reaching a server, and once with the server answering
500. The app distinguishes those and so does a person — no status means the
connection, a status means our end — so both are asked for.

The rule it holds is the one failure worth this much machinery. A screen that
treats "the request failed" as "there is nothing here" tells somebody their
lists are gone. It renders perfectly, it says a true-sounding sentence, and it
is a lie about the reader's own data. So: when nothing loads, no screen may
show an empty state, and every screen must say that it could not load. The
forbidden phrases are the app's own `Empty` titles rather than a list invented
here, so a new empty state joins the rule by existing.

It runs in Turkish. A failure state falling back to English is the same defect
as any other string doing so, and this is the only run that renders one.

All sixty-six passed on the first run, which is a claim worth less than the
check that backs it — so the lists screen's error branch was disabled and the
run repeated. It reported the screen saying "Henüz öğrenme listesi yok" —
"no learning lists yet" — while every request behind it was failing, which is
exactly the sentence this exists to catch.

Verification recorded for this increment:

- every package type-checks;
- 66 failure-state checks across eleven screens and two ways of not answering, in Turkish;
- the audit fails when one screen's error branch is removed, naming the empty state it wrongly showed;
- 32 screen renders across two languages still clean.

## Fix — a check nothing runs is a file, not a check

The audit scripts are where most of what is actually known about this product
comes from. They are also the easiest thing here to write and then forget to
wire up: the run that proves one works is the author's own terminal, and
nothing afterwards notices its absence. The failure-state audit added an hour
earlier would have been in exactly that state.

`everyAuditRuns.test.ts` requires every script whose first line says it is
meant to be executed to be named in a workflow. It cannot tell whether the
workflow runs on the right branch or with the right server up; it can tell
that nobody wired it in at all, which is the failure that costs the whole
check rather than part of it. Five scripts are exempted in writing, each for
the same kind of reason: they generate committed files, or produce store
images on demand, rather than reporting a pass or a fail.

It found one thing already true and one false alarm, and both were worth
having.

`document-source-files.mjs` was run by nobody. It has a real failure mode —
it exits non-zero when an authored file has no `@fileOverview` header — and
`docs/source-file-index.md` is the map built from those headers, so a file
could arrive without one and the map could drift from the tree with nothing
to say so. It runs in CI now, beside the type check.

The false alarm was `check-release-config.mjs`, which CI runs through
`pnpm --filter @workspace/mobile run check:release` rather than by filename.
A rule that cannot see one of the two normal ways to call something teaches
people to work around it, so the check now reads the package scripts the
workflows invoke as well as the workflows themselves. Getting that wrong
would have been "fixed" by adding a second, redundant way to run a script
that was already running.

## Fix — the phone had no way out of an expired session

Nothing on the phone acted on a 401. An expired or revoked token left somebody
inside the app with every screen showing "You don't have access to this. Your
session may have expired. Sign in again, then retry." above a **Retry** that
could never succeed — and no way to reach the sign-in screen, because the
guard asks whether a token is present and never whether it still works. The
message tells the reader to sign in again and the app gives them nowhere to do
it. In every language. The way out was to delete the app.

The web had exactly this and fixed it; `audit-session.mjs` exists because of
it. The phone was never given the same treatment, and nothing rendered a 401
here, so nothing said so.

The rule for what counts as an ended session now lives in
`@workspace/api-client-react`, which both clients already depend on, and the
web moved onto it. It is worth sharing because the two conditions that keep it
from firing wrongly are easy to get right once and hard to remember twice: a
401 only means "your session ended" if a session was actually sent, and the
credential endpoints answer 401 for a wrong password, which has to go on
saying "email or password is incorrect" rather than bouncing somebody out on
their first typo. Account reset and deletion answer 401 for a wrong *current*
password for the same reason.

Acting on it needed a seam. The query client is created at module scope, above
every provider, so its error handler cannot call a hook or reach the auth
context — and moving the client inside the tree would recreate it on any
re-render above it, throwing away every cached response. So one handler is
registered by the provider that owns the session and called by the client that
finds out first, with the token's presence mirrored where a synchronous
handler can read it: SecureStore is asynchronous and an error handler cannot
wait for it.

It signs out once. Every screen has several queries in flight, so an expired
token arrives as a burst of 401s within a few milliseconds, and without a
guard each one would clear storage, empty the cache and navigate — several
times over, from handlers racing each other.

`audit-failures.mjs` gained a third way of not answering. It asks something
different of this one: not that the screen says the right words, but that the
app leaves. All eleven screens now land on sign-in; with the ejection removed,
all eleven stay where they were, showing the sentence that has no way to act
on it.

Verification recorded for this increment:

- every package type-checks;
- 904 API assertions across 103 test files against a real PostgreSQL instance;
- 88 mobile tests, including the rule's four must-not-eject cases and the burst of failures signing out once;
- 77 failure-state checks across eleven screens and three ways of not answering, which fail when the ejection is removed;
- the web's own session audit still passes on the shared rule, and 24 live UI checks against a real server.

## Fix — still waiting is not the same as having nothing

The failure audit gained a fourth condition, and it is the one that comes
first in time. The server has not answered yet: nothing has failed, so a
screen that has reached for its empty state has jumped to a conclusion.
"No learning goals yet" while the request is still in flight is the same lie
as showing it after the request failed, a second or two earlier. The web has
checked this since a library screen painted "Your library is empty" during
load.

Every screen on the phone was already right, which is the useful outcome
rather than a disappointing one — the point of asking is that nobody had.
Proved by disabling the goals screen's loading branch and running it again:
it reported the screen deciding, while a request was still open, that the
learner had no goals.

The condition is the same machinery as the other three, so the audit now
covers what a screen says while waiting, when the connection fails, when the
server breaks and when the session is rejected — the four states the
verification contract asks about that a run against a healthy stub can never
reach.

## Fix — two more screens nobody had ever looked at

A sheet nobody has opened renders none of its words, so the same gap that hid
the goal screen's editing mode hid two more surfaces, and both are places the
specification is specific about.

The **check-in sheet** is where a learner says what they can now do — the write
the whole of §8 exists for, and the one that becomes evidence a teacher reads.
Its three answers and its completion screen are a table of English translated
where they are rendered, so the source scan sees the strings and nothing had
drawn them.

The **path preview** is the review before a path exists. "Do not immediately
activate generated work" is the specification's instruction and this sheet is
where somebody decides; every word on it, including the two that name the
decision, had never been rendered either.

Both are opened now, by the same mechanism as the editing mode: by id where
there is one, and otherwise by a label that is data rather than copy — a
step's own title, which the stub supplies and no dictionary translates. Never
by a translated name, because finding it would need the answer the run is
checking.

Both render correctly in both languages, and every control in them has a name
a screen reader can read. That is what those earlier increments claimed on the
strength of a source scan; it is now what a browser has shown.

## Current implementation ledger — 2026-08-29 (asking for everything, once)

The harnesses here are written flow by flow — register, save, organise, study
— which is the right shape for checking that a feature works and leaves
whatever nobody wrote a flow for completely unasked. That matters more than it
sounds: every response goes through its generated schema before it is sent, so
a handler whose response no longer matches the contract answers 500, and a
handler that forgets a null check does the same. Neither shows up anywhere
until somebody opens that screen.

`e2e-read-sweep.mjs` reads openapi.yaml, takes every GET in it, fills the
parameters from rows the run creates, and asks for all of them. The bar is
deliberately low and absolute: no endpoint may answer 5xx. A 403 or a 404 is a
fine answer to a question this account has no business asking; a 500 is the
server saying it broke.

Reading the contract rather than a list kept in the script is the point. A
list would be exactly as stale as the flows it was meant to backstop, and a
new endpoint joins the sweep by being added to the contract — which it has to
be anyway, because `contractDescribesEveryRoute.test.ts` says so.

Fifty-five endpoints, none of them broken. Seven are skipped in writing, all
for the same reason: they end at Google, or fetch a third-party page, so a
failure would be somebody else's outage rather than ours.

Each is asked as somebody it is meant for, which took a second pass to get
right. The first version asked everything as one learner, so the eight reads
behind a class — roster, seating chart, invitations, join code, shared
resources, recommendations, student goals — answered 403 against an id that
did not exist, and the administration overview and the teacher's learning
signals did the same. Ten endpoints were being asked about and proving
nothing: a role gate answering is not the handler behind it running. The
sweep now bootstraps a teacher with a class of their own and reads those as
the teacher, and the administration overview as the administrator. Without an
allowlisted address it says so and carries on as a learner, rather than
reporting a guard as coverage.

Two things about the sweep are worth recording, because the first version of
it was weaker than it looked.

Its fixtures were wrong twice, and the server was right both times: a study
set of one card is refused because a set needs two, and a study session is a
meeting so it needs somewhere to meet. Those are rules, not failures, and a
sweep that treats a 400 as "could not set up" rather than as an answer would
have quietly stopped exercising two handlers.

And it did not catch a schema mismatch introduced on purpose. A listing that
returns `[]` parses its item schema zero times, so the broken shape sailed
through — the sweep was measuring the router, not the handler. It now creates
a check-in, a review and a forum post so the listings have rows in them, and
with those the same deliberate break is caught as a 500.

Verification recorded for this increment:

- every package type-checks;
- 905 API assertions across 103 test files against a real PostgreSQL instance;
- 55 readable endpoints asked for against a real server, none answering 5xx;
- the sweep fails on a response shape that no longer matches its contract, once the listing it belongs to has a row in it;
- 98 end-to-end flow checks, 45 authorization probes refused, 21 class-access checks.

## Fix — the web goal card could not say where it came from

An earlier ledger entry claimed a link on the goal back to the list it came
from, for the phone and the web. Only the phone had one. `sourceListId` never
appeared anywhere in the web app, so a learner looking at their goals on a
laptop could not tell which had been built from organising and which had been
typed — on one of the two screens that show goals.

It is there now, with the same words the phone uses. The audit fixture's goal
carried `sourceListId: null`, which is why nothing noticed: a line that
renders on no page passes every check by never being reached. The fixture now
points at the list the same fixture set already has, so the link is drawn,
followed to `/lists/44`, and read in both languages by the runs that were
already there.

## Current implementation ledger — 2026-08-29 (Phase 5, motion that can be turned off)

Phase 5 asks for reduced motion among other things, and the machinery for it
was already here and already tested: `MotionContext` reads the system setting,
`durationForMotion` turns it into a duration of zero, and
`MOTION_DURATION` holds the four canonical lengths the specification names.

Neither was used where this app actually animates. Onboarding and the paywall
held seven staggered fade-ins between them, every one written as
`.duration(450)` or `.duration(500)` with a hand-written delay, and not one of
them asked what the reader had turned on. The tokens were right, the helper
was right, the context was wired into the tree, and the two screens that
animate went their own way — including using durations that are not in the
token set at all.

Reduce Motion is not a preference about decoration. For some people motion
causes nausea or migraine, and an app that ignores the setting is one they
close.

Implemented in this increment:

- `entranceTiming(reduceMotion, index, token)`, which gives an entrance its duration and its place in the sequence, and returns zero for both when Reduce Motion is on;
- the stagger removed as well as the fade, because a sequence of instant appearances arriving ninety milliseconds apart is still movement across a screen — it is the thing being asked about, drawn without the fade;
- all seven animations on both screens routed through it, so they now use the canonical 400ms rather than an invented 450 or 500;
- `motionRespectsTheSetting.test.ts`, which fails on any literal duration or delay written into an animation in a screen or component. A value from the context reads `.duration(timing.duration)` and does not match; the number is the problem, not the call. `.delay(0)` is allowed, because zero is exactly what Reduce Motion asks for and writing it plainly is clearer than routing it through a helper.

What this increment does not claim: how any of it feels. There is no device
here, and a fade cannot be measured by rendering a screen and reading its
text. What is measured is that the timings come from the setting, that the
screens still render in both languages, and that the guard fails when a fixed
duration is put back.

Verification recorded for this increment:

- every package type-checks;
- 907 API assertions across 104 test files against a real PostgreSQL instance;
- 91 mobile tests, including both halves of the entrance rule going to zero;
- the guard fails when one animation is returned to a fixed 500ms;
- 36 screen renders across two languages, and 99 failure-state checks, both unchanged.

## Fix — two people editing one set of cards, and one of them losing it

A study set is one jsonb document, and two accounts can edit it: its owner,
and the teacher of the class it was shared into. One person on two devices is
the same shape. Every save replaced the whole document with no check on what
it was replacing, so the second one overwrote the first and neither was told.
What is lost is the cards a learner revises from.

This is the last of the lost updates. Learning paths were moved onto one
endpoint per edit; canvases have carried a version since they gained
collaborators. Study sets had neither, and are the one remaining document two
people can hold at once.

A save now carries the `expectedVersion` it was made from, and a save made
from a version that has since moved is refused. **Refused, not merged**: two
sets of cards cannot be combined without inventing an order nobody chose. And
refused rather than silently resolved in the other direction — the canvas
takes the newer document and replaces the unsaved view, which is right for a
canvas that autosaves every eight hundred milliseconds and wrong for a form
somebody has been filling in. Here the editor stays open with their own words
in it, the version moves to the one the server handed back, and pressing Save
again is a deliberate decision to write over what is now there.

A save with no version at all is refused too, rather than treated as "just
write it". A write that cannot say what it was made from is exactly the write
this exists to stop.

One thing found on the way: the activities page keeps its own hand-written
picture of a study set, because it talks to the API through `fetch` rather
than the generated hooks. That is a second description of a shape the contract
already defines, and it had to be edited by hand to learn about `version`.
Recorded in the file rather than fixed — moving that page onto the generated
client is a change with its own risks and is not this increment's work.

Verification recorded for this increment:

- every package type-checks;
- 909 API assertions across 105 test files against a real PostgreSQL instance;
- against a real database: the first save lands and moves the version, the second is refused with the current set attached, the row still holds the first person's cards, saving again from the version just handed back works, and a save with no version writes nothing;
- removing the version check makes that test fail, with the second save landing over the first;
- 99 end-to-end flow checks against a real server, including the conflict;
- 24 live UI checks, 180 page renders clean, and every visible string on the web still translated.

## Current implementation ledger — 2026-08-29 (the release record: second device, and the numbers)

The last item on the list above, other than real hardware, was second-device
persistence and analytics evidence. Both are now recorded rather than assumed.

**Second device.** Every write that two people can make at once has a test
that makes them at once, against a real database, and requires both to
survive:

- four edits to one learning path arriving together — a tick, a rename, a delete and an add — all present afterwards, and none of them there when the goal's advisory lock is removed;
- eight simultaneous catch-ups with a Learning List adding the new resource once, and eight times without the lock;
- eight concurrent attachments of two different resources leaving one step each;
- two study-set saves from the same version, the second refused with the current set attached rather than written over the first;
- and through a browser, a rename made on the goals page while a tick arrived from elsewhere, with the tick still there afterwards — the two-device lost update driven through the controls a person uses.

**Analytics.** Ten workflow milestones are recorded across twenty-three call
sites, and nothing had ever read one back. They cannot be checked by a unit
test — `recordWorkflowEvent` returns early when `NODE_ENV` is "test", so a
suite would assert on writes that never happen — which is why the gap
survived: the only place they exist is a run against a real server.

The end-to-end flow now saves a resource into a list, opens it, and runs the
free source check, then reads the administration overview before and after and
requires the three milestones to have moved by exactly one each. It also opens
the resource a second time and requires the count *not* to move, which is the
"without duplicate-tap inflation" claim that had been made and never checked.

Two things were learned by breaking it on purpose. Disabling the milestone on
adding to a list changed nothing, because the workflow view backfills
`resource_saved` when the item is in a list and the event is missing — a
self-heal nobody had written down. Disabling `resource_viewed`, which has no
backfill, fails the check immediately.

And the naming is worth recording: `resource_reviewed` is the *source
credibility check*, not a rating. The screen calls that step "Verify source",
and writing a review records nothing. A first pass at this check asserted the
wrong one and reported a defect that was not there.

Verification recorded for this increment:

- 102 end-to-end flow checks against a real server, including the three milestones moving by one and not moving on a second visit;
- the check fails when `resource_viewed` stops being recorded;
- everything else in the repository green at the same commit: every package type-checks, 909 API assertions across 105 files, 91 mobile tests, 9 fixture-based web audits, 24 live UI checks, 36 phone renders across two languages, 99 phone failure-state checks, 63 phone checks against a real server, 55 readable endpoints, 45 authorization probes refused, and 21 class-access checks.

## Fix — four web pages that claimed emptiness they could not know

The phone's failure audit found nothing to fix, because the phone's screens
were already right. Pointing the same question at the web found four pages
that were not.

`audit-offline.mjs` had covered five pages and one way of failing since it was
written, and the app grew past it. Learning Lists, study sets and canvases each
say "you have none of these", and each arrived after that list was fixed. So:

- **/lists** said "No lists yet — Create your first list to start organizing resources." while every request behind it was failing;
- **/activities** said "No study activities yet". It showed a toast first, which is worse than nothing: the toast goes away and the sentence stays;
- **/canvases** offered "Start with a blank canvas", inviting somebody to begin again on a page that never learned what they already had;
- **the library** said "Your library is empty" — the sentence `audit-loading.mjs` exists because of, in the one state that file does not cover.

All four now render the shared failure block with a retry.

The library needed one more thing. Its query is gated on being signed in, and
that comes from `/users/me`, so a failed identity call left the library query
disabled — reporting neither data nor an error of its own, and falling through
to the empty state. A 401 there is an answer: nobody is signed in, and the
public catalogue is the right page. Anything else is the question going
unanswered, and the page now says so rather than guessing.

The audit itself was broadened twice over: the four pages above, and a second
way of not answering. Nothing came back at all, and something came back saying
the server broke, are different branches of the failure block, and only the
first had ever been rendered here. Both are asked for now, on nine pages.

`/resources` is asked for as `?view=library`, because that page opens on the
public catalogue search — which is the same page for a signed-out visitor and
has nothing to be wrong about. The library half is the half that makes a claim
about the reader.

Verification recorded for this increment:

- every package type-checks;
- 36 offline and broken-server checks across nine pages, up from 10 across five;
- the four failures were found by the audit before the fixes and pass after them;
- 180 page renders clean, 122 pages reachable, every visible string still translated, sessions still behave correctly, and 24 live UI checks against a real server.

## Fix — and what the web says while it is still asking

The same third condition the phone's audit gained: the server has not answered
yet. Nothing has failed, so a page that has reached its empty state has jumped
to a conclusion — "No lists yet" while the request is in flight is the same
claim as showing it after the request failed, a second or two earlier.

Every one of the nine pages was already right, which is the useful outcome:
the four fixed an hour ago were wrong about *failure*, not about waiting, and
this says so rather than leaving it assumed. Proved by disabling the Learning
Lists page's loading branch, which reported it deciding the reader had no
lists while a request was still open.

The sentences it looks for are curated rather than scraped. On the web they
are written into each page and sit beside phrases that are legitimately about
nothing — "No named author or institution" is a credibility label, "No reason
recorded." is a moderation field — so a list taken from the source would
report both as claims about the reader. The phone could derive its list
because every empty state there goes through one `Empty` component; the web
has no such seam, and pretending otherwise would make the check noisy enough
to ignore.

The web audit now asks three questions of nine pages: what a page says while
waiting, when nothing reaches the server, and when the server answers 500.
Sixty-three checks, from ten.

## Fix — two detail pages that said a thing was gone when it was merely unreachable

"Not found" is the sharpest sentence either of these pages can say, and the
only one that sends somebody away for good. A learning list that could not be
fetched has not been deleted; a resource that timed out still exists. Being
told otherwise is worse than being told nothing, because the reader goes and
makes another one.

`/lists/44` and `/resources/101` both said it, in both failure modes. They now
distinguish the answer from the absence of one: a 404 or a 403 still says "not
found", and anything else says the request failed, with a retry.

A third thing came out of adding them, and the first account of it here was
wrong in a way worth correcting rather than quietly editing. The Learning List
page read `drift.data?.added.length` — one optional chain where two would be
safer — and the page threw during render, so the whole screen became the error
boundary.

That is not a production defect, and this file said it was. In production the
contract guarantees `added`, and a failed request leaves `data` undefined so
the single chain short-circuits correctly. What actually happened is that the
drift endpoint had no fixture, and the audit harness answers an unmapped
endpoint with `200 []` — a deliberate choice, since most unmapped endpoints
are collections. An array has no `added`, so the second dereference threw.
A harness artefact, not something a reader could hit.

Both changes stay: the fixture, because an endpoint the audit cannot answer is
an endpoint it cannot check, and the second optional chain, because it is free
and correct against a partial body. What is not claimed any more is that a
learner could have seen it.

Verification recorded for this increment:

- every package type-checks;
- 77 checks across eleven pages and three conditions, up from 63 across nine;
- driven directly: a genuine 404 still says "not found" on both pages, and a 500 says it could not load;
- and a fourth condition since: everything working except the one read a page is about, which is the ordinary failure rather than the tidy one. A page that returns early when *nothing* loaded will carry on rendering when only one thing did not, and that is the state the render error above appeared in. Eleven pages, nine of them with a primary read worth naming;
- 180 page renders clean, 122 pages reachable, every visible string still translated, sessions correct, 24 live UI checks, 102 end-to-end checks and 55 readable endpoints against freshly started servers.

## Fix — an endpoint the harness cannot answer is one no audit can check

The page audit answered an unmapped endpoint with `200 []` and printed a note
saying so. A note is what nothing acts on, which is the shape of every other
gap found tonight.

The empty array is a deliberate choice — most unmapped endpoints are
collections and most components tolerate an empty one — and its cost is that
the panel reading it renders a shape the contract never produces. One of them
put a page into its error boundary for a whole audit run, and the run reported
"clean" underneath a line nobody had read.

It fails now. The fix is one line in `audit-fixtures.mjs`, and writing it is
what makes that page's panel checkable at all. Measured by removing the drift
fixture: the run reports the missing endpoint by name and exits non-zero,
where before it said all 180 renders were clean.

Nothing in the current fixture set is unmapped, so this costs nothing today
and refuses to let the next endpoint arrive unchecked.

## Fix — five screens the phone audit had only ever rendered empty

The mobile language audit answers requests it recognises and returns `[]` for
everything else. Nothing said which endpoints fell into "everything else", so
nothing noticed that nine of them did: `/classes`, `/class-invitations`,
`/schedule`, `/study-sessions`, `/assignments/today`, `/activity/recent`,
`/direct-messages/conversations`, `/resources` and `/library`.

That is not a small gap. Five tabs — classes, schedule, resources, messages,
and the dashboard's panels — had been rendered in both languages on every run
of this audit, and every one of them had been rendered with nothing in it. A
screen with no rows draws no row. Every string that only exists next to data
had never been drawn at all, in either language, by any check in this repo.

The audit now records the paths it did not recognise and fails naming them,
which is what turns "most unmapped endpoints are collections" from a silent
default into a decision somebody makes on purpose. Then the nine stubs, which
is the work: the conversation stub had to be written to the real contract
shape — `firstUserId`, `requestedById`, `other`, `lastMessage`, `unreadCount`
— because the first guess sent the messages screen to its error boundary,
which is the audit doing its job on the stub rather than on the app.

Populated, the five screens showed five strings that were English in Turkish:

- `{n} member{n !== 1 ? 's' : ''}` and `{n} invited` and
  `{n} pending invitation{...}` — a count with an English noun stuck to it;
- `{session.durationMinutes} minutes`;
- `{level.charAt(0).toUpperCase() + level.slice(1)} trust`, which capitalises
  an API value and glues a noun to it. That one is now a `trustLabel(level, t)`
  with four `t()` calls, so the choice is in one place and the strings are
  literals the translation checks can see.

None of the three checks that already exist could have found these. The source
scan reads string literals and full sentences, and `member` is neither. The
render comparison passes because the rest of the page differs in Turkish. The
failure audit renders these screens with no data by design. They are only
visible when a screen has rows, in a language that is not English.

So a fourth check: a lowercase word sitting between `}` and either `</Text>` or
another `{`. That shape is a count and its noun, and it is a shape a script can
find. The rule is deliberately blunt — a nine-word keyword list keeps
`} finally {` out — and it may only span spaces and tabs, never a newline:
allowing newlines reads the first word of the next statement, and reported
`const` from a `const { done } = ...` three lines below an early return.

Verification recorded for this increment:

- proved by reverting: with `{n} invited` and the `trust` badge put back, the
  new scan names both by file and line; restored, six tests pass;
- 36 screen renders across two languages, no unrecognised endpoint left;
- 99 checks across eleven screens and four ways of not answering;
- mobile 91 tests, api-server 844, every package type-checks.

## Fix — three phone screens nothing had ever drawn, and what two of them said

The mobile audits carry hand-written lists of routes. Both lists named every
tab, which is why they looked complete, and neither named anything a tab leads
to. Three screens had therefore never been rendered by anything, in either
language, in any state:

- `messages/[id]`, where a person reads and writes a conversation;
- `class/[id]`, a roster and a seating chart;
- `resource/[id]`, a catalogue entry with its reviews and the control that
  puts it in a library.

Rendered against a stubbed server all three come up. Rendered against a server
that will not answer, two of them lie:

    a class [offline]           showed "Sınıf bulunamadı"      (Class not found)
    a catalogue entry [broken]  showed "Kaynak bulunamadı"     (Resource not found)

Both screens had one branch for "the row is gone" and "the request failed".
A phone on a train was told the class had been deleted — which reads as *your
teacher removed you*, offers nothing to do about it, and is wrong. The goal
and list screens had been fixed for this months ago; these two were never
looked at because nothing had ever put them in front of a broken server.

Each now separates `isError && data === undefined` from `!data`, and draws the
same `ErrorState` — with the reason and a Retry — that the rest of the app
draws.

The lists that let this happen are now held against the app directory and
against each other. `everyPhoneScreenIsRendered.test.ts` reads `app/`, turns
each route file into the address Expo Router serves it at, and requires the
language audit to name it; then requires the failure audit to name everything
the language audit does. A screen may still sit out either run — the paywall
reads nothing from this server, its plans and tier come from the store SDK —
but it has to be written down in `SKIPS` with the reason, so an omission is a
decision on the screen rather than a list falling behind.

Verification recorded for this increment:

- proved by reverting: removing `/resource/101` from the language audit names
  `/resource/{id}`; removing `/class/31` from the failure audit names
  `/class/31`; restored, both pass;
- proved by driving: before the fix, four checks failed naming the two
  screens and the two conditions; after, 126 checks across fourteen screens
  and four ways of not answering pass;
- 44 screen renders across two languages, up from 36;
- mobile 91 tests, api-server 846, every package type-checks.

## Fix — the two pages a person reaches without an account

`auditsCoverTheSamePages.test.ts` held the browser audits against each other
and against the router, in one direction: an audit may not name a page the
router does not serve. The other direction was never asked. Two routes had
therefore never been opened by anything:

    /canvas/shared/:token
    /activities/shared/:token

These are the share links. Somebody sends one, and the page that opens is the
whole of what Casparel is to the person who clicked — often signed out, often
on a phone, often before they have an account. Nothing had ever rendered
either one.

Opening them, and giving the canvas fixture a board with cards on it (it was
`{ nodes: [], edges: [] }`, so every canvas ever audited was an empty one),
found four things:

- **"There are no cards here yet." was English in every language.** It is the
  `else` of a `canEdit` branch, so an owner never sees it and a populated
  board never reaches it. Only a viewer of an empty shared board does, and no
  run had ever been one.
- **Four form fields on a canvas card had no accessible name** — the note and
  heading textareas and the link input. A screen-reader user editing a card
  heard "edit text, blank". The title input had `aria-label` already; these
  had only placeholders, which disappear when you type.
- **Every card on a shared board was exposed to the translation bridge.** The
  read-only `<h3>`, `<p>` and link were unmarked, so a card titled "Answer" or
  "Match" would be rewritten into Turkish — the bug this bridge's user-content
  audit exists to prevent, on a page that audit had never opened. Proved by
  reverting: six markers unprotected on the shared board, none once marked.
- **A connector announced itself as "Edge from n1 to n2"** — React Flow's
  default: two internal ids, in English, and the only thing a screen reader
  can say about a line. It now names the two cards it joins, through a
  SHAPE_RULE, because the titles in the middle are somebody's own words and no
  dictionary key could ever match them.

The guard is the missing direction: every route `App.tsx` declares is opened
by some browser audit, or named in `NOT_OPENED` with a reason. Proved by
reverting — with the share links removed from the page lists, it names both.

Verification recorded for this increment:

- 189 page renders clean, up from 186;
- every visible string translated across 146 page comparisons, up from 144;
- 190 user-content renders across 27 pages, all protected, up from 175 across
  25 — and the six that were not, before the fix, named by file and element;
- 95 offline checks, the loading audit, api-server 847 tests, both packages
  type-check.

## Fix — thirteen panels that had only ever been rendered with nothing in them

`audit-fixtures.mjs` answered thirteen endpoints with `[]`:

    /forum/posts            /forum/materials        /learning-evidence
    /assignments/today      /workflow/continue      /activity/recent
    /resources/101/reviews  /study-sessions         /class-invitations
    /lists/shared           /classes/31/invitations
    /classes/31/student-goals   /classes/31/resource-recommendations

Each is a whole panel. Every audit — render, translation, user content, text
fit, offline — has opened those pages on every build for as long as they have
existed, and has never seen a row in any of them. The markup that draws a row,
the strings on it, the names a screen reader reads and the user's own words
inside it were checked by nothing at all.

Giving each fixture something to return found, in one pass:

- **52 strings a Turkish reader saw in English.** The forum's Posted by,
  Upvote, Repost, Quote, views and votes; the catalogue's Approved by, Sources,
  Like and Report material; the schedule's Study Sessions, Accept, Decline and
  a pending-session count; the dashboard's "Your next class tasks, ordered by
  deadline", Enable alerts and Due; the whole continue-studying strip; a
  class's Pending invitations, invited as, Awaiting response, Recommended by
  and Approve.
- **Seven counted phrases split across two text nodes.** `{n} views`,
  `{n} steps`, `{n} min`, `{n} due soon`, `{n} in progress`,
  `{n} pending study session`, `{a}/{b} steps` — written in JSX, so the number
  went into one text node and the noun into another, and no rule could ever
  see the pair. A rule matches a string; there was no string.
- **Eight places where somebody's own words were exposed to the translation
  bridge**: a class name on the dashboard, a reviewer's name and their review,
  a material's title, description, unit and topic, an uploader's and an
  approving teacher's name, a survey's options, a post's tags, a source URL, an
  invitee, a recommender and their note. Any of them would have been rewritten
  the day it matched a dictionary entry — which for a tag like "class" or an
  option like "Match" is the first day.
- **A date field with no accessible name** in a teacher's list of student
  goals: a column of identical date inputs, each announcing nothing.
- **A rule in the render audit that could not see a time range.** `17:00–18:00`
  was reported as prose the first time anything rendered a study session:
  JSX splits it into three text nodes, so the dash arrives with no characters
  either side and the rule that excuses closed-up ranges cannot tell it is
  one. It reads the line now, not the node.

And one skip that had gone stale: `/catalog` was excused from the user-content
audit because it "renders nothing a user typed". That was true only because
the fixture behind it was an empty array. A skip is a claim about a page; that
one was a claim about a fixture.

The guard is that an empty collection now has to be a decision. A fixture that
answers `[]` fails unless it is named in `EMPTY_ON_PURPOSE` with the reason
the empty state is the one worth rendering. Proved by reverting: empty the
forum's posts again and it names `/api/forum/posts`.

Verification recorded for this increment:

- 189 page renders clean; every visible string translated across 146 page
  comparisons; 230 user-content renders across 28 pages, all protected, up
  from 175 across 25; 192 text-fit renders; 122 pages reachable; 95 offline
  checks; the loading audit;
- proved by reverting, three times: the empty-fixture guard names the endpoint
  it lost, the user-content audit names the six exposed markers on a shared
  board, and the dash rule reports the range again when it reads the node
  instead of the line;
- api-server 848 tests, both packages type-check.

## Fix — the report behind a button, and a report nobody could read past

Two smaller things, both about what a run actually draws.

**The source review on the phone.** Every word of it — the trust badge, the
strengths, the concerns, the limitations, the mentions, the reasoning — is
behind a button, so a run that loads pages draws none of it. The badge read
`level.charAt(0).toUpperCase() + level.slice(1) + " trust"`, which is how
"High trust" stayed English on an otherwise Turkish screen; that was fixed
when the source scan found it, and until now nothing had ever rendered the
fix. The audit taps the button: 60 lines where the page alone drew 44.

The profile's `subjects` was `[]` for the same reason and with the same
effect — the chips a profile is mostly made of, and the completeness row
gated on them, had never been drawn.

**A report nobody can read past.** Putting cards on the canvas fixture made
the text-fit audit print twelve rows of "clipped in en, tr, by up to 668px",
all of them React Flow's own viewport containers. A canvas is a pan-and-zoom
surface: it lays cards out in board coordinates and moves the plane under a
window, so those containers reach past the screen by construction and a board
is unusable if they do not. Twelve rows of noise under a heading that says
"layout, not translation" is how a real finding gets skipped, so `.react-flow`
joins the deliberately-sideways list with the reason written down. Sixteen
rows became four, and the four are the pre-existing ones.

Verification recorded for this increment:

- 46 screen renders across two languages, up from 44;
- 126 failure checks across fourteen screens; mobile 91 tests; api-server 848;
- 192 text-fit renders, now with only the four findings that were already
  there;
- every package type-checks.

## Fix — the forum told a reader their search was too narrow

The offline audit covered eleven pages. The forum and the catalogue were not
among them, and could not usefully have been: the fixtures behind both were
empty arrays, so a working server and a broken one drew the same screen and
there was nothing to tell apart. With rows in them, both fail four ways:

- **"No posts match these filters."** and **"No materials match these
  filters."** were what the page said when the request had failed. That is not
  a claim about the network, it is a claim about the reader's search — so
  somebody whose connection dropped is told their filters are too narrow, and
  goes and widens them. A toast said the truth and then went away, which is
  the shape of an answer nobody sees.
- **The page threw.** `loadAccess` was the only one of the three loaders
  without a catch and it is fired with `void` from an effect, so a network
  failure became an unhandled `TypeError: Failed to fetch` while the two lists
  beside it failed politely. It keeps the read-only defaults now, which is
  what an unreachable server can honestly say about somebody's permissions.

Both lists carry the shared `LoadFailure` block, with the reason and a Try
again, in place of the empty state. 113 offline checks pass where 103 did, and
the ten that failed were all on these two pages.

Verification recorded for this increment:

- proved by driving: before the fix, ten checks failed naming both pages and
  all four conditions; after, 113/113;
- 189 page renders clean, every visible string translated, 230 user-content
  renders all protected, api-server 848 tests, the app type-checks.

## Fix — the class page, on the web, with the same shape as the phone's

The phone's class screen said "Class not found" when the request had failed.
The web one has the same branch and says nothing at all: a failed read fell
past `isError` — there was no `isError` — into the block for a class that is
gone, and a reader learned neither what went wrong nor that trying again was
worth it. It draws the shared `LoadFailure` now.

Found the same way as everything else here: the page had never been rendered
against a server that would not answer. 122 offline checks pass where 119 did,
and the three that failed were all this page.

Verification recorded for this increment:

- proved by driving: three checks failed naming `/classes/31` in all three
  failure conditions; after, 122/122;
- 189 page renders clean, every visible string translated, 230 user-content
  renders all protected, api-server 848 tests, the app type-checks.
