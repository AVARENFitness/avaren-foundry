# AVAREN Roadmap

Long-term product plan aligned with the philosophy in `docs/PRODUCT_BLUEPRINT.md`.

**Guiding constraints for every phase:**

- Luxury fitness product — premium feel on every screen
- Calm UI, generous spacing, one primary action per screen
- Minimize taps; never add clutter
- Coaches and athletes share the same experience
- AVA only appears when requested; AVA never interrupts
- Mobile-first; design tokens only; consistency over novelty

Roadmap order may shift based on testing and user feedback. Features that violate the blueprint do not ship regardless of schedule.

---

## Phase 0 — Foundation (Current)

Establish the product philosophy, Cursor rules, and documentation that govern all future work.

- [x] Product blueprint and roadmap
- [x] Cursor rules: product, design system, UX, architecture
- [ ] Accessibility pass (contrast, focus, reduced motion)
- [ ] Performance pass on mobile
- [ ] Design token audit — eliminate hardcoded values in components

---

## Phase 1 — Core Training Loop

Polish the daily loop until it is flawless before expanding surface area.

### 1A — Daily Home

- One hero action for today (train, recover, or rest)
- Readiness at a glance — no dashboard clutter
- Two-tap path to start any daily action

### 1B — Gym Mode

- Distraction-free active workout
- Local-first session persistence
- Set logging with minimal friction

### 1C — Recovery

- Daily Reset and Recovery Flow
- Athlete-controlled timers — never auto-advance
- Equipment-free movements by default

### 1D — Progress & Journey

- Workout Intelligence — one insight, not a report
- PR detection and milestone celebrations
- The Journey timeline

---

## Phase 2 — Coach Integration (Unified Experience)

Coaching features woven into the same app — not a parallel product.

### 2A — Assignments

- Coach assigns workouts; athlete sees them on Home
- Assignment notifications — opt-in only
- Adherence visible to coach without athlete UI clutter

### 2B — Coach Tools

- Client roster and calendar
- Workout designer
- Contextual coach panels — hidden until needed

### 2C — Communication

- Check-ins and notes
- No in-app messaging flood — structured, calm exchanges

---

## Phase 3 — Nutrition

Integrated nutrition that respects the calm UI contract.

- Food logging with quick-add flows
- Macro and water tracking
- Recipes and meal prep
- Weight and body composition trends
- Nutrition goals surfaced on Home only when relevant

---

## Phase 4 — AVA (On-Demand Intelligence)

AVA ships only when the non-interruptive contract can be guaranteed.

### 4A — AVA Entry Point

- Dedicated, discoverable entry — never auto-opened
- Request → focused response → dismiss

### 4B — AVA Capabilities

- Training questions and plan explanations
- Recovery and readiness interpretation
- Nutrition guidance
- Progressive overload suggestions

### 4C — AVA Guardrails

- No silent plan modifications
- No push notifications from AVA
- No badges or unread indicators
- Rate-limited to prevent dependency loops

---

## Phase 5 — Readiness & Adaptation

- Soreness, energy, and sleep input — minimal daily check-in
- Readiness score informing Home hero action
- Adaptive session guidance — recommend, never force
- Recovery Intelligence 2.0

---

## Phase 6 — Public Launch

Launch readiness — polish, not features.

- Onboarding in three screens or fewer
- Account recovery and data export/deletion
- Privacy policy and terms
- App icon and launch assets
- QA test plan covering solo and coached workflows
- Production error handling and monitoring
- Invite-only beta → open beta

---

## Phase 7 — Ecosystem (Post-Launch)

Integrations that add value without clutter.

- Apple Health / Health Connect
- Wearable-informed readiness (opt-in)
- Apple Watch / Wear OS companion — glanceable, not a second app

Each integration must pass the blueprint test: does it reduce taps and respect the calm UI?

---

## Explicitly Deferred

These are not rejected forever — they are deferred until the core loop is perfect and the team can implement them without violating philosophy:

| Feature | Why deferred |
|---------|-------------|
| Social feeds | Adds noise before core value is proven |
| Leaderboards | Conflicts with calm, personal focus |
| AI auto-coaching | Violates AVA non-interruptive contract |
| Separate coach app | Violates unified experience principle |
| Desktop-first features | Violates mobile-first principle |
| Gamification badges | Prefer meaningful milestones over arbitrary points |

---

## How to Propose a Feature

1. Read `docs/PRODUCT_BLUEPRINT.md`.
2. Answer: which phase does this belong in?
3. Confirm it passes all eight acceptance criteria.
4. Confirm it does not appear in the "Explicitly Deferred" list.
5. Prototype with existing design tokens — no new visual language.
6. Ship only if removing an existing element is not the better solution.

---

## Version History

| Version | Focus |
|---------|-------|
| 0.7.x | Training loop, recovery, coach foundation, nutrition groundwork |
| 0.8.x | Recovery Intelligence, cloud sync |
| 0.9.x | Coach engine, Forge achievements |
| 1.0 | Public beta readiness |
| 2.0 | Motion Studio, ecosystem integrations |

Detailed release notes: `docs/AVAREN_OS/RELEASE_NOTES.md` and `docs/AVAREN_OS/releases/`.

---

## Sprint 8.2 — In-Person Coaching + Coach Handoff (Architecture Note)

**Shipped in app (pending SQL migration for cross-device follow-ups):**

- Canonical `sessionMode`: `solo` | `coach_assigned` | `in_person_coached` on active/completed sessions
- Athlete Home/Train/Gym coached-session clarity; Gym Mode coach/in-person banner
- Structured **Coach Follow-Up** domain (allowlisted reason types, `open` | `reviewed` | `resolved`)
- AVA athlete handoff: pain/schedule/program requests → confirmation card → persist (no raw transcript)
- Coach attention queue ingests open follow-ups alongside weekly check-in flags
- Client Profile quiet **Needs Attention** panel when open follow-ups exist

**Proposed SQL (not auto-run):** `docs/supabase/AVAREN_COACH_CLIENT_FOLLOWUPS_8_2.sql`

### Recommended post-8.2 domain order (AVAREN OS)

Priority by daily coaching value and dependency:

1. **Appointment scheduling** — separates calendar appointments from workout assignments (foundation partially exists via `coach_scheduled_sessions`)
2. **Attendance** — `scheduled` → `started` → `completed` | `missed` | `cancelled` (session mode + completion data already captured)
3. **Client onboarding** — intake, goals, coach relationship setup
4. **Forms / waivers** — liability before in-person training at scale
5. **Packages / session credits** — ties attendance to commercial packages (partial package UI exists)
6. **Billing / subscriptions** — after attendance and packages are trustworthy
7. **Messaging / communication** — lightweight thread after follow-ups prove structured handoff works
8. **Staff permissions** — multi-coach businesses
9. **Business analytics** — after operational data is reliable
10. **Lead / client CRM** — acquisition layer, not daily session execution

**Explicitly still deferred:** full CRM, billing automation, native messaging, ticketing.
