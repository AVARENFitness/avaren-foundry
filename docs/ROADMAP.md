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
