import { describe, expect, it } from 'vitest'
import { AVA_DAILY_STATES } from './avaIntelligence'
import { buildAvaDailyBriefing } from './avaIntelligence'
import {
  applyAvaVoice,
  buildAvaGreeting,
  collectAvaHomeCopy,
  containsHypeVoice,
  containsRoboticVoice,
  extractFirstName,
  phraseAvaSummary,
  phraseAvaWatchItem,
} from './avaVoice'

const today = '2026-08-07'
const morning = new Date(`${today}T09:00:00`)
const evening = new Date(`${today}T18:00:00`)

const readinessEntry = {
  id: 'ready-1',
  date: today,
  sleep: 4,
  energy: 4,
  soreness: 2,
  stress: 2,
}

const readyWorkoutState = {
  history: [
    {
      id: 'session-1',
      date: '2026-08-06',
      name: 'Upper Body',
      sets: [{ exercise: 'Bench Press', weight: 135, reps: 8 }],
    },
  ],
  readiness: { entries: [readinessEntry] },
  selectedWorkout: 'Chest + Back',
  program: {
    nextWorkout: 'Chest + Back',
    workouts: { 'Chest + Back': [] },
  },
  weeklySchedule: { 5: 'Chest + Back' },
  mobility: {
    completed: [
      { flowId: 'daily-reset', completedAt: evening.toISOString() },
      { flowId: 'recovery-flow', completedAt: evening.toISOString() },
    ],
  },
}

