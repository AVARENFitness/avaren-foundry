import { describe, expect, it } from 'vitest'
import { selectDistinctHomeShortcuts } from './homeActionHierarchy'

describe('Athlete Home action hierarchy', () => {
  it('does not repeat primary action in secondary shortcuts', () => {
    expect(selectDistinctHomeShortcuts(
      { id: 'nutrition' },
      [{ id: 'nutrition' }, { id: 'view-schedule' }],
    )).toEqual([{ id: 'view-schedule' }])
  })
  it('treats appointment and view-schedule as one destination', () => {
    expect(selectDistinctHomeShortcuts(
      { id: 'appointment' },
      [{ id: 'view-schedule' }, { id: 'recovery-flow' }],
    )).toEqual([{ id: 'recovery-flow' }])
  })
  it('deduplicates and caps shortcuts while retaining order', () => {
    const actions = [{ id: 'view-schedule' }, { id: 'appointment' }, { id: 'nutrition' }, { id: 'recovery-flow' }]
    expect(selectDistinctHomeShortcuts(null, actions)).toEqual([
      { id: 'view-schedule' }, { id: 'nutrition' },
    ])
  })
  it('handles missing actions', () => {
    expect(selectDistinctHomeShortcuts(null, null)).toEqual([])
  })
})
