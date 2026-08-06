import { describe, expect, it } from 'vitest'
import {
  STATE_SCHEMA_VERSION,
  detectStoredSchemaVersion,
  migrateStoredState,
} from './stateSchema'

const fallback = {
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
  nutrition: {
    schemaVersion: 2,
    goals: {},
    days: {},
    savedFoods: [],
    recipes: [],
    recentFoodIds: [],
    favoriteFoodIds: [],
  },
}

describe('state schema migration', () => {
  it('uses a single current schema version', () => {
    expect(STATE_SCHEMA_VERSION).toBe(3)
  })

  it('detects legacy states without an explicit version', () => {
    expect(detectStoredSchemaVersion({ history: [] })).toBe(1)
    expect(
      detectStoredSchemaVersion({
        mobility: { completed: [] },
        history: [{ id: '1' }],
      }),
    ).toBe(2)
    expect(
      detectStoredSchemaVersion({
        nutrition: { days: {} },
        history: [{ id: '1' }],
      }),
    ).toBe(3)
  })

  it('migrates v1 state without dropping workout history', () => {
    const legacy = {
      ownerUserId: 'user-1',
      history: [{ id: 'session-1', name: 'Chest + Back' }],
      program: { nextWorkout: 'Arms' },
    }

    const migrated = migrateStoredState(legacy, fallback)

    expect(migrated.schemaVersion).toBe(STATE_SCHEMA_VERSION)
    expect(migrated.history).toEqual(legacy.history)
    expect(migrated.program).toEqual(legacy.program)
    expect(migrated.ownerUserId).toBe('user-1')
    expect(migrated.mobility).toEqual(fallback.mobility)
    expect(migrated.nutrition).toEqual(fallback.nutrition)
  })

  it('migrates v2 state to include nutrition while preserving data', () => {
    const legacy = {
      schemaVersion: 2,
      ownerUserId: 'user-2',
      history: [{ id: 'session-2' }],
      mobility: { completed: ['flow-1'], durationPreferences: { hips: 90 } },
      readiness: { entries: [{ date: '2026-08-01', score: 4 }] },
    }

    const migrated = migrateStoredState(legacy, fallback)

    expect(migrated.schemaVersion).toBe(STATE_SCHEMA_VERSION)
    expect(migrated.history).toEqual(legacy.history)
    expect(migrated.mobility).toEqual(legacy.mobility)
    expect(migrated.readiness).toEqual(legacy.readiness)
    expect(migrated.nutrition).toEqual(fallback.nutrition)
  })

  it('leaves current-state payloads intact', () => {
    const current = {
      schemaVersion: STATE_SCHEMA_VERSION,
      ownerUserId: 'user-3',
      history: [{ id: 'session-3' }],
      nutrition: {
        days: { '2026-08-01': { foods: [] } },
      },
    }

    const migrated = migrateStoredState(current, fallback)

    expect(migrated).toEqual(current)
  })
})
