# AVAREN Master Technical Audit

**Date:** August 5, 2026  
**Scope:** Full codebase review against `docs/PRODUCT_BLUEPRINT.md`, `docs/ROADMAP.md`, `.cursor/rules/*`, and `docs/AVAREN_OS/DESIGN_SYSTEM.md`  
**Method:** Static analysis, architecture review, build output inspection, screen-by-screen UX audit  
**Note:** `docs/AVA_ARCHITECTURE.md` does not exist yet — AVA readiness gaps are captured in Section 14.

---

## Executive Summary

AVAREN has a strong product vision and a well-designed domain layer (`src/lib/`). Pure calculation engines for metrics, analytics, journey, readiness, coach insights, and nutrition are in good shape. The presentation layer, however, has accumulated sprint-by-sprint complexity: a 2,100-line `App.jsx` god component, a 14,800-line monolithic stylesheet, and several screens that violate the luxury calm-UI contract.

The app is functional and mobile-oriented, but not launch-ready without addressing state architecture, navigation clarity, UI consolidation, accessibility, and performance.

---

## Scores

| Category | Score | Summary |
|----------|-------|---------|
| **Overall architecture** | **5 / 10** | Solid domain engines; presentation and orchestration are tightly coupled in `App.jsx` |
| **UI consistency** | **6 / 10** | Design tokens exist but are inconsistently applied; parallel visual patterns across sprints |
| **Mobile usability** | **7 / 10** | Mobile-first layout and touch targets are generally good; native dialogs and nav leakage hurt gym UX |
| **Code organization** | **4 / 10** | God component, monolith CSS, orphaned components, minified coach screen |

---

## 1. Overall Architecture

### What works

- **Domain engines are well-factored.** `src/lib/metrics.js`, `analytics.js`, `journey.js`, `readiness.js`, `coach.js`, `trainingRecommendations.js`, `nutrition.js`, and `forge.js` contain pure, reusable logic — the right foundation for AVA orchestration.
- **Local-first persistence is implemented.** `src/lib/storage.js` normalizes state per user (`avaren-foundry-user:{userId}`) with schema normalization.
- **Cloud sync strategy is sound.** `src/lib/cloudSync.js` uses timestamp-based conflict resolution via `chooseNewestState`.
- **Backend adapters exist.** `coachBackend.js`, `nutritionBackend.js`, and `assignmentNotifications.js` isolate Supabase calls from UI.

### What does not work

- **`App.jsx` is a 2,121-line system controller.** It owns navigation, auth, cloud hydration, workout lifecycle, mobility flows, coach mode, nutrition sync, notifications, onboarding, and rendering — far beyond the recommended extractions in `docs/AVAREN_OS/ARCHITECTURE.md`.
- **No custom hooks.** Missing `useAuthSession`, `useCloudSync`, `useWorkoutSession`, `useNavigation`, `useMobilityFlow`.
- **Schema version drift.** `createInitialState` sets `schemaVersion: 2`; `storage.js` uses `SCHEMA_VERSION = 3`; `cloudSync.js` uses `CLOUD_SCHEMA_VERSION = 2`.
- **`ErrorBoundary` exists but is not mounted.** `src/components/ErrorBoundary.jsx` is never used in `main.jsx` or `App.jsx`.
- **No code splitting.** Production bundle: **820 KB JS** (212 KB gzip) + **275 KB CSS** (46 KB gzip). Vite warns about chunks > 500 KB.
- **No TypeScript.** All contracts are implicit; state shape is undocumented at compile time.

### Architecture diagram (current vs. target)

```text
CURRENT                          TARGET
────────                         ──────
App.jsx (everything)      →      App.jsx (composition only)
  ├─ screens                    ├─ useAuthSession
  ├─ lib engines                ├─ useCloudSync
  └─ inline handlers            ├─ useWorkoutSession
                                ├─ useNavigation
                                └─ screens (thin composers)
```

---

## 2. UI Consistency

### Strengths

