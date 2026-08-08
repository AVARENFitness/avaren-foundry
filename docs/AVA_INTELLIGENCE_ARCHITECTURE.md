# AVA Intelligence Architecture

Sprint 7.6 establishes AVA as a **deterministic intelligence layer** that synthesizes existing athlete data into daily guidance. AVA is not a chatbot and does not invent metrics. Patch 7.6.3 makes AVA **action-first**: intelligence stays rich, but Home shows one primary next step.

Sprint 7.7 adds **conversational intelligence** on top of the same foundation. Ask AVA reuses the deterministic engine and context packet — it does not maintain a second reasoning system.

## Layer model

```
App / domain state
        ↓
Domain engines (readiness, training, recovery, nutrition, metrics, coach assignments)
        ↓
AVA deterministic intelligence (`src/lib/avaIntelligence.js`)
        ↓
AVA action selection (`src/lib/avaActions.js`)
        ↓
AVA context packet (`src/lib/avaContext.js`)
        ↓
Conversational AVA (`src/lib/avaConversation.js` + `src/ava/AvaService.js`)
        ↓
AVA voice / presentation (`src/lib/avaVoice.js`)
        ↓
Presentation (Daily Briefing, Why sheet, Ask AVA sheet)
```

Daily Briefing and Ask AVA both read from the same context packet and briefing output. Conversation cannot override canonical workout truth, readiness state, or validated metrics.

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

## AVA context packet (Sprint 7.7)

`buildAvaContextPacket(state, options)` gathers validated, compact context for both Daily Briefing and conversation:

- Athlete first name
- Canonical today's workout and source (self-selected vs coach-assigned)
- Active coach assignment (athlete-visible fields only — no private coach review)
- Readiness state and evidence
- Recovery / mobility context
- Recent training summary and frequency
- Current Daily Briefing state, primary action, watch item
- Validated performance context (via `workoutMetrics` contract)
- Nutrition context when logged
- Data-limitation flags, date/daypart

The packet is normalized — not a dump of raw application state.

## Conversational layer (Sprint 7.7)

`src/lib/avaConversation.js` handles:

- **Session memory** — bounded in-memory transcript for pronouns, follow-ups, and recent recommendations (client session scope only; no DB persistence)
- **Intent routing** — workout, readiness, history, progress, nutrition, coach, and referent follow-ups ("Should I still do it?")
- **Opening message** — context-driven, not generic "How can I help?"
- **Suggested prompts** — ~3 contextual starters based on packet state
- **Actions** — routes to existing flows (start workout, readiness, recovery, nutrition, progress, assignment)
- **Graceful degradation** — deterministic briefing remains available if conversation processing fails

`AvaService.js` delegates to `respondToAvaMessage()` when a context packet and session are provided. Nutrition logging still flows through the existing intent router and confirmation UI.

Patch 7.7.1 adds `avaConversationalRouter.js` so conversation and state statements are classified **before** the nutrition parser runs. Food disambiguation requires explicit nutrition-logging intent.

## Model-backed conversation (Sprint 7.7.2)

```
Deterministic truth layer (7.6+)
        ↓
Client session payload (message + subjective context only) — Patch 7.7.4
        ↓
Authenticated Edge Function (`supabase/functions/ava-chat`)
        ↓
Server-trusted context resolution (`trustedContext.ts`) — Patch 7.7.4
        ↓
Language model (server-side only)
        ↓
Validated structured response
        ↓
Allowlisted UI actions (`avaModelActions.js`)
        ↓
Ask AVA presentation
```

**Deterministic AVAREN system = truth.** The model interprets language and phrasing only.

| Layer | Owns |
|-------|------|
| Deterministic engines | Workout, readiness, nutrition totals, history, PRs, coach assignment, permissions |
| Server-trusted context | Facts fetched from Supabase under authenticated user RLS (Patch 7.7.4) |
| Language model | Natural understanding, subjective acknowledgment, concise phrasing |
| Client | Session memory, hints, action allowlist, nutrition tool gates, fallback |

