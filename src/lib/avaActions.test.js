import { describe, expect, it } from 'vitest'
import {
  AVA_ACTION_TYPES,
  buildAvaDailyAction,
  selectPrimaryAvaAction,
  selectAvaWatchItem,
  shouldSuggestMorningMovement,
} from './avaActions'
import {
  buildAvaContext,
  buildAvaDailyBriefing,
  buildAvaEvidence,
  buildAvaWatchItems,
  buildAvaWins,
  AVA_DAILY_STATES,
} from './avaIntelligence'

const today = new Date().toISOString().slice(0, 10)
const morning = new Date(`${today}T09:00:00`)
const afternoon = new Date(`${today}T14:00:00`)
const evening = new Date(`${today}T18:00:00`)

const readinessEntry = (overrides = {}) => ({
  id: 'ready-1',
  date: today,
  sleep: 4,
  energy: 4,
  soreness: 2,
  stress: 2,
  completedAt: `${today}T08:00:00`,
  ...overrides,
})

const workout = ({
  id = 'session-1',
  date = today,
  name = 'Upper Body',
  daysAgo = 0,
  sets,
} = {}) => {
  const sessionDate = new Date(`${today}T12:00:00`)
  sessionDate.setDate(sessionDate.getDate() - daysAgo)
  const key = sessionDate.toISOString().slice(0, 10)

  return {
    id,
    name,
    date: key,
    startedAt: `${key}T10:00:00`,
    finishedAt: `${key}T11:00:00`,
    sets: sets ?? [
      {
        exercise: 'Bench Press',
        muscle: 'Chest',
        weight: 135,
        reps: 8,
        estimatedOneRepMax: 170,
      },
    ],
  }
}

const baseState = {
  history: [
    workout({ daysAgo: 1 }),
    workout({ id: 'session-2', daysAgo: 3 }),
  ],
  readiness: {
    entries: [readinessEntry()],
  },
  weeklySchedule: [
    'Rest',
    'Upper Body',
    'Lower Body',
    'Upper Body',
    'Lower Body',
    'Full Body',
    'Rest',
  ],
  selectedWorkout: 'Upper Body',
  program: {
    nextWorkout: 'Upper Body',
    rotation: ['Upper Body', 'Lower Body'],
    workouts: { 'Upper Body': [] },
  },
  mobility: { completed: [] },
}

