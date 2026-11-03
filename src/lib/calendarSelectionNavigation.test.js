import { describe, expect, it } from 'vitest'
import {
  shiftCalendarSelectionMonth,
  shiftCalendarSelectionWeek,
} from './calendarSelectionNavigation'

describe('calendar selected-day navigation', () => {
  it('moves with the visible month and clamps at month end', () => {
    expect(shiftCalendarSelectionMonth('2026-01-31', 1)).toBe('2026-02-28')
    expect(shiftCalendarSelectionMonth('2024-01-31', 1)).toBe('2024-02-29')
    expect(shiftCalendarSelectionMonth('2026-03-31', -1)).toBe('2026-02-28')
    expect(shiftCalendarSelectionMonth('2026-12-03', 1)).toBe('2027-01-03')
  })

  it('moves the selected day by a whole week in either direction', () => {
    expect(shiftCalendarSelectionWeek('2026-11-03', 1)).toBe('2026-11-10')
    expect(shiftCalendarSelectionWeek('2026-11-03', -1)).toBe('2026-10-27')
  })

  it('does not change invalid month selections', () => {
    expect(shiftCalendarSelectionMonth('2026-02-31', 1)).toBe('2026-02-31')
    expect(shiftCalendarSelectionMonth('', 1)).toBe('')
  })
})
