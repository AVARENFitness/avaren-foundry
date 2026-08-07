import { describe, expect, it } from 'vitest'
import {
  assignmentToTrainingSession,
  buildClientAttentionItems,
  buildClientIntelligence,
  buildNutritionSnapshot,
  buildPerformanceInsights,
  buildReadinessSnapshot,
  calculateClientConsistency,
  normalizeClientTrainingHistory,
} from './clientIntelligence'

const client = {
  athlete_id: 'athlete-1',
  athlete_email: 'athlete@example.com',
  created_at: '2026-01-01T12:00:00.000Z',
}

const completedAssignment = (overrides = {}) => ({
  id: 'a1',
  athlete_id: 'athlete-1',
  title: 'Push Day',
  status: 'completed',
  completed_at: '2026-08-06T18:00:00.000Z',
  due_date: '2026-08-06',
  completion_summary: {
    durationMinutes: 58,
    volume: 12400,
    sets: 18,
    exercises: 5,
  },
  ...overrides,
})

const workoutSession = (overrides = {}) => ({
  id: 's1',
  name: 'Push Day',
  date: '2026-08-06',
  finishedAt: '2026-08-06T18:00:00.000Z',
  startedAt: '2026-08-06T17:00:00.000Z',
  sets: [
    {
      exercise: 'Bench Press',
      muscle: 'Chest',
      weight: 185,
      reps: 5,
      estimatedOneRepMax: 216,
    },
    {
      exercise: 'Bench Press',
      muscle: 'Chest',
      weight: 195,
      reps: 3,
      estimatedOneRepMax: 214,
    },
  ],
  ...overrides,
})

describe('clientIntelligence', () => {
  it('handles a client with no history', () => {
    const intelligence = buildClientIntelligence({
      client,
      assignments: [],
      athleteState: null,
      nutritionProfile: null,
      nutritionDays: [],
    })

    expect(intelligence.snapshot.latest.value).toBe('No completed workouts yet')
    expect(intelligence.training.recentSessions).toEqual([])
    expect(intelligence.attention[0].id).toBe('all-clear')
    expect(intelligence.readiness.available).toBe(false)
    expect(intelligence.nutrition.available).toBe(false)
  })

  it('summarizes a consistent client from assignment completions', () => {
    const assignments = [
      completedAssignment({ id: 'a1', completed_at: '2026-08-04T18:00:00.000Z', due_date: '2026-08-04' }),
      completedAssignment({ id: 'a2', completed_at: '2026-08-05T18:00:00.000Z', due_date: '2026-08-05' }),
      completedAssignment({ id: 'a3', completed_at: '2026-08-06T18:00:00.000Z', due_date: '2026-08-06' }),
    ]

    const history = normalizeClientTrainingHistory({ assignments })
    const consistency = calculateClientConsistency(history, new Date('2026-08-07T12:00:00.000Z'))

    expect(consistency.workoutsThisWeek).toBeGreaterThanOrEqual(3)
    expect(consistency.label).toMatch(/Strong|Steady/)
  })

  it('flags an inactive client after five days without training', () => {
    const assignments = [
      completedAssignment({
        completed_at: '2026-08-01T18:00:00.000Z',
        due_date: '2026-08-01',
      }),
    ]

    const history = normalizeClientTrainingHistory({ assignments })
    const attention = buildClientAttentionItems({
      history,
      assignments,
      now: new Date('2026-08-07T12:00:00.000Z'),
    })

    expect(attention.some((item) => item.id === 'inactive')).toBe(true)
  })

  it('detects improving performance across exposures', () => {
    const history = [
      workoutSession({
        id: 's1',
        date: '2026-07-20',
        sets: [{ exercise: 'Bench Press', weight: 175, reps: 5, estimatedOneRepMax: 204 }],
      }),
      workoutSession({
        id: 's2',
        date: '2026-07-27',
        sets: [{ exercise: 'Bench Press', weight: 185, reps: 5, estimatedOneRepMax: 216 }],
      }),
      workoutSession({
        id: 's3',
        date: '2026-08-03',
        sets: [{ exercise: 'Bench Press', weight: 195, reps: 5, estimatedOneRepMax: 228 }],
      }),
    ]

    const performance = buildPerformanceInsights(history)

    expect(performance.cards.some((card) => card.id === 'improvement')).toBe(true)
  })

  it('flags an active incomplete assignment', () => {
    const assignments = [
      {
        id: 'active-1',
        athlete_id: 'athlete-1',
        title: 'Lower Body',
        status: 'assigned',
        due_date: '2026-08-05',
        assigned_at: '2026-08-01T12:00:00.000Z',
      },
    ]

    const attention = buildClientAttentionItems({
      history: [],
      assignments,
      now: new Date('2026-08-07T12:00:00.000Z'),
    })

    expect(
      attention.some(
        (item) =>
          item.id === 'overdue-assignment' || item.id === 'open-assignment',
      ),
    ).toBe(true)
  })

  it('returns polished empty states for missing nutrition and readiness', () => {
    const readiness = buildReadinessSnapshot(null)
    const nutrition = buildNutritionSnapshot({
      nutritionProfile: null,
      nutritionDays: [],
    })

    expect(readiness.available).toBe(false)
    expect(readiness.status).toMatch(/No readiness/)
    expect(nutrition.available).toBe(false)
    expect(nutrition.detail).toMatch(/not enabled|not shared/i)
  })

  it('builds nutrition snapshot when coach access is enabled', () => {
    const nutrition = buildNutritionSnapshot({
      nutritionProfile: {
        coach_access: true,
        goals: { calories: 2400, protein: 180 },
      },
      nutritionDays: [
        {
          log_date: '2026-08-06',
          snapshot: {
            foods: [{ calories: 2300, protein: 170, carbs: 0, fat: 0, fiber: 0 }],
          },
        },
        {
          log_date: '2026-08-05',
          snapshot: {
            foods: [{ calories: 2500, protein: 185, carbs: 0, fat: 0, fiber: 0 }],
          },
        },
      ],
      now: new Date('2026-08-07T12:00:00.000Z'),
    })

    expect(nutrition.available).toBe(true)
    expect(nutrition.daysLoggedThisWeek).toBe(2)
    expect(nutrition.avgCalories).toBeGreaterThan(0)
  })

  it('maps assignment completion summaries into training sessions', () => {
    const session = assignmentToTrainingSession(completedAssignment())

    expect(session.name).toBe('Push Day')
    expect(session.summary.volume).toBe(12400)
    expect(session.summary.sets).toBe(18)
  })
})
