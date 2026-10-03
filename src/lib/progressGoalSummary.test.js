import { describe, expect, it } from 'vitest'
import { buildGoalAwareProgress } from './progressGoalSummary'

const now = new Date('2026-10-03T12:00:00')

const session = (daysAgo, id) => {
  const date = new Date(now)
  date.setDate(date.getDate() - daysAgo)
  return {
    id,
    date: date.toISOString().slice(0, 10),
    sets: [],
  }
}

const nutrition = (goal, weights = []) => ({
  goals: {
    inputs: { goal },
  },
  days: Object.fromEntries(
    weights.map(([date, weight]) => [
      date,
      { date, weight, foods: [] },
    ]),
  ),
})

describe('goal-aware progress summary', () => {
  it('prioritizes body weight, consistency, and strength retention for fat loss', () => {
    const result = buildGoalAwareProgress({
      state: {
        history: [session(2, 'a'), session(6, 'b'), session(10, 'c')],
        nutrition: nutrition('lose_fat', [
          ['2026-09-20', 182],
          ['2026-10-02', 180.5],
        ]),
      },
      prs: [{ id: 'pr-1', date: '2026-09-28' }],
      now,
    })

    expect(result.goalLabel).toBe('Fat loss')
    expect(result.cards.map((card) => card.label)).toEqual([
      'Body-weight trend',
      'Training consistency',
      'Strength retention',
    ])
    expect(result.cards[0].value).toContain('-1.5 lb')
  })

  it('puts training consistency first for muscle gain', () => {
    const result = buildGoalAwareProgress({
      state: {
        history: [session(2, 'a'), session(5, 'b')],
        nutrition: nutrition('build_muscle'),
      },
      prs: [],
      now,
    })

    expect(result.goalLabel).toBe('Build muscle')
    expect(result.cards[0].label).toBe('Training consistency')
    expect(result.cards[1].label).toBe('Strength trend')
  })

  it('falls back to a neutral training lens when no goal is configured', () => {
    const result = buildGoalAwareProgress({
      state: {
        history: [session(2, 'a')],
        nutrition: { goals: {}, days: {} },
      },
      prs: [],
      now,
    })

    expect(result.goalLabel).toBe('Training progress')
    expect(result.cards).toHaveLength(3)
    expect(result.cards[0].label).toBe('Training consistency')
  })
})
