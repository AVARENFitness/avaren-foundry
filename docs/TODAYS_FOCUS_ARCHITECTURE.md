# Today's Focus Architecture

Today's Focus is The Forge daily guidance layer on Home. It surfaces **one** clear recommendation for the day without duplicating domain scoring logic.

User-facing name: **Today's Focus**  
Internal module prefix: `todaysFocus` / `TodaysFocus`

This is separate from The Forge **achievements** system (`src/lib/forge.js`, `ForgeScreen.jsx`).

---

## Purpose

Open Home and know what matters today — one primary action, one short explanation, optional "Why this?" detail.

AVA is not involved. No AI provider. No auto-open sheets. No silent mutations to schedules, workouts, nutrition, or readiness.

---

## Module Map

| Module | Role |
|--------|------|
| `src/lib/todaysFocus.js` | Pure selector — derives focus from app state + optional context |
| `src/components/TodaysFocusWhySheet.jsx` | Calm explanation sheet for "Why this?" |
| `src/screens/HomeScreen.jsx` | Hero UI, action routing, quieter disclosures below |

---

## Focus Types

| Type | When used |
|------|-----------|
| `train` | Active or planned workout, coach assignment |
| `recover` | Low readiness or recovery habits behind training |
| `rest` | Scheduled rest day |
| `nutrition` | Afternoon logging lag |
| `consistency` | New user, missing check-in, inactivity gap, fallback |

---

## Priority Order

The selector evaluates rules **top to bottom**; the first match wins.

1. **Active workout in progress** → Train · Continue Workout  
2. **Coach assignment due today** → Train · Start Workout  
3. **New athlete (no workout history)** → Consistency · Check In  
4. **Missing today’s readiness check-in** → Consistency · Check In  
5. **Low readiness (`recovery-day` recommendation)** → Recover · Begin Recovery  
6. **Scheduled rest day** → Rest · View Today  
7. **Recovery habits behind recent training** → Recover · Begin Recovery  
8. **Extended inactivity (5+ days since last workout)** → Consistency · Start Workout  
9. **Nutrition logging lag (afternoon, &lt;35% of calorie goal)** → Nutrition · Log Food  
10. **Default planned training** → Train · Start Workout  
11. **Fallback (no clear plan)** → Consistency · View Today  

Priority order is documented in `deriveTodaysFocus()` in `src/lib/todaysFocus.js`.

---

## Reused Domain Engines

Today's Focus **does not** reimplement scoring. It delegates to:

| Engine | Module | Used for |
|--------|--------|----------|
| Readiness | `src/lib/readiness.js` | `calculateReadiness()` |
| Training recommendations | `src/lib/trainingRecommendations.js` | `buildTrainingRecommendation()`, `TRAINING_RECOMMENDATIONS.RECOVERY_DAY` |
| Recovery intelligence | `src/data/mobility.js` | `calculateRecoveryIntelligence()` |
| Analytics | `src/lib/analytics.js` | `analyticsSnapshot()` — streaks, history counts |
| Nutrition | `src/lib/nutrition.js` | `nutritionTotals()`, `nutritionDateKey()` |
| Coach assignments | `src/lib/coachBackend.js` | Fetched in Home; passed as `assignmentDueToday` context |

---

## API

```js
deriveTodaysFocus(state, context?)
```

**Returns:**

```js
{
  type: 'train' | 'recover' | 'rest' | 'nutrition' | 'consistency',
  title: string,
  explanation: string,
  action: 'start-workout' | 'continue-workout' | 'begin-recovery' | 'log-food' | 'check-in' | 'view-today',
  actionLabel: string,
  reasons: string[],
  meta: object,
  generatedAt: ISO-8601 string,
}
```

**Context (optional):**

| Field | Purpose |
|-------|---------|
| `assignmentDueToday` | Coach assignment object due today |
| `now` | Fixed date for tests |

Helper: `assignmentDueToday(assignments, now?)` filters coach assignments due today.

---

## Home UI Contract

### Hero

- Eyebrow: `TODAY'S FOCUS`
- Focus title
- One short explanation
- One primary gold action
- Text link: **Why this?** → explanation sheet

### Below hero (unchanged, quieter)

- Coach assignments (`AthleteAssignmentHome`, compact)
- Daily essentials disclosure (readiness, nutrition, movement, recovery)
- This week disclosure (stats + progress link)

### Action routing (HomeScreen)

| Action | Behavior |
|--------|----------|
| Continue / Start Workout | `onStart()` or coach assignment start |
| Begin Recovery | `onOpenReset()` |
| Log Food | Navigate to nutrition |
| Check In | Open readiness check-in |
| View Today | Navigate to train hub |

---

## Empty & Edge States

| State | Behavior |
|-------|----------|
| No history | Invite check-in; do not claim readiness |
| No workout planned | Fallback copy; View Today / train hub |
| Missing readiness | Check In focus; no "recovered" claims |
| Low readiness | Recovery focus via existing recommendation engine |

Copy stays general fitness guidance — no medical or injury advice.

---

## Non-Goals (Part 1)

- No AVA integration or chat UI
- No external AI
- No schedule/workout/nutrition mutations from the selector
- No renaming Forge achievements
- No new card wall on Home

---

## Related Documents

- `docs/PRODUCT_BLUEPRINT.md` — Home pillar, one primary action
- `docs/AVA_ARCHITECTURE.md` — AVA stays on-demand only
- `docs/ROADMAP.md` — The Forge sequencing