### Trust classes (Patch 7.7.4)

| Class | Source | Examples |
|-------|--------|----------|
| **SERVER_TRUSTED** | Edge Function fetch under JWT user | `foundry_state`, `coach_assignments`, `nutrition_profiles`, `nutrition_days` |
| **USER_SUBJECTIVE** | Client session only | "I'm tired", "my front delt hurts", "I only have 30 minutes" |
| **CLIENT_HINTS** | Advisory UI only | daypart, timezone offset |

The client **does not** send authoritative readiness, workout, or assignment facts to the model path. Deterministic fallback still uses the local context packet when the Edge Function is unavailable.

Flow in `AvaService.analyzeMessage()`:

1. Nutrition tools still gated in `AvaSheet` (7.7.1) — never overridden by model
2. Try `requestAvaChat()` → Edge Function when Supabase auth + function available
3. Edge Function fetches trusted facts (4 parallel queries) and merges session context
4. On failure → `respondToAvaMessage()` deterministic fallback (7.7.1)
5. Daily Briefing always uses deterministic path only

Session memory remains client-scoped and bounded. No chat persistence / SQL migration.

See deployment: `docs/supabase/AVA_CHAT_SETUP_7_7_2.md`

## Server-grounded model context (Patch 7.7.4)

Edge Function query strategy (parallel, per message):

1. `foundry_state` — athlete blob (readiness, history, program, active workout)
2. `coach_assignments` — active assigned/started rows for authenticated athlete
3. `nutrition_profiles` — macro goals
4. `nutrition_days` — today's log snapshot

Canonical workout resolution on server uses the same priority as the app: active workout → coach assignment (from DB, not client) → selected → schedule → program.

Private coach tables (`coach_client_notes`, `coach_weekly_reviews`, etc.) are never queried for athlete AVA.

Local-only limitation: if `foundry_state` has no cloud row, server marks facts as `unverified-local-only` and deterministic fallback remains the richer path offline.

## Future extension points

| Extension | Approach |
|-----------|----------|
| Coach-side AVA | Separate portfolio synthesis; reuse `clientIntelligence.js` patterns |
| Workout adaptation | Separate controlled system with explicit athlete confirmation |
| Conversation persistence | Only if product requires cross-session memory audit trail |

## Distinction: deterministic vs conversational / LLM

| Deterministic engine (7.6+) | Deterministic conversation (7.7.1) | Model layer (7.7.2) |
|----------------------------|-----------------------------------|---------------------|
| Canonical workout truth | Intent routing + referents | Natural language understanding |
| Readiness / recovery state | Session constraints (client) | Subjective acknowledgment |
| Validated metrics only | Nutrition tool safety gate | Must not invent app facts |
| Primary recommendation | Fallback when model unavailable | Concise phrasing + judgment |
| Coach assignment truth | Coach-aware copy | Same guardrails |
| Daily Briefing | Ask AVA fallback | Ask AVA primary when online |
| Testable, reproducible | Testable intent handlers | Structured JSON + allowlist |

The language layer **must not** invent or override factual app state.

## Key files

- `src/lib/avaIntelligence.js` — synthesis engine
- `src/lib/avaContext.js` — shared context packet for briefing + conversation
- `src/lib/avaModelContext.js` — client session payload builder (no authoritative facts)
- `src/lib/avaTrustedContext.js` — trust-boundary spec + test helpers
- `src/lib/avaChatBackend.js` — authenticated Edge Function client
- `src/lib/avaModelActions.js` — action allowlist + client mapping
- `src/lib/avaConversation.js` — deterministic session memory + fallback handlers
- `src/lib/avaConversationalRouter.js` — nutrition vs conversation routing
- `supabase/functions/ava-chat/index.ts` — secure model proxy
- `supabase/functions/ava-chat/trustedContext.ts` — server-trusted context resolution
- `src/ava/AvaService.js` — model-first with deterministic fallback
- `src/ava/AvaUiProvider.jsx` — builds context packet, manages session
- `src/ava/AvaSheet.jsx` — Ask AVA chat UI
