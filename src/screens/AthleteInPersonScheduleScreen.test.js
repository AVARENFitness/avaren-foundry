import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Athlete unified schedule presentation', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/screens/AthleteInPersonScheduleScreen.jsx'),
    'utf8',
  )

  it('uses Month Week Day calendar zoom instead of an appointment-only list', () => {
    expect(source).toContain('COACH_CALENDAR_VIEW.MONTH')
    expect(source).toContain('COACH_CALENDAR_VIEW.WEEK')
    expect(source).toContain('COACH_CALENDAR_VIEW.DAY')
    expect(source).toContain('athlete-calendar-month')
    expect(source).toContain('athlete-calendar-week')
  })

  it('keeps athlete-private events separate from coach appointments', () => {
    expect(source).toContain('athleteCalendarBackend')
    expect(source).toContain('isAthletePrivateEvent')
    expect(source).toContain('Your coach cannot see your private calendar.')
    expect(source).toContain('you can’t delete this appointment')
  })

  it('edits owner-private events without unlocking coach appointments', () => {
    expect(source).toContain('openPrivateEventEditor')
    expect(source).toContain('athleteCalendarBackend.update')
    expect(source).toContain('updateCoachCalendarEvent')
    expect(source).toContain("title={editingPrivateEvent ? 'Edit private event' : 'Add private event'}")
    expect(source).toContain('Managed by your coach · you can’t delete this appointment')
  })

  it('keeps pass details available without crowding the month view', () => {
    const start = source.indexOf('<details className="avaren-athlete-plan-disclosure">')
    const end = source.indexOf('</details>', start)
    const disclosure = source.slice(start, end)
    expect(disclosure).toContain('Coaching details')
    expect(disclosure).toContain('CoachQuickPlan')
    expect(disclosure).toContain('AthletePassStatus variant="detailed"')
  })

  it('merges coach-owned calendar items only for dual-role accounts', () => {
    expect(source).toContain('includeCoachCalendar')
    expect(source).toContain('listCoachCalendarEvents')
    expect(source).toContain('listScheduledSessions')
    expect(source).toContain('Athlete + Coach calendars are merged for this account.')
  })
})