- CSS variables in `:root` define the Foundry palette (`--gold`, `--cream`, `--graphite`, etc.).
- Established component families: `.hero-card`, `.gold-button`, `.eyebrow`, `.luxury-panel`, `.empty-state`.
- Coach Hub correctly uses shared primitives: `SectionHeader`, `StatCard`, `EmptyState` from `src/components/ui/`.

### Weaknesses

| Issue | Evidence |
|-------|----------|
| **Hardcoded colors bypass tokens** | 115+ hex/rgba values in `src/styles.css`; muscle colors hardcoded in `GymScreen.jsx` (`MUSCLE_LIGHTS`) |
| **Typography below luxury minimum** | 100+ rules at 10–12px (`.brand-subtitle` 11px, `.metric-card span` 10px, `.eyebrow` 10px) vs. 17px body guideline |
| **Duplicate CSS blocks** | `.bottom-nav` redefined 6+ times across sprint sections in `styles.css` (lines ~164, 615, 9927, 10225, 10578) |
| **Parallel screen layouts** | `.home-3`, `.train-hub-screen`, `.nutrition-preview-screen` each define their own layout language |
| **Inline components instead of shared UI** | `NutritionScreen` defines local `ProgressBar`; `TrainHubScreen` defines local `ActionCard`; `MoreScreen` defines local `MoreItem` |
| **Orphaned design-system components** | `CoachCard`, `TrainingRecommendationCard`, `MetricCard` are defined but never imported anywhere |

---

## 3. Mobile Usability

### Strengths

- Max content width ~760px; safe-area insets on header.
- Bottom tab navigation with icon + label.
- Gym controls use portals for modals (correct pattern per design system).
- Timers are athlete-controlled (never auto-start rest).

### Weaknesses

| Issue | Impact |
|-------|--------|
| **Bottom nav visible during Gym Mode** | `GymScreen` renders inside `AppShell`; no CSS hides `.bottom-nav` during active workout |
| **Native `alert()` / `confirm()`** | 20+ usages across `App.jsx`, `MoreScreen`, `CoachScreen`, `HistoryScreen`, `NutritionScreen` — breaks premium feel, poor on iOS |
| **MoreScreen Recovery section bug** | Both "Morning Movement" and "Daily Reset" call `openDailyReset` (same handler); Home correctly uses `openHomeReset` for recovery |
| **Sub-screens lose nav context** | `builder`, `planner`, `history`, `forge`, `notifications`, `readiness-trends` are stack screens with no persistent wayfinding; bottom nav highlights wrong tab |
| **Splash + onboarding gate** | Sequential blocking screens before first action; onboarding length exceeds roadmap "three screens or fewer" target |
| **Notification badge on header** | Permanent bell with unread count — acceptable if opt-in, but conflicts with "no badges unless opted in" UX principle when notifications are enabled |

---

## 4. Code Organization

| File | Lines | Problem |
|------|-------|---------|
| `src/styles.css` | 14,852 | Monolith; sprint layers appended, not consolidated |
| `src/App.jsx` | 2,121 | God component; 50+ handler functions |
| `src/screens/NutritionScreen.jsx` | 567 | Monolith: 4 tabs, food search, recipes, insights, goals |
| `src/screens/MobilityScreen.jsx` | 727 | Timer, preferences, movement viewer combined |
| `src/screens/CompletionScreen.jsx` | 677 | Celebration + reflection + intelligence |
| `src/screens/GymScreen.jsx` | 659 | Workout UI + rest timer + options menu |
| `src/screens/CoachScreen.jsx` | 83 | Entire coach hub minified into single-line handlers |

**Test coverage:** Only 2 test files (`coach.test.js`, `forge.test.js`). Engineering standards require tests for analytics, journey, milestones, readiness, and nutrition — none exist.

**Dead wiring:** `App.jsx` passes ~10 props to `HomeScreen` that the component does not accept (`coachInsight`, `trainingRecommendation`, `onCoachAction`, `onApplyRecommendation`, `notificationSnapshot`, etc.) — intelligence features were removed from Home but orchestration remains.

