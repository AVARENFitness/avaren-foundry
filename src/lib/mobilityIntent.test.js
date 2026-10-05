import { describe, expect, it } from 'vitest'
import { buildAdaptiveDailyReset, buildRecoveryFlow } from '../data/mobility'

describe('mobility intent separation', () => {
  it('builds a pre-workout warm-up when training is planned', () => {
    const flow = buildAdaptiveDailyReset({
      history: [],
      plannedWorkout: 'Chest + Back',
      durationPreferences: {},
      readiness: { completed: true, score: 78 },
      recentCompletions: [],
    })

    expect(flow.title).toBe('Pre-Workout Warm-Up')
    expect(flow.kind).toBe('warm_up')
    expect(flow.reason).toMatch(/prepares|warm-up/i)
  })

  it('builds post-workout cooldown and recovery from the completed session', () => {
    const flow = buildRecoveryFlow({
      id: 'session-1',
      name: 'Legs',
      sets: [{ muscle: 'Quads' }, { muscle: 'Hamstrings' }],
    })

    expect(flow.title).toBe('Cooldown & Recovery')
    expect(flow.kind).toBe('recovery')
    expect(flow.reason).toMatch(/post-workout/i)
  })
})
