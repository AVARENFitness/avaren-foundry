import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('calendar visual information hierarchy', () => {
  const coach = readFileSync(
    resolve(process.cwd(), 'src/components/CoachSessionCalendar.jsx'),
    'utf8',
  )
  const athlete = readFileSync(
    resolve(process.cwd(), 'src/screens/AthleteInPersonScheduleScreen.jsx'),
    'utf8',
  )
  const styles = ['src/styles.css', 'src/styles/screens/later-overrides.css']
    .map((path) => readFileSync(resolve(process.cwd(), path), 'utf8'))
    .join('\n')

  it('keeps coach Add menu bounded within the mobile calendar header', () => {
    const lastFix = styles.lastIndexOf('Calendar Add menu: keep anchored within the screen')
    const mobileRule = styles.slice(lastFix)
    expect(mobileRule).toContain('.coach-calendar-add-menu-wrap { position: static !important; }')
    expect(mobileRule).toContain('left: 0 !important;')
    expect(mobileRule).toContain('right: 0 !important;')
    expect(mobileRule).toContain('width: 100% !important;')
    expect(mobileRule).toContain('box-sizing: border-box !important;')
  })

  it('focuses coach calendar on selected day and clear navigation', () => {
    expect(coach).toContain('avaren-calendar-inline-agenda')
    expect(coach).toContain('View day agenda')
    expect(coach).not.toContain('className="coach-calendar-intelligence"')
    expect(coach).not.toContain('className="coach-calendar-legend"')
  })

  it('gives the athlete useful calendar context before the grid', () => {
    expect(athlete).toContain('avaren-calendar-inline-agenda')
    expect(athlete).toContain('formatCoachCalendarDayHeading(selectedDayKey)')
    expect(athlete).toContain('Nothing scheduled for this day.')
    expect(athlete).toContain('selectedDayItems')
    expect(athlete).toContain('coach-calendar-week-board')
    expect(athlete).toContain('Coaching')
    expect(athlete).toContain('Private')
  })

  it('puts the calendar and selected-day agenda before optional summaries', () => {
    expect(athlete).toContain('avaren-calendar-inline-agenda')
    expect(coach).toContain('avaren-calendar-inline-agenda')
    expect(athlete).not.toContain('className="athlete-calendar-intelligence"')
    expect(coach).not.toContain('className="avaren-calendar-selected-overview"')
  })

  it('keeps Month Week Day and adds restrained calendar motion', () => {
    expect(coach).toContain('COACH_CALENDAR_VIEW.MONTH')
    expect(coach).toContain('COACH_CALENDAR_VIEW.WEEK')
    expect(coach).toContain('COACH_CALENDAR_VIEW.DAY')
    expect(styles).toContain('@keyframes avarenCalendarViewIn')
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('visually distinguishes today client sessions private time and open time', () => {
    expect(styles).toContain('.coach-calendar-legend i.is-client')
    expect(styles).toContain('.coach-calendar-legend i.is-private')
    expect(styles).toContain('.coach-calendar-month-day.is-today')
    expect(styles).toContain('.coach-calendar-week-open')
  })
})