---

## 5. Performance Opportunities

| Opportunity | Current | Recommendation | Priority |
|-------------|---------|----------------|----------|
| **JS bundle size** | 820 KB (single chunk) | Route-level `React.lazy()` for Coach Hub, Nutrition, Forge, Mobility, Builder | P1 |
| **CSS bundle size** | 275 KB | Split by screen; purge duplicate sprint blocks; CSS modules or scoped layers | P1 |
| **Motion library preload** | `MotionLibraryPreloader` loads manifest on boot | Defer until mobility screen opened | P2 |
| **`activeScreen` useMemo** | 2,000-line render function with 12 dependencies | Extract screen router; stabilize callbacks with `useCallback` | P1 |
| **Nutrition food search** | Recomputes 28-item sort on every keystroke | Debounce search; memoize combined food list | P2 |
| **Re-render scope** | Any state change re-renders entire tree | Split context providers (workout, nutrition, coach) | P1 |
| **Image assets** | Brand icons loaded at multiple sizes | Standardize srcset / single cached asset | P2 |

---

## 6. Accessibility Issues

| Issue | Location | Priority |
|-------|----------|----------|
| **ErrorBoundary not mounted** | `main.jsx` | P0 |
| **Small text (10–12px) widespread** | `styles.css` — eyebrows, subtitles, metric labels | P0 |
| **Muted text contrast** | `#77746f`, `#78756f` on `#0d1014` — may fail WCAG AA for small text | P0 |
| **Incomplete dialog semantics** | `ReadinessCheckIn`, `GymScreen` menus have good ARIA; `QuickAddModal`, nutrition modals lack `role="dialog"` | P1 |
| **Icon-only buttons missing labels** | Nutrition tab switches, coach template actions, many `<button>` with only icons | P1 |
| **`select` elements unstyled for screen readers** | `ProgressScreen` exercise picker — no associated `<label>` | P1 |
| **Reduced motion partially implemented** | Multiple `@media (prefers-reduced-motion)` blocks in CSS but inline JS animations in `MotionCardViewer` bypass | P1 |
| **Color-only status** | Readiness score tones, assignment status colors — no text alternative on some badges | P2 |
| **No skip navigation** | App shell has no skip-to-content link | P2 |

---

## 7. Technical Debt

| Debt | Description | Priority |
|------|-------------|----------|
| **God component** | All orchestration in `App.jsx` | P0 |
| **Schema version mismatch** | Local 3, initial state 2, cloud 2 | P0 |
| **Dead props / orphaned components** | HomeScreen wiring; `CoachCard`, `TrainingRecommendationCard`, `MetricCard` unused | P1 |
| **CoachScreen formatting** | Entire screen written as minified one-liners — unmaintainable | P1 |
| **No data export/deletion UI** | Roadmap Phase 6 requirement missing (only local reset) | P0 |
| **No privacy policy / terms** | Roadmap Phase 6 requirement missing | P0 |
| **Nutrition cloud sync partial** | `nutritionBackend` syncs profile + days but recipes/saved foods stay local-only | P1 |
| **Alert-based error handling** | Production errors surface via `alert()` instead of in-app error states | P1 |
| **No monitoring / error reporting** | Console-only logging | P1 |
| **AVA architecture undefined** | No `docs/AVA_ARCHITECTURE.md`; no AVA entry point; intelligence code exists but is disconnected from Home | P1 |

---

## 8. Duplicate Code

