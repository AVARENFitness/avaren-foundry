import { describe, expect, it } from 'vitest'
import { createNutritionState } from './nutrition'
import { migrateStoredState, STATE_SCHEMA_VERSION } from './stateSchema'
import { normalizeAppState } from './storage'

const cleanFallback = {
  ownerUserId: null,
  program: { rotation: [], nextWorkout: null, workouts: {} },
  activeWorkout: null,
  history: [],
  achievements: [],
  baselines: {},
  selectedWorkout: null,
  weeklySchedule: {
    0: 'Rest',
    1: 'Rest',
    2: 'Rest',
    3: 'Rest',
    4: 'Rest',
    5: 'Rest',
    6: 'Rest',
  },
  mobility: { durationPreferences: {}, completed: [] },
  readiness: { entries: [], lastPromptedDate: null },
  notifications: { read: [], dismissed: [], actedOn: [] },
  onboarding: { completed: false, completedAt: null },
  coach: { history: [], lastShownInsight: null },
  coachWorkspace: {
    role: 'athlete',
    modeEnabled: false,
    clients: [],
    invitations: [],
    assignments: [],
  },
  nutrition: createNutritionState(),
}

describe('clean-slate account foundation', () => {
  it('does not inject a workout program into a new account', () => {
    const state = normalizeAppState({}, cleanFallback, 'new-user')

    expect(state.program.rotation).toEqual([])
    expect(state.program.workouts).toEqual({})
    expect(state.program.nextWorkout).toBeNull()
    expect(state.selectedWorkout).toBeNull()
    expect(state.baselines).toEqual({})
  })

  it('does not invent calorie or macro targets for a new account', () => {
    const state = normalizeAppState({}, cleanFallback, 'new-user')

    expect(state.nutrition.goals.configured).toBe(false)
    expect(state.nutrition.goals.source).toBe('not_configured')
    expect(state.nutrition.goals.calories).toBeNull()
    expect(state.nutrition.goals.protein).toBeNull()
    expect(state.nutrition.goals.carbs).toBeNull()
    expect(state.nutrition.goals.fat).toBeNull()
  })

  it('preserves an existing user program instead of replacing it', () => {
    const state = normalizeAppState(
      {
        schemaVersion: STATE_SCHEMA_VERSION,
        program: {
          rotation: ['My Workout'],
          nextWorkout: 'My Workout',
          workouts: { 'My Workout': [{ name: 'Squat', sets: 3 }] },
        },
        selectedWorkout: 'My Workout',
      },
      cleanFallback,
      'existing-user',
    )

    expect(state.program.rotation).toEqual(['My Workout'])
    expect(state.program.workouts['My Workout']).toHaveLength(1)
    expect(state.selectedWorkout).toBe('My Workout')
  })

  it('clears the untouched legacy 2200-calorie seed instead of treating it as personal', () => {
    const migrated = migrateStoredState(
      {
        schemaVersion: 4,
        nutrition: {
          schemaVersion: 3,
          goals: {
            calories: 2200,
            protein: 170,
            carbs: 230,
            fat: 70,
            fiber: 30,
            waterOz: 100,
            bottleOz: 33.8,
            weightGoal: '',
            coachAccess: false,
            configured: true,
            source: 'legacy_existing',
            calculationVersion: null,
          },
          days: {
            '2026-09-30': {
              date: '2026-09-30',
              foods: [{ id: 'food-1', name: 'Chicken', calories: 200 }],
              waterOz: 0,
            },
          },
        },
      },
      cleanFallback,
    )

    expect(migrated.schemaVersion).toBe(STATE_SCHEMA_VERSION)
    expect(migrated.nutrition.goals.configured).toBe(false)
    expect(migrated.nutrition.goals.source).toBe('not_configured')
    expect(migrated.nutrition.goals.calories).toBeNull()
    expect(migrated.nutrition.days['2026-09-30'].foods).toHaveLength(1)
  })

  it('preserves genuinely customized legacy nutrition targets', () => {
    const migrated = migrateStoredState(
      {
        schemaVersion: 4,
        nutrition: {
          schemaVersion: 3,
          goals: {
            calories: 2450,
            protein: 185,
            carbs: 260,
            fat: 75,
            fiber: 30,
            configured: true,
            source: 'legacy_existing',
          },
        },
      },
      cleanFallback,
    )

    expect(migrated.nutrition.goals.configured).toBe(true)
    expect(migrated.nutrition.goals.calories).toBe(2450)
    expect(migrated.nutrition.goals.protein).toBe(185)
  })
})