describe('avaActions', () => {
  it('CASE 1: readiness incomplete + workout scheduled prioritizes check-in', () => {
    const ctx = buildAvaContext(
      {
        ...baseState,
        readiness: { entries: [] },
      },
      { now: morning },
    )
    const action = selectPrimaryAvaAction(ctx, AVA_DAILY_STATES.INSUFFICIENT_DATA)

    expect(action.type).toBe(AVA_ACTION_TYPES.CHECK_READINESS)
    expect(action.label).toBe('Check Readiness')
  })

  it('CASE 2: ready athlete + canonical workout starts that workout', () => {
    const tuesday = new Date(`${today}T12:00:00`)
    while (tuesday.getDay() !== 2) {
      tuesday.setDate(tuesday.getDate() + 1)
    }

    const ctx = buildAvaContext(
      {
        ...baseState,
        history: [workout({ daysAgo: 2 })],
        readiness: {
          entries: [
            readinessEntry({
              date: tuesday.toISOString().slice(0, 10),
            }),
          ],
        },
        mobility: {
          completed: [
            {
              flowId: 'daily-reset',
              completedAt: tuesday.toISOString(),
            },
            {
              flowId: 'recovery-flow',
              completedAt: tuesday.toISOString(),
            },
          ],
        },
      },
      { now: tuesday },
    )
    const action = selectPrimaryAvaAction(ctx, AVA_DAILY_STATES.READY)

    expect(action.type).toBe(AVA_ACTION_TYPES.START_WORKOUT)
    expect(action.label).toContain('Upper Body')
  })

  it('CASE 3: recovery priority prioritizes recovery flow action', () => {
    const ctx = buildAvaContext(
      {
        ...baseState,
        readiness: {
          entries: [
            readinessEntry({
              sleep: 2,
              energy: 2,
              soreness: 5,
              stress: 4,
            }),
          ],
        },
      },
      { now: afternoon },
    )
    const action = selectPrimaryAvaAction(ctx, AVA_DAILY_STATES.RECOVERY_PRIORITY)

    expect(action.type).toBe(AVA_ACTION_TYPES.RECOVERY_FLOW)
  })

  it('CASE 3b: morning movement when recovery context supports it', () => {
    const ctx = buildAvaContext(
      {
        ...baseState,
        history: [workout({ daysAgo: 1 })],
        mobility: { completed: [] },
      },
      { now: morning },
    )

    expect(
      shouldSuggestMorningMovement(ctx, AVA_DAILY_STATES.MANAGE_LOAD),
    ).toBe(true)

    const action = selectPrimaryAvaAction(ctx, AVA_DAILY_STATES.MANAGE_LOAD)
    expect(action.type).toBe(AVA_ACTION_TYPES.MORNING_MOVEMENT)
  })

  it('does not trigger morning movement from time alone', () => {
    const ctx = buildAvaContext(
      {
        ...baseState,
        history: [workout({ daysAgo: 2 })],
        mobility: {
          completed: [
            { flowId: 'recovery-flow', completedAt: morning.toISOString() },
          ],
        },
      },
      { now: morning },
    )

    expect(shouldSuggestMorningMovement(ctx, AVA_DAILY_STATES.READY)).toBe(
      false,
    )

    const action = selectPrimaryAvaAction(ctx, AVA_DAILY_STATES.READY)
    expect(action.type).toBe(AVA_ACTION_TYPES.START_WORKOUT)
  })

  it('prioritizes recovery flow prep when recent training supports it', () => {
    const ctx = buildAvaContext(
      {
        ...baseState,
        mobility: { completed: [] },
      },
      { now: morning },
    )
    const action = selectPrimaryAvaAction(ctx, AVA_DAILY_STATES.READY)

    expect(action.type).toBe(AVA_ACTION_TYPES.RECOVERY_FLOW)
  })

  it('CASE 4: no workout today does not fabricate training action', () => {
    const sunday = new Date(`${today}T12:00:00`)
    while (sunday.getDay() !== 0) {
      sunday.setDate(sunday.getDate() + 1)
    }

    const ctx = buildAvaContext(
      {
        ...baseState,
        selectedWorkout: null,
        program: { ...baseState.program, nextWorkout: null },
      },
      { now: sunday },
    )
    const action = selectPrimaryAvaAction(ctx, AVA_DAILY_STATES.REST)

    expect(action.type).toBe(AVA_ACTION_TYPES.REST)
    expect(action.label).toBeNull()
  })

  it('CASE 5: low-data user receives baseline-building action', () => {
    const briefing = buildAvaDailyBriefing(
      {
        history: [],
        readiness: { entries: [] },
        program: baseState.program,
      },
      { now: morning },
    )

    expect(briefing.primaryAction.type).toBe(AVA_ACTION_TYPES.BUILD_BASELINE)
    expect(briefing.primaryAction.label).toBe('Check Readiness')
  })

  it('CASE 6: performance PR exists but Home briefing omits win analytics', () => {
    const prState = {
      ...baseState,
      history: [
        workout({
          daysAgo: 0,
          sets: [
            {
              exercise: 'Bench Press',
              muscle: 'Chest',
              weight: 185,
              reps: 5,
              estimatedOneRepMax: 215,
            },
          ],
        }),
        workout({
          id: 'old',
          daysAgo: 4,
          sets: [
            {
              exercise: 'Bench Press',
              muscle: 'Chest',
              weight: 175,
              reps: 5,
              estimatedOneRepMax: 204,
            },
          ],
        }),
      ],
      mobility: {
        completed: [
          { flowId: 'daily-reset', completedAt: afternoon.toISOString() },
          { flowId: 'recovery-flow', completedAt: afternoon.toISOString() },
        ],
      },
    }

    const ctx = buildAvaContext(prState, { now: afternoon })
    expect(buildAvaWins(ctx)).not.toBeNull()

    const briefing = buildAvaDailyBriefing(prState, { now: afternoon })
    expect(briefing.win).toBeUndefined()
    expect(JSON.stringify(briefing)).not.toMatch(/Session Volume|2,850/i)
  })

  it('CASE 7: performance data can remain in Why evidence', () => {
    const prState = {
      ...baseState,
      history: [
        workout({
          daysAgo: 0,
          sets: [
            {
              exercise: 'Bench Press',
              muscle: 'Chest',
              weight: 185,
              reps: 5,
              estimatedOneRepMax: 215,
            },
          ],
        }),
      ],
      mobility: {
        completed: [
          { flowId: 'daily-reset', completedAt: afternoon.toISOString() },
          { flowId: 'recovery-flow', completedAt: afternoon.toISOString() },
        ],
      },
    }

    const ctx = buildAvaContext(prState, { now: afternoon })
    const evidence = buildAvaEvidence(ctx, AVA_DAILY_STATES.READY)

    expect(
      evidence.some(
        (item) =>
          item.category === 'Performance' ||
          item.detail?.includes('Bench Press'),
      ),
    ).toBe(true)
  })

  it('CASE 8: coach assignment respects canonical coach workout', () => {
    const assignment = {
      id: 'assign-1',
      status: 'assigned',
      title: 'Chest and Back',
      due_date: today,
      workout_payload: {
        name: 'Chest and Back',
        exercises: [{ name: 'Bench Press', sets: 3, muscle: 'Chest' }],
      },
    }

    const ctx = buildAvaContext(
      {
        ...baseState,
        selectedWorkout: 'Arms',
        mobility: {
          completed: [
            { flowId: 'daily-reset', completedAt: afternoon.toISOString() },
            { flowId: 'recovery-flow', completedAt: afternoon.toISOString() },
          ],
        },
      },
      { now: afternoon, assignments: [assignment] },
    )
    const action = selectPrimaryAvaAction(ctx, AVA_DAILY_STATES.READY)

    expect(action.type).toBe(AVA_ACTION_TYPES.START_WORKOUT)
    expect(action.label).toContain('Chest and Back')
    expect(action.eyebrow).toContain('COACH')
  })

  it('CASE 9: omits watch when no meaningful item exists', () => {
    const quietState = {
      ...baseState,
      history: [workout({ daysAgo: 2 })],
      readiness: {
        entries: [
          readinessEntry({
            date: workout({ daysAgo: 2 }).date,
          }),
        ],
      },
      mobility: {
        completed: [
          { flowId: 'daily-reset', completedAt: afternoon.toISOString() },
          { flowId: 'recovery-flow', completedAt: afternoon.toISOString() },
        ],
      },
      nutrition: { goals: { calories: 2200, protein: 170 }, days: {} },
    }

    const briefing = buildAvaDailyBriefing(quietState, { now: afternoon })

    expect(briefing.watchItem).toBeNull()
    expect(briefing.watch).toEqual([])
  })

  it('CASE 10: selects one deterministic primary action among candidates', () => {
    const ctx = buildAvaContext(
      {
        ...baseState,
        history: [workout({ daysAgo: 2 })],
        mobility: {
          completed: [
            { flowId: 'daily-reset', completedAt: morning.toISOString() },
            { flowId: 'recovery-flow', completedAt: morning.toISOString() },
          ],
        },
      },
      { now: morning },
    )
    const first = buildAvaDailyAction(
      ctx,
      AVA_DAILY_STATES.READY,
      buildAvaWatchItems(ctx, AVA_DAILY_STATES.READY),
    )
    const second = buildAvaDailyAction(
      ctx,
      AVA_DAILY_STATES.READY,
      buildAvaWatchItems(ctx, AVA_DAILY_STATES.READY),
    )

    expect(first.primaryAction.type).toBe(second.primaryAction.type)
    expect(first.primaryAction.label).toBe(second.primaryAction.label)
  })

  it('evening keeps workout as primary action', () => {
    const briefing = buildAvaDailyBriefing(
      {
        ...baseState,
        history: [workout({ daysAgo: 2 })],
        mobility: {
          completed: [
            { flowId: 'daily-reset', completedAt: evening.toISOString() },
            { flowId: 'recovery-flow', completedAt: evening.toISOString() },
          ],
        },
      },
      { now: evening },
    )

    expect(briefing.primaryAction.type).toBe(AVA_ACTION_TYPES.START_WORKOUT)
  })

  it('selectAvaWatchItem skips items that duplicate the primary action', () => {
    const watchItems = [
      {
        kind: 'recovery-flow',
        title: 'Recovery flow incomplete',
        detail: '2 workouts this week without a Recovery Flow',
      },
    ]
    const selected = selectAvaWatchItem(watchItems, {
      type: AVA_ACTION_TYPES.RECOVERY_FLOW,
    })

    expect(selected).toBeNull()
  })
})