| Duplication | Files | Recommendation |
|-------------|-------|----------------|
| **Streak calculation (two algorithms)** | `metrics.consistencyStreak` (allows 2-day gap) vs. `analytics.currentWorkoutStreak` (consecutive days only) | Unify into single `trainingStreak.js`; document semantics | P1 |
| **Volume / sets totals** | `metrics.totalVolume`, `analytics.totalWorkoutVolume`, inline `sessionVolume` calls | Single source in `metrics.js`; analytics imports it | P2 |
| **e1RM calculation** | `metrics.estimatedOneRepMax`, duplicated inline in `analytics.js`, `journey.js`, `forge.js` | Always import from `metrics.js` | P2 |
| **Date formatting helpers** | `formatDate`, `today`, `nutritionDateKey`, `sessionDate` scattered across screens | Extract `src/lib/dates.js` | P2 |
| **Dashboard stat cards** | Home week stats, Progress overview grid, TrainingOverview grid, Coach StatCards | Unify on `StatCard` / `MetricCard` | P1 |
| **Section headers** | Inline `<span className="eyebrow">` + `<h2>` vs. `SectionHeader` component | Adopt `SectionHeader` everywhere | P1 |
| **Progress bars** | Inline `style={{ width }}` in NutritionScreen, ProgressScreen milestones, TrainingOverview muscle bars | Shared `ProgressBar` in `components/ui/` | P2 |
| **CSS `.bottom-nav` blocks** | 6+ redefinitions in `styles.css` | Consolidate to single definition | P1 |
| **Food/recipe CRUD patterns** | Repeated `patch` / `patchDay` / `confirm` / `setNotice` in NutritionScreen | Extract `useNutritionActions` hook | P1 |

---

## 9. Navigation Problems

### Navigation model

AVAREN uses string-based screen state (`screen` in `App.jsx`) with two shells:

- **`AppShell`** — athlete tabs: Home, Train, Nutrition, Progress, Account
- **`CoachShell`** — coach tabs: Clients, Calendar, Assignments, Programs, Coach

This violates the blueprint principle: *"Coaches and individual athletes use the exact same experience."*

### Specific issues

| Issue | Detail | Priority |
|-------|--------|----------|
| **Parallel app shells** | Coach mode swaps entire shell with "Athlete App" exit button | P0 |
| **Hidden stack screens** | `builder`, `planner`, `history`, `forge`, `gym`, `complete`, `mobility`, `notifications`, `readiness-trends` have no tab representation | P1 |
| **Duplicate entry points** | Workout Builder reachable from Train Hub, More > Training, and Coach Hub | P1 |
| **Train Hub redundancy** | Train tab repeats Home's primary workout CTA plus 6 secondary cards | P1 |
| **Back navigation inconsistent** | Some screens use `onClose → navigate('more')`; notifications close to Home; planner saves to Home | P1 |
| **Deep link / URL routing absent** | All navigation is in-memory state; refresh loses screen context | P2 |
| **Programs dead-end** | Train Hub "Programs" card navigates to More with message that programs live in Coach Hub | P2 |

---

## 10. State Management Issues

| Issue | Detail | Priority |
|-------|--------|----------|
| **Single mega-state object** | Entire app state in one `useState`; any field change triggers full re-render | P0 |
| **Dual exercise index tracking** | `activeExercise` in separate `useState` AND `state.activeWorkout.activeExerciseIndex` — manually synced | P1 |
| **Coach workspace duplicated** | `CoachScreen` maintains local `clients/assignments` state AND writes to `state.coachWorkspace` | P1 |
| **Remote notifications separate** | `remoteNotifications` state in App, not merged into state tree | P2 |
| **Mobility flow ephemeral** | `mobilityFlow` in component state, not persisted — lost on refresh mid-flow | P1 |
| **No optimistic rollback** | Cloud save failures logged but user not informed | P1 |
| **Nutrition state nested** | `state.nutrition` grows unbounded (`days` object) with no pruning strategy | P2 |

---

## 11. Components That Should Be Reused

These exist but are underused. New work should adopt them before creating alternatives.

