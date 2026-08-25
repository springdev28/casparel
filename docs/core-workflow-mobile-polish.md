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

Still required before declaring the canonical slice complete:

- verify save, retry, restart persistence, screen-reader behavior, Reduce Motion, and frame performance on real iOS and mid-range Android hardware;
- implement a real resource-to-goal/path association; the current sheet truthfully offers **View goals** and does not pretend navigation created a link;
- continue Phase 3 with Learning List roles, accessible reordering, quality review, and editable list-to-path activation;
- capture second-device persistence and analytics evidence in the release record.

## Agent prompt

Use this file as the product authority. Inspect the latest implementation, schema, API hooks, tests, and design-system components first. Map the current app against the canonical screen chain. Identify the smallest missing vertical slice. Implement it without duplicating existing systems or introducing parallel models. Use existing mobile animation dependencies. Keep sponsored content outside organic search, credibility, Learning Lists/Paths, adaptive recommendations, and teacher recommendations. Report the workflow gap fixed, transitions added, state and persistence behavior, shared primitives used, files/schema changed, tests, real-device evidence, accessibility, performance, analytics, docs updated, and remaining gaps.

## Definition of done

A screen is not complete because it renders or animates. It is complete when the learner understands the next action, taps receive immediate feedback, loading cannot be confused with emptiness, errors preserve context, successful writes persist, navigation maintains the product chain, animation remains smooth, reduced motion works, and light and dark modes feel intentionally designed.
