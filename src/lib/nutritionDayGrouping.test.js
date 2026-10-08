import { describe, it, expect } from 'vitest'
import { groupLoggedFoods } from './nutritionDayGrouping'

describe('display-only nutrition log grouping', () => {
  it('groups adjacent foods logged within fifteen minutes without modifying entries', () => {
    const foods = [
      { id: 'a', loggedAt: '2026-10-08T12:00:00Z' },
      { id: 'b', loggedAt: '2026-10-08T12:08:00Z' },
      { id: 'c', loggedAt: '2026-10-08T15:00:00Z' },
    ]
    const groups = groupLoggedFoods(foods)
    expect(groups.map(group => group.foods.map(food => food.id))).toEqual([['a', 'b'], ['c']])
    expect(groups[0].foods[0]).toBe(foods[0])
  })

  it('does not invent groups for historical foods with missing timestamps', () => {
    expect(groupLoggedFoods([{ id: 'old' }, { id: 'older' }])).toHaveLength(2)
  })

  it('does not reorder entries or mistake a distant logging event for the same group', () => {
    const foods = [
      { id: 'first', loggedAt: '2026-10-08T19:00:00Z' },
      { id: 'second', loggedAt: '2026-10-08T19:20:00Z' },
    ]
    expect(groupLoggedFoods(foods).map(g => g.foods[0].id)).toEqual(['first', 'second'])
  })
})