| Component | Location | Currently used by | Should also be used by |
|-----------|----------|-------------------|------------------------|
| `SectionHeader` | `components/ui/SectionHeader.jsx` | CoachScreen | Home, Train, Nutrition, Progress, More, Forge, History |
| `StatCard` | `components/ui/StatCard.jsx` | CoachScreen | Home week stats, Progress overview, TrainingOverview |
| `EmptyState` | `components/ui/EmptyState.jsx` | CoachScreen | History, Forge, Nutrition library, Progress PR feed |
| `MetricCard` | `components/MetricCard.jsx` | *(unused)* | Progress overview, Home dashboard |
| `CoachCard` | `components/CoachCard.jsx` | *(unused)* | Future AVA responses (insight card pattern) |
| `TrainingRecommendationCard` | `components/TrainingRecommendationCard.jsx` | *(unused)* | Train Hub or AVA training suggestions |
| `ReadinessCard` | `components/ReadinessCard.jsx` | Verify usage | Home readiness entry |
| `ProgressRing` | `components/ProgressRing.jsx` | GymScreen | Nutrition macro rings, readiness score |
| `Stepper` | `components/Stepper.jsx` | ReadinessCheckIn | Onboarding, nutrition goals |
| `WorkoutIntelligenceSummary` | `components/WorkoutIntelligenceSummary.jsx` | CompletionScreen | AVA workout explanations |
| `ErrorBoundary` | `components/ErrorBoundary.jsx` | *(unused)* | Wrap AppShell, CoachShell, GymScreen |

---

## 12. Screens With Too Much Cognitive Load

Ranked by number of competing actions and information density.

| Screen | Competing elements | Blueprint violation |
|--------|-------------------|---------------------|
| **NutritionScreen** | 4 tabs (Today, Meals, Library, Insights); food search + categories + favorites + custom food + recipes + meal prep + weight + water + goals | "One primary action per screen"; should split into focused destinations |
| **ProgressScreen** | TrainingOverview (8 metrics + muscle chart) + readiness entry + 4-stat grid + exercise chart + 3 metric switchers + ALL milestone chains + PR feed + exercise profile | "Dashboard with competing CTAs" — explicitly rejected in blueprint |
| **MoreScreen** | 5 section tabs; 15+ destinations across Training, Recovery, Account, Support | Acceptable as hub IF sections are calm — currently dense |
| **HomeScreen** | Hero workout + assignment panel + 4 dashboard cards + weekly stats + tagline | Multiple equal-weight cards compete with single primary action |
| **CoachScreen (client profile)** | Stats + notes textarea + assignment list + create workout + designer modal | Coach context is dense but role-specific — still needs progressive disclosure |
| **ReadinessTrendsScreen** | 7-day + 30-day trends + correlation analysis + factor breakdowns + PR overlay | Analytics screen — acceptable depth but overwhelming for mobile gym context |
| **CompletionScreen** | Session stats + PRs + milestones + forge achievements + reflection + recovery CTA + intelligence summary | Post-workout celebration justifies richness, but 677 lines suggests need to decompose |
| **GymScreen** | Exercise focus + superset mode + rest timer + session notes + workout picker + quick add + options menu | Gym mode should show ONE focus — secondary controls should hide behind single menu |

---

## 13. Screens That Violate Luxury Design Principles

| Screen | Principle violated | Specific evidence |
|--------|-------------------|-------------------|
| **CoachShell + CoachScreen** | Unified experience | Separate app shell, separate nav, "AVAREN COACH" branding fork |
| **HomeScreen** | One primary action | 4 dashboard cards + weekly stats section compete with workout hero |
| **ProgressScreen** | Calm UI / remove over add | 8-metric TrainingOverview precedes the actual progress content |
| **NutritionScreen** | Minimize clutter | Entire nutrition platform in one screen with 4 tabs |
| **TrainHubScreen** | One primary action | Hero + 6 equal action cards |
| **MoreScreen (Recovery tab)** | Minimize taps / correctness | Both recovery entries open morning movement (`openDailyReset`), not recovery flow |
| **NotificationScreen** | AVA never interrupts | Notification-driven engagement (acceptable if opt-in, but no opt-in gate on first use) |
| **AuthScreen / Splash** | Minimize taps | Splash animation + auth before any value — necessary but not yet luxury-polished |
| **Various screens** | Premium feel | Native browser `alert()` and `confirm()` dialogs |
| **GymScreen (with AppShell)** | Gym-ready / distraction-free | Bottom tab bar visible during active workout |

