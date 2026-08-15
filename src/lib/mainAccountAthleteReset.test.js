import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_PROGRAM } from '../data/defaultProgram'
import { STATE_SCHEMA_VERSION } from './stateSchema'
import {
  applyLocalAthleteReset,
  buildDefaultAthleteProgramState,
  buildFreshAthleteFoundryState,
  buildLocalAthleteStorageKey,
  FOUNDRY_RESET_DEFAULT_SLICES,
  isSelfAssignedCoachAssignment,
  LOCAL_PRESERVED_KEYS,
  MAIN_ACCOUNT_OWNER_EMAIL,
  REUSABLE_COACH_DEFINITION_TABLES,
  resolveMainAccountTargetFromSession,
  shouldPreserveCoachAssignmentRow,
  shouldResetCoachAssignmentRow,
} from './mainAccountAthleteReset'
import { parsePushDeepLinkUrl } from './appointmentDeepLink'

const repoRoot = resolve(import.meta.dirname, '../..')

describe('mainAccountAthleteReset foundry state', () => {
  const dirtyState = {
    ownerUserId: 'owner-1',
    schemaVersion: STATE_SCHEMA_VERSION,
    history: [{ id: 'w1', name: 'Leg Day', date: '2026-08-01' }],
    activeWorkout: { name: 'Chest', exercises: [], activeExerciseIndex: 2 },
    achievements: [{ id: 'a1' }],
    sessionExecutionPlan: { id: 'plan-1' },
    athleteFollowUps: [{ id: 'f1' }],
    mobility: { completed: [{ id: 'm1' }], durationPreferences: { squat: 60 } },
    readiness: {
      entries: [{ date: '2026-08-07', sleep: 4 }],
      lastPromptedDate: '2026-08-07',
    },
    notifications: { read: ['n1'], dismissed: [], actedOn: [] },
    onboarding: { completed: true, completedAt: '2026-07-01T00:00:00.000Z' },
    program: {
      rotation: ['Dev Day'],
      nextWorkout: 'Dev Day',
      workouts: { 'Dev Day': [{ name: 'Test Press', sets: 1, muscle: 'Chest' }] },
    },
    weeklySchedule: { 1: 'Dev Day', 2: 'Dev Day' },
    selectedWorkout: 'Dev Day',
    baselines: { 'Test Press': 999 },
    nutrition: {
      goals: { calories: 2500 },
      days: { '2026-08-07': { meals: [] } },
      savedFoods: [{ id: 'food-1' }],
      recipes: [{ id: 'recipe-1' }],
      recentFoodIds: ['food-1'],
    },
    coach: { history: [{ id: 'insight-1' }], lastShownInsight: 'insight-1' },
    coachWorkspace: {
      role: 'coach',
      modeEnabled: true,
      clients: [{ id: 'client-1' }],
      invitations: [{ id: 'inv-1' }],
      assignments: [{ id: 'assign-1' }],
    },
  }

  it('clears athlete behavioral history while preserving onboarding and nutrition goals', () => {
    const fresh = buildFreshAthleteFoundryState(dirtyState, {
      now: new Date('2026-08-14T12:00:00.000Z'),
    })

    expect(fresh.history).toEqual([])
    expect(fresh.activeWorkout).toBeNull()
    expect(fresh.achievements).toEqual([])
    expect(fresh.sessionExecutionPlan).toBeNull()
    expect(fresh.athleteFollowUps).toEqual([])
    expect(fresh.mobility.completed).toEqual([])
    expect(fresh.mobility.durationPreferences).toEqual({ squat: 60 })
    expect(fresh.readiness.entries).toEqual([])
    expect(fresh.coach.history).toEqual([])
    expect(fresh.nutrition.days).toEqual({})
    expect(fresh.nutrition.goals).toEqual({ calories: 2500 })
    expect(fresh.nutrition.savedFoods).toEqual([{ id: 'food-1' }])
    expect(fresh.onboarding.completed).toBe(true)
  })

  it('rebuilds program and weeklySchedule from canonical defaults instead of old dev state', () => {
    const fresh = buildFreshAthleteFoundryState(dirtyState)
    const defaults = buildDefaultAthleteProgramState()

    expect(fresh.program).toEqual(defaults.program)
    expect(fresh.weeklySchedule).toEqual(defaults.weeklySchedule)
    expect(fresh.selectedWorkout).toBe(DEFAULT_PROGRAM.nextWorkout)
    expect(fresh.baselines).toEqual(defaults.baselines)
    expect(fresh.program).not.toEqual(dirtyState.program)
    expect(fresh.weeklySchedule).not.toEqual(dirtyState.weeklySchedule)
    expect(fresh.selectedWorkout).not.toBe('Dev Day')
    expect(fresh.history).toEqual([])
    expect(fresh.activeWorkout).toBeNull()
  })

  it('preserves coach mode flags but clears local coach workspace cache', () => {
    const fresh = buildFreshAthleteFoundryState(dirtyState)

    expect(fresh.coachWorkspace.modeEnabled).toBe(true)
    expect(fresh.coachWorkspace.role).toBe('coach')
    expect(fresh.coachWorkspace.clients).toEqual([])
    expect(fresh.coachWorkspace.invitations).toEqual([])
    expect(fresh.coachWorkspace.assignments).toEqual([])
  })

  it('matches SQL foundry defaults JSON mirror', () => {
    const jsonDefaults = JSON.parse(
      readFileSync(
        resolve(
          repoRoot,
          'docs/supabase/AVAREN_MAIN_ACCOUNT_ATHLETE_RESET_FOUNDRY_DEFAULTS.json',
        ),
        'utf8',
      ),
    )

    expect(JSON.parse(JSON.stringify(FOUNDRY_RESET_DEFAULT_SLICES))).toEqual(
      jsonDefaults,
    )
  })
})

