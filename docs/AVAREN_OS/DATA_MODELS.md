# Data Models

This document describes the current conceptual models. Exact implementation may evolve.

## Root application state

```js
{
  program,
  activeWorkout,
  history,
  achievements,
  baselines,
  selectedWorkout,
  weeklySchedule,
  mobility,
  lastBackupAt,
  schemaVersion
}
```

## Program

```js
{
  rotation: ["Chest + Back", "Arms", "Legs + Core"],
  nextWorkout: "Chest + Back",
  workouts: {
    "Chest + Back": [
      {
        name: "Bench Press",
        muscle: "Chest",
        sets: 4,
        supersetGroup: ""
      }
    ]
  }
}
```

## Active workout

```js
{
  id,
  name,
  date,
  startedAt,
  activeExerciseIndex,
  exercises: [
    {
      id,
      name,
      muscle,
      supersetGroup,
      skipped,
      sets: [
        {
          id,
          number,
          type,
          weight,
          reps,
          done
        }
      ]
    }
  ]
}
```

## Completed session

```js
{
  id,
  name,
  date,
  startedAt,
  finishedAt,
  sets: [
    {
      exercise,
      muscle,
      type,
      weight,
      reps,
      estimatedOneRepMax
    }
  ]
}
```

## Mobility state

```js
{
  durationPreferences: {
    "hip-flexor": 45
  },
  completed: [
    {
      id,
      flowId,
      title,
      completedAt
    }
  ]
}
```

## Journey event

```js
{
  id,
  type,
  occurredAt,
  title,
  subtitle,
  summary,
  source
}
```

Supported conceptual event types:

- Workout
- Personal record
- Daily Reset
- Recovery Flow
- Streak
- Milestone

## Milestone

```js
{
  id,
  type,
  title,
  subtitle,
  value,
  achievedAt
}
```

## Coach insight — planned

```js
{
  id,
  category,
  priority,
  title,
  description,
  evidence,
  action,
  generatedAt,
  expiresAt,
  fingerprint
}
```

The fingerprint prevents the same insight from being repeated too often.

## Forge achievement — planned

```js
{
  id,
  title,
  category,
  rarity,
  description,
  metric,
  target,
  progress,
  unlockedAt
}
```

## Schema rules

- Every persistent model needs a stable ID.
- Dates should be stored as ISO strings.
- Derived analytics should not be saved unless caching is required.
- State migrations must increment `schemaVersion`.
- Cloud records must be scoped to the authenticated user.
- Deleting a source event must update derived Journey and analytics results.
