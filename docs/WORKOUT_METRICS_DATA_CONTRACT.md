# Workout Metrics Data Contract

This document defines how AVAREN interprets logged workout data for strength metrics, volume, PRs, and AVA performance wins.

## Set shapes in history

Completed sessions store flat sets:

```js
{
  exercise: string,
  muscle: string,
  type: string,
  weight: number,
  reps: number,
  estimatedOneRepMax: number,
}
```

Active in-progress sets may use empty strings before completion.

## Measurement modes

Resolved via `getExerciseMeasurementMode(exerciseName, set)`:

| Mode | Meaning | Weighted volume | e1RM | Load PR |
|------|---------|-----------------|------|---------|
| `weighted-reps` | Barbell/dumbbell/machine/cable load work | Yes | Yes | Yes |
| `bodyweight-reps` | Bodyweight/core/mobility reps | No | No | No |
| `duration` | Time-based work | No | No | No |
| `distance` | Distance-based work | No | No | No |
| `unsupported` | Stretching/mobility/unknown | No | No | No |

Exercise metadata comes from `COMMON_EXERCISES` when available, with deterministic name-pattern fallbacks.

## Weighted volume eligibility

A set contributes to session volume only when `isValidStrengthSet(set)` is true:

- Exercise identity present
- Measurement mode is `weighted-reps`
- Finite weight > 0 and reps > 0
- Weight ≤ 1500 lb and reps ≤ 100

If no eligible sets exist in a session, weighted volume is **0** and no volume PR is emitted.

## e1RM eligibility

Estimated 1RM is computed only for valid strength sets using the existing Epley-style formula in `metrics.js`.

Bodyweight, mobility, duration, and malformed sets return `null`.

## PR comparability

`recentValidatedPRs()` compares like-for-like per exercise:

- **Heaviest Set** — valid load-tracked sets only
- **Estimated 1RM** — valid load-tracked sets only
- **Session Volume** — sum of valid load volume for that exercise in one session; PR emitted only when volume ≥ 100 lb

Prior malformed records are ignored; history is never deleted automatically.

## AVA performance win gate

`selectAvaPerformanceWin()` adds a final safety filter:

- Rejects wins from non-strength exercises
- Rejects trivial volume PRs (< 100 lb)
- Rejects implausible heaviest/e1RM values (< 45 lb)
- Omits the Win section entirely when no trustworthy win exists

## Invalid data handling

- Never throw on malformed records
- Never fabricate zeros into meaningful metrics
- Never treat accidental numeric fields on mobility/bodyweight work as load
- Old bad data remains in history but is excluded from analytics

## Non-weighted exercises

Bodyweight and mobility movements may still appear in workout history and completion counts, but they do not produce weighted PRs, e1RM trends, or AVA strength wins.

## Implementation

- `src/lib/workoutMetrics.js` — measurement modes + validators
- `src/lib/metrics.js` — public metrics API built on validators
- `src/lib/avaIntelligence.js` — AVA wins via `selectAvaPerformanceWin()`