---

## 14. AVA Readiness Gap

`docs/AVA_ARCHITECTURE.md` has not been created. Existing intelligence infrastructure that AVA should orchestrate (not duplicate):

| Service | File | Purpose |
|---------|------|---------|
| Coach insights | `lib/coach.js` | Ranked daily insights |
| Training recommendations | `lib/trainingRecommendations.js` | Session adaptation |
| Recovery intelligence | `data/mobility.js` | `calculateRecoveryIntelligence` |
| Readiness | `lib/readiness.js` | Score, trends, correlations |
| Analytics | `lib/analytics.js` | Training snapshots |
| Journey | `lib/journey.js` | Event timeline |
| Nutrition totals | `lib/nutrition.js` | Macro calculations |

**Current problem:** Intelligence components (`CoachCard`, `TrainingRecommendationCard`) are orphaned — insights are computed in `App.jsx` but not surfaced on Home, violating neither AVA's "on request" contract nor the product's "quiet intelligence" promise. AVA architecture doc and entry point are prerequisites before Phase 4.

---

## Prioritized Recommendations

### P0 — Must fix before launch

| # | Recommendation | Category |
|---|----------------|----------|
| 1 | Extract `App.jsx` into hooks (`useAuthSession`, `useCloudSync`, `useWorkoutSession`, `useNavigation`) — reduce god component below 400 lines | Architecture |
| 2 | Unify schema versions across `storage.js`, `cloudSync.js`, and `createInitialState` with explicit migration | Technical debt |
| 3 | Mount `ErrorBoundary` at app root and around Gym/Coach screens | Accessibility |
| 4 | Fix contrast and minimum font sizes — audit all text below 14px; body text to 17px per design system | Accessibility |
| 5 | Hide bottom navigation during Gym Mode, Mobility flows, and Completion | Mobile UX |
| 6 | Replace all `alert()` / `confirm()` with in-app confirmation and toast patterns | Luxury UX |
| 7 | Add data export and account deletion flows (GDPR-ready) | Launch requirement |
| 8 | Add privacy policy and terms of service screens | Launch requirement |
| 9 | Fix MoreScreen Recovery tab — `onOpenReset` must call `openHomeReset`, not `openDailyReset` | Bug / UX |
| 10 | Reconcile unified experience — integrate Coach Hub into AppShell as contextual sections, not parallel shell | Product principle |
| 11 | Simplify Home to one hero action — demote dashboard cards to Nutrition/Progress tabs or collapse behind single "Today" row | Luxury UX |
| 12 | Split mega-state into React contexts to prevent full-tree re-renders | Performance / architecture |

### P1 — Important

| # | Recommendation | Category |
|---|----------------|----------|
| 13 | Create `docs/AVA_ARCHITECTURE.md` and AVA entry point (on-request only) | AVA / roadmap |
| 14 | Remove dead props from HomeScreen wiring; delete or reconnect orphaned intelligence components | Technical debt |
| 15 | Refactor `CoachScreen.jsx` from minified one-liners to readable, testable code | Code organization |
| 16 | Adopt `SectionHeader`, `StatCard`, `EmptyState` across all screens | UI consistency |
| 17 | Consolidate `styles.css` — remove duplicate `.bottom-nav` and sprint-specific overrides | UI consistency |
| 18 | Route-level code splitting (`React.lazy`) for Coach, Nutrition, Forge, Mobility, Builder | Performance |
| 19 | Unify streak algorithms (`consistencyStreak` vs. `currentWorkoutStreak`) | Duplicate code |
| 20 | Split `NutritionScreen` into focused screens: Today, Log Food, Recipes, Insights | Cognitive load |
| 21 | Remove or collapse `TrainingOverview` from top of Progress — show on demand | Cognitive load |
| 22 | Persist mobility flow state across refresh | State management |
| 23 | Add engine tests for analytics, journey, milestones, readiness, nutrition | Engineering standards |
| 24 | Implement in-app error states for cloud sync failures | State management |
| 25 | Add `aria-label` to all icon-only buttons | Accessibility |
| 26 | Standardize stack screen back navigation (consistent destination per screen type) | Navigation |
| 27 | Complete nutrition cloud sync (recipes, saved foods) | Technical debt |
| 28 | Remove dead code: unused imports/props in `App.jsx` → `HomeScreen` | Technical debt |
| 29 | Extract `src/lib/dates.js` for shared date helpers | Duplicate code |
| 30 | Decompose `CompletionScreen` into celebration + reflection sub-components | Code organization |

