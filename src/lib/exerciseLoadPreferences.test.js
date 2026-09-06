import { describe, expect, it } from 'vitest'
import { LOAD_TYPES } from './exerciseLoad'
import {
  mostRecentLoadTypeFromHistory,
  rememberExerciseLoadType,
  rememberLoadTypesFromSession,
  resolvePreferredLoadType,
} from './exerciseLoadPreferences'
import { materializeWorkoutExercise } from './materializeWorkoutExercise'

describe('exercise load type persistence', () => {
  const templateA = {
    name: 'Bench Press',
    muscle: 'Chest',
    sets: 3,
    loadType: LOAD_TYPES.EXTERNAL,
  }
  const templateB = {
    name: 'Pull-up',
    muscle: 'Back',
    sets: 3,
    loadType: LOAD_TYPES.BODYWEIGHT,
  }

  it('persists external weight into the next session', () => {
    let preferences = {}
    preferences = rememberExerciseLoadType(
      preferences,
      { name: 'Bench Press' },
      LOAD_TYPES.EXTERNAL,
    )

    const next = materializeWorkoutExercise(templateA, {
      loadPreferences: preferences,
    })

    expect(next.loadType).toBe(LOAD_TYPES.EXTERNAL)
  })

  it('persists bodyweight into the next session', () => {
    let preferences = {}
    preferences = rememberExerciseLoadType(
      preferences,
      { name: 'Bench Press' },
      LOAD_TYPES.BODYWEIGHT,
    )

    const next = materializeWorkoutExercise(templateA, {
      loadPreferences: preferences,
    })

    expect(next.loadType).toBe(LOAD_TYPES.BODYWEIGHT)
    expect(templateA.loadType).toBe(LOAD_TYPES.EXTERNAL)
  })

  it('persists assisted into the next session', () => {
    let preferences = {}
    preferences = rememberExerciseLoadType(
      preferences,
      { name: 'Pull-up', sourceExerciseId: 'pull-up-1' },
      LOAD_TYPES.ASSISTED,
    )

    const next = materializeWorkoutExercise(
      { ...templateB, exerciseId: 'pull-up-1' },
      { loadPreferences: preferences },
    )

    expect(next.loadType).toBe(LOAD_TYPES.ASSISTED)
    expect(next.sourceExerciseId).toBe('pull-up-1')
  })

  it('reload/resume preserves selected loadType on the active exercise object', () => {
    const active = materializeWorkoutExercise(templateA)
    active.loadType = LOAD_TYPES.ASSISTED

    const preferences = rememberExerciseLoadType(
      {},
      active,
      active.loadType,
    )

    const cloned = structuredClone(active)
    expect(cloned.loadType).toBe(LOAD_TYPES.ASSISTED)

    const rematerialized = materializeWorkoutExercise(templateA, {
      loadPreferences: preferences,
    })
    expect(rematerialized.loadType).toBe(LOAD_TYPES.ASSISTED)
  })

  it('changing exercise A does not change exercise B', () => {
    let preferences = {}
    preferences = rememberExerciseLoadType(
      preferences,
      { name: 'Bench Press' },
      LOAD_TYPES.BODYWEIGHT,
    )

    const a = materializeWorkoutExercise(templateA, {
      loadPreferences: preferences,
    })
    const b = materializeWorkoutExercise(templateB, {
      loadPreferences: preferences,
    })

    expect(a.loadType).toBe(LOAD_TYPES.BODYWEIGHT)
    expect(b.loadType).toBe(LOAD_TYPES.BODYWEIGHT)
    expect(templateB.loadType).toBe(LOAD_TYPES.BODYWEIGHT)

    preferences = rememberExerciseLoadType(
      preferences,
      { name: 'Pull-up' },
      LOAD_TYPES.ASSISTED,
    )

    const a2 = materializeWorkoutExercise(templateA, {
      loadPreferences: preferences,
    })
    const b2 = materializeWorkoutExercise(templateB, {
      loadPreferences: preferences,
    })

    expect(a2.loadType).toBe(LOAD_TYPES.BODYWEIGHT)
    expect(b2.loadType).toBe(LOAD_TYPES.ASSISTED)
  })

  it('does not destructively mutate the coach/template source', () => {
    const coachTemplate = {
      id: 'ex-coach-1',
      name: 'Lat Pulldown',
      muscle: 'Back',
      sets: 4,
      reps: '8-12',
      loadType: LOAD_TYPES.EXTERNAL,
    }
    const snapshot = structuredClone(coachTemplate)

    const preferences = rememberExerciseLoadType(
      {},
      { name: 'Lat Pulldown', sourceExerciseId: 'ex-coach-1' },
      LOAD_TYPES.BODYWEIGHT_ADDED,
    )

    const materialized = materializeWorkoutExercise(coachTemplate, {
      loadPreferences: preferences,
    })

    expect(materialized.loadType).toBe(LOAD_TYPES.BODYWEIGHT_ADDED)
    expect(coachTemplate).toEqual(snapshot)
  })

  it('durable history retains historical loadType and seeds next session', () => {
    const history = [
      {
        id: 'durable-1',
        name: 'Back',
        finishedAt: '2026-09-05T18:00:00.000Z',
        sets: [
          {
            exercise: 'Pull-up',
            loadType: LOAD_TYPES.ASSISTED,
            assistance: 40,
            weight: 0,
            reps: 8,
          },
        ],
        exercisesPerformed: [
          {
            name: 'Pull-up',
            loadType: LOAD_TYPES.ASSISTED,
            skipped: false,
          },
        ],
      },
    ]

    expect(mostRecentLoadTypeFromHistory(history, 'Pull-up')).toBe(
      LOAD_TYPES.ASSISTED,
    )

    const next = materializeWorkoutExercise(templateB, { history })
    expect(next.loadType).toBe(LOAD_TYPES.ASSISTED)

    const preferences = rememberLoadTypesFromSession({}, history[0])
    expect(
      resolvePreferredLoadType(templateB, { loadPreferences: preferences }),
    ).toBe(LOAD_TYPES.ASSISTED)
  })

  it('prefers stored athlete preference over older history', () => {
    const history = [
      {
        id: 'older',
        sets: [
          {
            exercise: 'Bench Press',
            loadType: LOAD_TYPES.EXTERNAL,
            weight: 185,
            reps: 5,
          },
        ],
      },
    ]
    const preferences = rememberExerciseLoadType(
      {},
      { name: 'Bench Press' },
      LOAD_TYPES.BODYWEIGHT,
    )

    expect(
      resolvePreferredLoadType(templateA, {
        loadPreferences: preferences,
        history,
      }),
    ).toBe(LOAD_TYPES.BODYWEIGHT)
  })
})
