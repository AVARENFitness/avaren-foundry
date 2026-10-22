import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const src = path => readFileSync(resolve(process.cwd(), path), 'utf8')
describe('calendar render safety and coach visual simplicity', () => {
  it('initializes selected day items before computing selected counts', () => {
    const s = src('src/screens/AthleteInPersonScheduleScreen.jsx')
    const items = s.indexOf('const selectedDayItems = dayItemsByKey[selectedDayKey]')
    const counts = s.indexOf('const selectedPrivateCount = selectedDayItems.filter')
    expect(items).toBeGreaterThan(0)
    expect(counts).toBeGreaterThan(items)
  })
  it('lets the calendar be the coach focus, without competing summary cards or legend', () => {
    const s = src('src/components/CoachSessionCalendar.jsx')
    expect(s).not.toContain('className="coach-calendar-intelligence"')
    expect(s).not.toContain('className="coach-calendar-legend"')
    expect(s).toContain('className="avaren-calendar-inline-agenda"')
    expect(s).toContain('coach-calendar-view-day')
    expect(s).toContain('coach-calendar-view-week')
    expect(s).toContain('coach-calendar-view-month')
  })
})
