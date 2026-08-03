import { describe, expect, it } from 'vitest'
import {
  forgeProgress,
  forgeSnapshot,
  newlyUnlockedForgeAchievements,
} from './forge'

const session = {
  id: 'workout-1',
  name: 'Chest + Back',
  date: '2026-08-01',
  startedAt: '2026-08-01T10:00:00',
  finishedAt: '2026-08-01T11:00:00',
  sets: [
    {
      exercise: 'Bench Press',
      muscle: 'Chest',
      weight: 100,
      reps: 10,
      estimatedOneRepMax: 133,
      type: 'Working',
    },
  ],
}

describe('forge engine', () => {
  it('unlocks The Foundation after one workout', () => {
    const progress = forgeProgress({
      history: [session],
      mobility: { completed: [] },
    })

    expect(
      progress.find(
        (achievement) =>
          achievement.id === 'the-foundation',
      ).unlocked,
    ).toBe(true)
  })

  it('returns closest locked achievements', () => {
    const snapshot = forgeSnapshot({
      history: [session],
      mobility: { completed: [] },
    })

    expect(snapshot.closest.length).toBeGreaterThan(0)
    expect(snapshot.totals.available).toBeGreaterThan(0)
  })

  it('detects newly unlocked achievements', () => {
    const before = {
      history: [],
      mobility: { completed: [] },
    }
    const after = {
      history: [session],
      mobility: { completed: [] },
    }

    expect(
      newlyUnlockedForgeAchievements(before, after).some(
        (achievement) =>
          achievement.id === 'the-foundation',
      ),
    ).toBe(true)
  })
})
