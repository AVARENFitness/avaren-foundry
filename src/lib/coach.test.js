import { describe, expect, it } from 'vitest'
import {
  buildCoachInsights,
  coachSnapshot,
  rankCoachInsights,
} from './coach'

const workout = ({
  id = 'one',
  date = new Date().toISOString().slice(0, 10),
  exercise = 'Bench Press',
  muscle = 'Chest',
  weight = 100,
  reps = 5,
  e1rm = 116,
} = {}) => ({
  id,
  name: 'Chest + Back',
  date,
  startedAt: `${date}T10:00:00`,
  finishedAt: `${date}T11:00:00`,
  sets: [
    {
      exercise,
      muscle,
      weight,
      reps,
      estimatedOneRepMax: e1rm,
      type: 'Working',
    },
  ],
})

describe('coach engine', () => {
  it('creates recovery guidance after workouts without recovery flows', () => {
    const state = {
      history: [workout()],
      mobility: { completed: [] },
    }

    const insights = buildCoachInsights(state)

    expect(
      insights.some(
        (insight) => insight.category === 'recovery',
      ),
    ).toBe(true)
  })

  it('returns ranked insights', () => {
    const insights = [
      {
        fingerprint: 'low',
        priority: 10,
        expiresAt: new Date(Date.now() + 10000).toISOString(),
      },
      {
        fingerprint: 'high',
        priority: 90,
        expiresAt: new Date(Date.now() + 10000).toISOString(),
      },
    ]

    expect(rankCoachInsights(insights)[0].fingerprint).toBe(
      'high',
    )
  })

  it('provides a primary insight snapshot', () => {
    const state = {
      history: [workout()],
      mobility: { completed: [] },
      coach: { history: [] },
    }

    const snapshot = coachSnapshot(state)

    expect(snapshot.primary).toBeTruthy()
    expect(snapshot.insights.length).toBeGreaterThan(0)
  })
})