describe('mainAccountAthleteReset assignment predicates', () => {
  const targetUserId = 'owner-1'

  it('resets athlete-subject assignment instances including self-assigned test rows', () => {
    expect(
      shouldResetCoachAssignmentRow(
        { coach_id: targetUserId, athlete_id: targetUserId },
        targetUserId,
      ),
    ).toBe(true)
    expect(
      shouldResetCoachAssignmentRow(
        { coach_id: 'other-coach', athlete_id: targetUserId },
        targetUserId,
      ),
    ).toBe(true)
    expect(isSelfAssignedCoachAssignment(
      { coach_id: targetUserId, athlete_id: targetUserId },
      targetUserId,
    )).toBe(true)
  })

  it('preserves coach-to-client assignment instances and reusable coach definitions', () => {
    expect(
      shouldPreserveCoachAssignmentRow(
        { coach_id: targetUserId, athlete_id: 'client-1' },
        targetUserId,
      ),
    ).toBe(true)
    expect(
      shouldResetCoachAssignmentRow(
        { coach_id: targetUserId, athlete_id: 'client-1' },
        targetUserId,
      ),
    ).toBe(false)
    expect(REUSABLE_COACH_DEFINITION_TABLES).toEqual([
      'coach_programs',
      'coach_workout_templates',
    ])
  })
})

describe('mainAccountAthleteReset local storage', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it('replaces local athlete cache without touching coach mode preference', () => {
    const userId = 'owner-1'
    window.localStorage.setItem('avaren:last-mode:owner-1', 'coach')
    window.localStorage.setItem(
      buildLocalAthleteStorageKey(userId),
      JSON.stringify({
        ownerUserId: userId,
        history: [{ id: 'old' }],
        program: { nextWorkout: 'Dev Day' },
      }),
    )

    const { applied, nextState } = applyLocalAthleteReset({
      userId,
      currentState: {
        history: [{ id: 'old' }],
        onboarding: { completed: true },
        program: { nextWorkout: 'Dev Day' },
      },
    })

    expect(applied).toBe(true)
    expect(nextState.history).toEqual([])
    expect(nextState.program.nextWorkout).toBe(DEFAULT_PROGRAM.nextWorkout)
    expect(window.localStorage.getItem('avaren:last-mode:owner-1')).toBe('coach')
  })

  it('documents preserved local keys separately from athlete cache and push auth', () => {
    expect(LOCAL_PRESERVED_KEYS.some((entry) => entry.includes('last-mode'))).toBe(
      true,
    )
    expect(LOCAL_PRESERVED_KEYS.some((entry) => entry.includes('foundry-user'))).toBe(
      false,
    )
    expect(LOCAL_PRESERVED_KEYS.some((entry) => entry.includes('auth.token'))).toBe(
      true,
    )
  })
})

describe('mainAccountAthleteReset target resolution', () => {
  it('resolves primary owner account from session email', () => {
    expect(MAIN_ACCOUNT_OWNER_EMAIL).toBe('hello@avarenfitness.com')
    expect(
      resolveMainAccountTargetFromSession({
        user: { id: 'uuid-1', email: 'hello@avarenfitness.com' },
      }),
    ).toEqual({
      userId: 'uuid-1',
      email: 'hello@avarenfitness.com',
      matchesPrimaryOwner: true,
    })
  })

  it('does not treat unrelated sessions as primary owner reset targets', () => {
    expect(
      resolveMainAccountTargetFromSession({
        user: { id: 'uuid-2', email: 'athlete@example.com' },
      }).matchesPrimaryOwner,
    ).toBe(false)
  })
})

describe('mainAccountAthleteReset push routing sanity', () => {
  it('keeps appointment push deep links independent from athlete reset work', () => {
    expect(parsePushDeepLinkUrl('/?session=appt-1&open=appointment-detail')?.sessionId).toBe(
      'appt-1',
    )
  })
})