describe('avaVoice', () => {
  it('uses the athlete first name once in the greeting', () => {
    expect(extractFirstName('Jacob Corell')).toBe('Jacob')
    expect(buildAvaGreeting({ firstName: 'Jacob', now: morning })).toBe(
      'Morning, Jacob.',
    )
    expect(buildAvaGreeting({ firstName: 'Jacob', now: evening })).toBe(
      'Good evening, Jacob.',
    )
  })

  it('avoids duplicated meaning in common ready-workout state', () => {
    const briefing = buildAvaDailyBriefing(readyWorkoutState, {
      now: evening,
      userName: 'Jacob',
    })

    expect(briefing.headline).toContain('Chest & Back')
    expect(briefing.summary).toBe(`Start when you're ready.`)
    expect(briefing.primaryAction?.detail).toBeNull()

    const copy = collectAvaHomeCopy(briefing).toLowerCase()
    expect(copy.match(/chest & back/g)?.length ?? 0).toBeLessThanOrEqual(2)
    expect(copy).not.toContain('good spot')
    expect(copy).not.toContain('ready when you are')
  })

  it('phrases ready state without robotic metrics-first language', () => {
    const briefing = buildAvaDailyBriefing(readyWorkoutState, {
      now: evening,
      userName: 'Jacob',
    })

    expect(collectAvaHomeCopy(briefing)).toContain('Chest & Back')
    expect(containsRoboticVoice(collectAvaHomeCopy(briefing))).toBe(false)
    expect(collectAvaHomeCopy(briefing)).not.toMatch(/Readiness\s+\d+/i)
  })

  it('phrases low readiness without alarmist language', () => {
    const briefing = buildAvaDailyBriefing(
      {
        ...readyWorkoutState,
        readiness: {
          entries: [
            {
              ...readinessEntry,
              sleep: 2,
              energy: 2,
              soreness: 5,
              stress: 4,
            },
          ],
        },
      },
      { now: morning },
    )

    expect(briefing.dailyState).toBe(AVA_DAILY_STATES.RECOVERY_PRIORITY)
    expect(briefing.summary.toLowerCase()).toContain('mobility')
    expect(briefing.summary.toLowerCase()).not.toContain('danger')
    expect(containsHypeVoice(briefing.summary)).toBe(false)
  })

  it('does not shame the athlete after inactivity', () => {
    const summary = phraseAvaSummary(
      {
        dailyState: AVA_DAILY_STATES.READY,
        workout: { displayName: 'Chest + Back' },
        daysSinceLastWorkout: 6,
        primaryAction: { type: 'start-workout' },
      },
      { now: morning },
    )

    expect(summary).toContain('momentum')
    expect(summary.toLowerCase()).not.toMatch(/failed|lazy|missed/)
  })

  it('does not push training on rest day', () => {
    const sunday = new Date(`${today}T12:00:00`)
    while (sunday.getDay() !== 0) {
      sunday.setDate(sunday.getDate() + 1)
    }

    const restState = {
      history: readyWorkoutState.history,
      readiness: readyWorkoutState.readiness,
      selectedWorkout: null,
      program: { nextWorkout: null, workouts: {} },
      weeklySchedule: [
        'Rest',
        'Chest + Back',
        'Arms',
        'Legs + Core',
        'Chest + Back',
        'Arms',
        'Legs + Core',
      ],
    }

    const briefing = buildAvaDailyBriefing(restState, { now: sunday })

    expect(briefing.dailyState).toBe(AVA_DAILY_STATES.REST)
    expect(briefing.summary.toLowerCase()).toContain('recover')
    expect(briefing.summary.toLowerCase()).not.toContain('start workout')
  })

  it('uses transparent low-data language', () => {
    const briefing = buildAvaDailyBriefing(
      {
        history: [],
        readiness: { entries: [] },
        program: readyWorkoutState.program,
      },
      { now: morning },
    )

    expect(briefing.headline.toLowerCase()).toContain('baseline')
    expect(briefing.summary.toLowerCase()).toContain('check-in')
    expect(containsRoboticVoice(collectAvaHomeCopy(briefing))).toBe(false)
  })

  it('respects coach assignment in natural language', () => {
    const assignment = {
      id: 'assign-1',
      status: 'assigned',
      title: 'Chest and Back',
      due_date: '2026-08-08',
      workout_payload: {
        name: 'Chest and Back',
        exercises: [{ name: 'Bench Press', sets: 3, muscle: 'Chest' }],
      },
    }

    const briefing = buildAvaDailyBriefing(
      {
        ...readyWorkoutState,
        mobility: {
          completed: [
            { flowId: 'daily-reset', completedAt: evening.toISOString() },
            { flowId: 'recovery-flow', completedAt: evening.toISOString() },
          ],
        },
      },
      {
        now: evening,
        assignments: [assignment],
      },
    )

    expect(briefing.summary.toLowerCase()).toContain('coach')
    expect(briefing.summary).toContain('Chest and Back')
    expect(briefing.workout.displayName).toBe('Chest and Back')
  })

  it('does not alter canonical workout identity or evidence', () => {
    const factual = buildAvaDailyBriefing(readyWorkoutState, { now: evening })
    const voiced = applyAvaVoice(factual, { userName: 'Jacob', now: evening })

    expect(voiced.workout).toEqual(factual.workout)
    expect(voiced.evidence).toEqual(factual.evidence)
    expect(voiced.dailyState).toBe(factual.dailyState)
    expect(voiced.recommendation.id).toBe(factual.recommendation.id)
  })

  it('changes greeting with time but not workout truth', () => {
    const morningBriefing = buildAvaDailyBriefing(readyWorkoutState, {
      now: morning,
      userName: 'Jacob',
    })
    const eveningBriefing = buildAvaDailyBriefing(readyWorkoutState, {
      now: evening,
      userName: 'Jacob',
    })

    expect(morningBriefing.greeting).toContain('Morning')
    expect(eveningBriefing.greeting).toContain('evening')
    expect(morningBriefing.workout.displayName).toBe(
      eveningBriefing.workout.displayName,
    )
  })

  it('produces stable voice output for equivalent input', () => {
    const first = buildAvaDailyBriefing(readyWorkoutState, {
      now: evening,
      userName: 'Jacob',
    })
    const second = buildAvaDailyBriefing(readyWorkoutState, {
      now: evening,
      userName: 'Jacob',
    })

    expect(first.summary).toBe(second.summary)
    expect(first.headline).toBe(second.headline)
    expect(first.greeting).toBe(second.greeting)
  })

  it('phrases recovery-flow watch items conversationally', () => {
    const item = phraseAvaWatchItem({
      kind: 'recovery-flow',
      title: 'Recovery flow incomplete',
      detail: '2 workouts this week without a Recovery Flow',
    })

    expect(item.detail.toLowerCase()).toContain('loosen up')
    expect(containsRoboticVoice(item.detail)).toBe(false)
  })
})
