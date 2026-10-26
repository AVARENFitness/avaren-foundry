import { describe, expect, it } from 'vitest'
import { changedNutritionDays } from './nutritionPersistence'

describe('changedNutritionDays', () => {
  it('returns a historical day when that day is edited', () => {
    const today = {
      date: '2026-10-25',
      foods: [{ id: 'today-food', calories: 100 }],
    }
    const yesterday = {
      date: '2026-10-24',
      foods: [{ id: 'old-food', calories: 200 }],
    }
    const previous = { days: { '2026-10-25': today, '2026-10-24': yesterday } }
    const editedYesterday = {
      ...yesterday,
      foods: [{ id: 'old-food', calories: 150 }],
    }
    const next = {
      days: {
        '2026-10-25': today,
        '2026-10-24': editedYesterday,
      },
    }

    expect(changedNutritionDays(previous, next)).toEqual([editedYesterday])
  })

  it('does not resync unchanged nutrition days for a profile-only change', () => {
    const day = {
      date: '2026-10-25',
      foods: [{ id: 'food-1', calories: 100 }],
    }
    const previous = { goals: { calories: 2000 }, days: { '2026-10-25': day } }
    const next = { goals: { calories: 2100 }, days: { '2026-10-25': day } }

    expect(changedNutritionDays(previous, next)).toEqual([])
  })

  it('returns multiple changed days when a mutation intentionally updates more than one', () => {
    const previous = {
      days: {
        '2026-10-24': { date: '2026-10-24', foods: [] },
        '2026-10-25': { date: '2026-10-25', foods: [] },
      },
    }
    const next = {
      days: {
        '2026-10-24': { date: '2026-10-24', foods: [{ id: 'a' }] },
        '2026-10-25': { date: '2026-10-25', foods: [{ id: 'b' }] },
      },
    }

    expect(changedNutritionDays(previous, next).map((day) => day.date)).toEqual([
      '2026-10-24',
      '2026-10-25',
    ])
  })
})
