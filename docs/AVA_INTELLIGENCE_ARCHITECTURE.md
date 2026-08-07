# AVA Intelligence Architecture

Sprint 7.6 establishes AVA as a **deterministic intelligence layer** that synthesizes existing athlete data into daily guidance. AVA is not a chatbot and does not invent metrics. Patch 7.6.3 makes AVA **action-first**: intelligence stays rich, but Home shows one primary next step.

## Layer model

```
Domain engines (readiness, training, recovery, nutrition, metrics)
        ↓
AVA intelligence / synthesis (`src/lib/avaIntelligence.js`)
        ↓
AVA action selection (`src/lib/avaActions.js`)
        ↓
AVA voice / presentation (`src/lib/avaVoice.js`)
        ↓
Presentation (`AvaDailyBriefing`, `AvaWhySheet`, future AVA surfaces)
```

## Presentation principle

**What AVA knows** (PRs, trends, volume, nutrition, recovery scores) remains available to evidence and Why.

**What AVA shows** on Home is the minimum needed for today's decision: headline, one supporting sentence, one primary action, optional secondary action, one watch item max. Patch 7.6.4 removes duplicated card copy and makes movement prep context-driven rather than time-driven.

## What AVA consumes

| Source | Module | Used for |
|--------|--------|----------|
| Readiness | `readiness.js` | Daily score, factors, 7-day trend |
| Training recommendation | `trainingRecommendations.js` | Load/recovery guidance |
| Recovery balance | `data/mobility.js` | Recovery Flow / reset context |
| Analytics | `analytics.js` | Streaks, volume patterns |
| Metrics | `metrics.js` | Recent PRs |
| Nutrition | `nutrition.js` | Logging and protein context |
| Today's focus | `todaysFocus.js` | Action alignment (no duplicate priority logic) |
| Coach assignments | Context from Home | Coach-programmed sessions |

## What AVA produces

`buildAvaDailyBriefing(state, context)` returns:

- **Daily state** — `ready`, `ready-with-adjustment`, `manage-load`, `recovery-priority`, `rest`, `insufficient-data`
- **Headline + summary** — concise daily interpretation
- **Recommendation** — train / modify / lower stress / recovery / rest / need data
- **Focus** — one primary actionable direction
- **Watch** — up to 3 signals (optional)
- **Win** — one real positive signal (optional)
- **Evidence** — grouped facts for the Why sheet
- **Confidence** — strong / moderate / limited context

## Principles

1. **Deterministic first** — same inputs produce the same briefing.
2. **Explainable** — every recommendation links to evidence via Why.
3. **Graceful degradation** — missing data reduces confidence, not quality of prose with fake numbers.
4. **No medical claims** — signals and guidance only; no diagnosis language.
5. **No silent mutations** — AVA informs; it does not change workouts or assignments.
6. **Coach respect** — assigned sessions are acknowledged; AVA may suggest effort management, not overrides.

## Safety boundaries

- AVA does **not** auto-modify workouts, sets, or coach assignments.
- AVA does **not** persist derived daily recommendations (recomputed from state).
- Athlete-facing copy avoids clinical terminology.
- Low-data athletes receive onboarding guidance, not fabricated certainty.

## Home integration

```
Greeting
AVA Daily Briefing   ← intelligence synthesis
Today's Focus        ← primary daily action
Existing Home content
```

Today's Focus remains the action layer. AVA Daily Briefing is the intelligence layer above it.

## Future extension points

| Extension | Approach |
|-----------|----------|
| On-demand AVA sheet | Wire `AvaService` to `buildAvaDailyBriefing` / context helpers |
| Language-model features | LLM narrates **existing** evidence objects — never replaces scoring |
| Coach-side AVA | Separate portfolio synthesis; reuse `clientIntelligence.js` patterns |
| Workout adaptation | Separate controlled system with explicit athlete confirmation |
| Persistence | Only if product requires historical briefing audit trail |

## Distinction: deterministic vs LLM

| Deterministic (Sprint 7.6) | Future LLM |
|----------------------------|------------|
| Rules over engine outputs | Natural-language phrasing |
| Testable, reproducible | Requires guardrails on evidence |
| Ships on Home today | On-demand via AVA sheet |
| No network required | Optional enhancement layer |

## Key files

- `src/lib/avaIntelligence.js` — synthesis engine
- `src/lib/avaIntelligence.test.js` — rule and safety tests
- `src/components/AvaDailyBriefing.jsx` — Home briefing card
- `src/components/AvaWhySheet.jsx` — explainability sheet
