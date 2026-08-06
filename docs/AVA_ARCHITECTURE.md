# AVA Architecture

AVA is AVAREN's on-demand intelligence layer. It orchestrates existing domain engines and future AI providers without duplicating business logic. This document describes the foundation introduced in **AVA Foundation Part 1**.

AVA follows the product contract in `docs/PRODUCT_BLUEPRINT.md`:

- Named **AVA** in user-facing copy
- Never interrupts — no unsolicited prompts on screen load
- Only when requested — explicit entry point required (UI not yet shipped)
- Quiet and focused — one useful answer at a time
- Never silent changes — recommendations require athlete confirmation

---

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│  React UI (future AVA entry point — not mounted yet)        │
└───────────────────────────────┬─────────────────────────────┘
                                │ useAva()
┌───────────────────────────────▼─────────────────────────────┐
│  AvaProvider (AvaContext.jsx)                               │
│  Exposes service + router to the tree                       │
└───────────────────────────────┬─────────────────────────────┘
                                │
          ┌─────────────────────┴─────────────────────┐
          ▼                                           ▼
┌─────────────────────┐                   ┌─────────────────────┐
│  AvaIntentRouter    │                   │  AvaService         │
│  Keyword routing    │ ─── delegates ──► │  Public API         │
│  (placeholder)      │                   │  Mock responses     │
└─────────────────────┘                   └──────────┬──────────┘
                                                       │
                       ┌───────────────────────────────┼───────────────────────────────┐
                       ▼                               ▼                               ▼
              Domain engines (existing)        Future AI providers            App state / context
              src/lib/*                        OpenAI, Anthropic, etc.          (future injection)
```

---

## Service Layer

**Module:** `src/ava/AvaService.js`

`AvaService` is the single public intelligence façade. Screens and hooks should call AVA through this class (or the `useAva()` hook), not by importing domain engines directly for open-ended questions.

### Public API (Part 1 — mock implementations)

| Method | Purpose |
|--------|---------|
| `analyzeMessage(input, context?)` | General athlete questions |
| `analyzeFood(input, context?)` | Food description → macro estimates |
| `analyzeWorkout(input, context?)` | Training guidance and session adjustments |
| `analyzeWeight(input, context?)` | Body-weight trend interpretation |
| `analyzeWater(input, context?)` | Hydration guidance |
| `getSuggestions(context?)` | Proactive suggestion list (only surfaced on request) |

All methods return a consistent envelope:

```js
{
  ok: true,
  source: 'mock',           // becomes 'engine' | 'provider' later
  intent: 'food',
  summary: '...',
  suggestions: ['...'],
  data: { ... },
  generatedAt: 'ISO-8601',
}
```

Part 1 returns placeholder data. No network calls. No mutations to app state.

### Design rules

1. **Pure orchestration** — AvaService composes engines and providers; it does not own workout/nutrition math.
2. **Context-aware** — optional `context` object will carry athlete state, readiness, and session snapshots in later phases.
3. **Swappable backend** — constructor injection via `AvaProvider service={...}` supports tests and provider swaps.

---

## Intent Router

**Module:** `src/ava/AvaIntentRouter.js`  
**Intent definitions:** `src/ava/intents.js`

The router classifies free-text input and delegates to the correct `AvaService` method.

### Flow

1. `detectIntent(message)` — keyword classifier (placeholder; replace with ML/LLM classifier later)
2. `route(input, context)` — auto-detect intent and call service
3. `routeIntent(intent, input, context)` — explicit intent for structured UI actions

### Supported intents

| Intent constant | Routes to |
|-----------------|-----------|
| `AVA_INTENTS.MESSAGE` | `analyzeMessage()` |
| `AVA_INTENTS.FOOD` | `analyzeFood()` |
| `AVA_INTENTS.WORKOUT` | `analyzeWorkout()` |
| `AVA_INTENTS.WEIGHT` | `analyzeWeight()` |
| `AVA_INTENTS.WATER` | `analyzeWater()` |
| `AVA_INTENTS.SUGGESTIONS` | `getSuggestions()` |

---

## React Integration

| Module | Role |
|--------|------|
| `AvaContext.jsx` | `AvaProvider` — creates service + router, exposes context |
| `useAva.js` | Consumer hook for screens and future AVA UI |

### Provider mount

`AvaProvider` wraps the application in `src/main.jsx`:

```
ErrorBoundary → AvaProvider → AppUiProvider → App
```

No UI is rendered. No existing screens import `useAva()` yet. Behavior is identical to pre-AVA.

---

## Future AI Providers

Part 1 does not connect to external models. Planned provider abstraction:

```
AvaService
  └── AvaProviderAdapter (future)
        ├── MockProvider        ← Part 1
        ├── OpenAIProvider      ← future
        ├── AnthropicProvider   ← future
        └── LocalRulesProvider  ← deterministic fallbacks
```

Provider responsibilities:

- Natural-language understanding beyond keyword routing
- Structured JSON extraction (food items, workout edits)
- Tone-controlled response generation aligned with AVAREN voice

Providers must **never** write to storage directly. All mutations flow through existing app actions with explicit user confirmation.

---

## Existing Domain Engines AVA Will Orchestrate

AVA should delegate calculations to these pure modules in `src/lib/`:

| Engine | Module | AVA use cases |
|--------|--------|---------------|
| Metrics | `metrics.js` | PRs, volume, streaks, exercise profiles |
| Analytics | `analytics.js` | Training overview, muscle volume, streaks |
| Readiness | `readiness.js` | Recovery scores, check-in interpretation |
| Training recommendations | `trainingRecommendations.js` | Session load suggestions |
| Coach insights | `coach.js` | Rule-based coaching copy |
| Nutrition | `nutrition.js` | Macro totals, day summaries |
| Journey / milestones | `journey.js`, `milestones.js` | Progress narrative |
| Forge | `forge.js` | Achievement unlock context |
| Motion library | `motionLibrary.js` | Mobility guidance |

Backend integrations AVA may reference (read-only orchestration):

- `nutritionBackend.js` — cloud nutrition sync
- `coachBackend.js` — coach assignments and schedule
- `cloudSync.js` / `storage.js` — persisted athlete state

---

## Extension Points

### 1. Service method injection

Pass a custom service to `AvaProvider` for tests or staged rollouts:

```jsx
<AvaProvider service={customAvaService}>
  {children}
</AvaProvider>
```

### 2. Context enrichment (Phase 4B)

`AvaProvider` will accept athlete state from a bridge hook without coupling to `App.jsx` internals:

```js
analyzeWorkout(input, {
  history,
  activeWorkout,
  readiness,
  trainingRecommendation,
})
```

### 3. Intent router upgrade

Replace `detectIntent()` keywords with:

- LLM classification pass
- Confidence threshold → clarify vs. route
- Multi-intent decomposition for compound questions

### 4. UI entry point (Phase 4A — not built)

Future components:

- `AvaEntryButton` — explicit launch control
- `AvaPanel` — on-request sheet/modal
- `AvaResponseCard` — reuses `CoachCard` visual patterns

### 5. Action proposals (Phase 4C)

AVA responses may include **proposed actions** (e.g. log food, adjust workout). Execution requires:

1. Structured action schema in `data.actions`
2. Confirmation via `appUi.confirm()`
3. Delegation to existing screen handlers — no new mutation paths

---

## File Map

```
src/ava/
  AvaService.js       — public intelligence API (mock)
  AvaIntentRouter.js  — intent detection + routing
  AvaContext.jsx      — AvaProvider + React context
  useAva.js           — consumer hook
  intents.js          — intent constants + keyword detector
```

---

## Non-Goals (Part 1)

- No AVA UI surfaces
- No changes to Home, Train, Nutrition, or Progress screens
- No external AI API calls
- No persistence or schema changes
- No push notifications from AVA

---

## Related Documents

- `docs/PRODUCT_BLUEPRINT.md` — AVA product contract
- `docs/ROADMAP.md` — Phase 4 (AVA on-demand intelligence)
- `docs/MASTER_TECHNICAL_AUDIT.md` — AVA readiness gap analysis
- `docs/AVAREN_OS/ARCHITECTURE.md` — application architecture