### P2 — Nice to have

| # | Recommendation | Category |
|---|----------------|----------|
| 31 | Migrate to TypeScript for state and service contracts | Architecture |
| 32 | URL-based routing (React Router) for deep links and refresh persistence | Navigation |
| 33 | Shared `ProgressBar` component in `components/ui/` | UI consistency |
| 34 | Defer motion library preload until mobility opened | Performance |
| 35 | Debounce nutrition food search | Performance |
| 36 | Map hardcoded colors to CSS variables (including `MUSCLE_LIGHTS`) | UI consistency |
| 37 | Skip-to-content link in AppShell | Accessibility |
| 38 | Prune old nutrition day entries (> 90 days) from local state | State management |
| 39 | Consolidate Train Hub with Home or reduce to 2 secondary actions | Cognitive load |
| 40 | Add production error monitoring (Sentry or equivalent) | Launch polish |
| 41 | Reconnect `MetricCard` or remove it | Dead code |
| 42 | CSS layer architecture (`@layer base, components, utilities`) | Code organization |
| 43 | Programs entry in Train Hub should route to Coach programs or be hidden for athletes | Navigation |
| 44 | Full reduced-motion audit for JS-driven animations | Accessibility |

---

## Appendix: File Inventory

### Screens (18)

`HomeScreen`, `TrainHubScreen`, `GymScreen`, `NutritionScreen`, `ProgressScreen`, `MoreScreen`, `MobilityScreen`, `CompletionScreen`, `HistoryScreen`, `ForgeScreen`, `WeeklyPlannerScreen`, `WorkoutBuilderScreen`, `CoachScreen`, `NotificationScreen`, `ReadinessTrendsScreen`, `OnboardingScreen`, `AuthScreen`, `NutritionPreviewScreen`

### Domain services (20)

`analytics.js`, `assignmentNotifications.js`, `cloudSync.js`, `coach.js`, `coachBackend.js`, `forge.js`, `journey.js`, `metrics.js`, `milestones.js`, `motionLibrary.js`, `notifications.js`, `nutrition.js`, `nutritionBackend.js`, `pushNotifications.js`, `readiness.js`, `storage.js`, `supabase.js`, `trainingRecommendations.js`, `trainingWeek.js`, `userData.js`

### Shared UI (3 in `components/ui/`)

`EmptyState`, `SectionHeader`, `StatCard`

### Build output (production)

| Asset | Size | Gzip |
|-------|------|------|
| `index-*.js` | 820 KB | 212 KB |
| `index-*.css` | 275 KB | 46 KB |

---

## Audit Conclusion

AVAREN's **domain layer is launch-capable**; its **presentation and orchestration layer is not**. The path to public beta (Roadmap Phase 6) requires P0 work on architecture extraction, accessibility, navigation unification, and calm-UI simplification of Home and Progress — before adding AVA or new features.

**Recommended sequence:**

1. P0 architecture extraction and ErrorBoundary  
2. P0 Home / Progress simplification (luxury contract)  
3. P0 launch compliance (privacy, export, deletion)  
4. P1 AVA architecture doc and entry point  
5. P1 code splitting and CSS consolidation  
6. P2 TypeScript and URL routing  

This audit should be re-run after P0 items are complete.
