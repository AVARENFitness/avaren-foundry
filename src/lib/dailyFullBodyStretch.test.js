import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FULL_BODY_STRETCH_CATEGORIES,
  buildFullBodyStretchFlow,
  hashDailySeed,
  inferSessionBias,
  resolveCanonicalDailyFullBodyStretch,
  withCanonicalDailyFullBodyStretch,
} from './dailyFullBodyStretch'
import { buildNotifications } from './notifications'
import { createNutritionState } from './nutrition'

const legsSession = {
  name: 'Legs + Core',
  exercises: [{ name: 'Squat', muscle: 'Quads' }],
}

describe('dailyFullBodyStretch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('builds a full-body routine covering every required category', () => {
    vi.setSystemTime(new Date('2026-08-07T15:00:00'))
    const flow = buildFullBodyStretchFlow({
      athleteId: 'athlete-1',
      now: new Date('2026-08-07T15:00:00'),
    })

    expect(flow.title).toBe('Full-Body Stretch')
    expect(flow.movements.length).toBe(FULL_BODY_STRETCH_CATEGORIES.length)
    const categories = new Set(
      flow.movements.map((movement) => movement.stretchCategory),
    )
    for (const category of FULL_BODY_STRETCH_CATEGORIES) {
      expect(categories.has(category.id)).toBe(true)
    }
  })

  it('is deterministic for the same athlete and local date', () => {
    const now = new Date('2026-08-07T09:00:00')
    const first = buildFullBodyStretchFlow({
      athleteId: 'athlete-9',
      now,
    })
    const second = buildFullBodyStretchFlow({
      athleteId: 'athlete-9',
      now: new Date('2026-08-07T21:30:00'),
    })

    expect(first.movements.map((item) => item.id)).toEqual(
      second.movements.map((item) => item.id),
    )
    expect(first.id).toBe(second.id)
    expect(first.seedKey).toBe(second.seedKey)
  })

  it('can change on the next local date', () => {
    const dayOne = buildFullBodyStretchFlow({
      athleteId: 'athlete-9',
      now: new Date('2026-08-07T12:00:00'),
    })
    const dayTwo = buildFullBodyStretchFlow({
      athleteId: 'athlete-9',
      now: new Date('2026-08-08T12:00:00'),
    })

    expect(dayOne.id).not.toBe(dayTwo.id)
    expect(hashDailySeed('athlete-9:2026-08-07')).not.toBe(
      hashDailySeed('athlete-9:2026-08-08'),
    )
  })

  it('keeps full-body coverage when lightly workout-aware', () => {
    expect(inferSessionBias(legsSession)).toBe('lower')
    const lower = buildFullBodyStretchFlow({
      athleteId: 'athlete-2',
      now: new Date('2026-08-07T12:00:00'),
      session: legsSession,
    })
    expect(lower.movements.length).toBe(FULL_BODY_STRETCH_CATEGORIES.length)
    expect(
      lower.movements.some((item) => item.stretchCategory === 'shoulders_chest'),
    ).toBe(true)
  })

  it('Home and Train resolve identical routine for the same athlete and date', () => {
    const now = new Date('2026-08-07T10:00:00')
    const home = withCanonicalDailyFullBodyStretch(
      { mobility: { daily: {}, completed: [], durationPreferences: {} } },
      { athleteId: 'shared-athlete', now },
    )
    const train = withCanonicalDailyFullBodyStretch(home.state, {
      athleteId: 'shared-athlete',
      now: new Date('2026-08-07T18:00:00'),
      session: legsSession,
    })

    expect(train.created).toBe(false)
    expect(home.flow.movements.map((item) => item.id)).toEqual(
      train.flow.movements.map((item) => item.id),
    )
    expect(home.flow.bias).toBe(train.flow.bias)
    expect(home.flow.seedKey).toBe('shared-athlete:2026-08-07')
  })

  it('opening before workout then completing workout does not change the routine', () => {
    const now = new Date('2026-08-07T08:00:00')
    const first = withCanonicalDailyFullBodyStretch(
      { mobility: { daily: {}, completed: [], durationPreferences: {} } },
      { athleteId: 'pre-open', now },
    )
    expect(first.created).toBe(true)
    expect(first.flow.bias).toBe('balanced')

    const afterWorkout = withCanonicalDailyFullBodyStretch(first.state, {
      athleteId: 'pre-open',
      now: new Date('2026-08-07T19:00:00'),
      session: legsSession,
    })

    expect(afterWorkout.created).toBe(false)
    expect(afterWorkout.flow.bias).toBe('balanced')
    expect(afterWorkout.flow.movements.map((item) => item.id)).toEqual(
      first.flow.movements.map((item) => item.id),
    )
  })

  it('first opening after workout may use workout-aware bias', () => {
    const now = new Date('2026-08-07T19:00:00')
    const first = resolveCanonicalDailyFullBodyStretch({
      athleteId: 'post-open',
      now,
      session: legsSession,
      mobilityDaily: {},
    })

    expect(first.created).toBe(true)
    expect(first.flow.bias).toBe('lower')
    expect(first.snapshot.movementIds).toEqual(
      first.flow.movements.map((item) => item.id),
    )

    const balancedSameDay = buildFullBodyStretchFlow({
      athleteId: 'post-open',
      now,
      bias: 'balanced',
    })
    expect(first.flow.movements.length).toBe(FULL_BODY_STRETCH_CATEGORIES.length)
    expect(first.flow.movements.map((item) => item.stretchCategory)).not.toEqual(
      balancedSameDay.movements.map((item) => item.stretchCategory),
    )
  })

  it('refresh or relogin preserves the same daily routine from snapshot', () => {
    const now = new Date('2026-08-07T11:00:00')
    const opened = withCanonicalDailyFullBodyStretch(
      { mobility: { daily: {}, completed: [], durationPreferences: {} } },
      { athleteId: 'persist-athlete', now },
    )

    const reloadedState = {
      mobility: {
        daily: {
          fullBodyStretch: opened.state.mobility.daily.fullBodyStretch,
        },
        completed: [],
        durationPreferences: {},
      },
    }

    const resumed = withCanonicalDailyFullBodyStretch(reloadedState, {
      athleteId: 'persist-athlete',
      now: new Date('2026-08-07T22:00:00'),
      session: legsSession,
    })

    expect(resumed.created).toBe(false)
    expect(resumed.flow.movements.map((item) => item.id)).toEqual(
      opened.flow.movements.map((item) => item.id),
    )
  })

  it('next local day can produce a different routine', () => {
    const dayOne = withCanonicalDailyFullBodyStretch(
      { mobility: { daily: {}, completed: [], durationPreferences: {} } },
      {
        athleteId: 'day-roll',
        now: new Date('2026-08-07T12:00:00'),
      },
    )
    const dayTwo = withCanonicalDailyFullBodyStretch(dayOne.state, {
      athleteId: 'day-roll',
      now: new Date('2026-08-08T12:00:00'),
    })

    expect(dayTwo.created).toBe(true)
    expect(dayTwo.flow.id).not.toBe(dayOne.flow.id)
    expect(dayTwo.state.mobility.daily.fullBodyStretch.dateKey).toBe(
      '2026-08-08',
    )
  })

  it('restarting after completion reuses the same daily routine identity', () => {
    const now = new Date('2026-08-07T16:00:00')
    const opened = withCanonicalDailyFullBodyStretch(
      { mobility: { daily: {}, completed: [], durationPreferences: {} } },
      { athleteId: 'restart-athlete', now },
    )
    const completedState = {
      ...opened.state,
      mobility: {
        ...opened.state.mobility,
        completed: [
          {
            flowId: opened.flow.id,
            title: opened.flow.title,
            kind: 'full_body_stretch',
            completedAt: now.toISOString(),
          },
        ],
      },
    }

    const restarted = withCanonicalDailyFullBodyStretch(completedState, {
      athleteId: 'restart-athlete',
      now: new Date('2026-08-07T20:00:00'),
      session: legsSession,
    })

    expect(restarted.created).toBe(false)
    expect(restarted.flow.id).toBe(opened.flow.id)
    expect(restarted.flow.movements.map((item) => item.id)).toEqual(
      opened.flow.movements.map((item) => item.id),
    )
  })

  it('does not emit stretch due or missed notifications', () => {
    const now = new Date('2026-08-07T20:00:00')
    vi.setSystemTime(now)
    const notifications = buildNotifications({
      history: [
        {
          id: 'done',
          name: 'Arms',
          finishedAt: new Date('2026-08-07T12:00:00').toISOString(),
          sets: [],
        },
      ],
      mobility: {
        completed: [],
        daily: {},
        durationPreferences: {},
      },
      nutrition: createNutritionState(),
      program: {
        rotation: ['Arms', 'Legs + Core'],
        workouts: {
          Arms: [{ name: 'Curls', sets: 3, muscle: 'Biceps' }],
          'Legs + Core': [{ name: 'Squat', sets: 3, muscle: 'Legs' }],
        },
        nextWorkout: 'Legs + Core',
      },
      checkIns: {},
      weeklyCheckIn: {},
      assignments: [],
    })

    expect(
      notifications.some((item) =>
        /stretch|full-?body/i.test(
          `${item.id} ${item.title} ${item.body} ${item.fingerprint ?? ''}`,
        ),
      ),
    ).toBe(false)
  })

  it('does not mutate workout rotation when resolving stretch', () => {
    const rotation = ['Chest + Back', 'Arms', 'Legs + Core']
    const state = {
      program: {
        rotation: [...rotation],
        nextWorkout: 'Arms',
        workouts: {},
      },
      mobility: { daily: {}, completed: [], durationPreferences: {} },
    }
    const next = withCanonicalDailyFullBodyStretch(state, {
      athleteId: 'rotation-safe',
      now: new Date('2026-08-07T12:00:00'),
    })

    expect(next.state.program.rotation).toEqual(rotation)
    expect(next.state.program.nextWorkout).toBe('Arms')
  })
})
