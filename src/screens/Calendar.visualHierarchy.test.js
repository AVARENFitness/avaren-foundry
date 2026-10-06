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
  const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')

  it('gives the coach useful calendar context before the grid', () => {
    expect(coach).toContain('coach-calendar-intelligence')
    expect(coach).toContain('TODAY')
    expect(coach).toContain('NEXT')
    expect(coach).toContain('THIS WEEK')
    expect(coach).toContain('Client session')
    expect(coach).toContain('Private time')
  })

  it('gives the athlete useful calendar context before the grid', () => {
    expect(athlete).toContain('athlete-calendar-intelligence')
    expect(athlete).toContain('NEXT COACHING')
    expect(athlete).toContain('Your day is open')
    expect(athlete).toContain('Coaching')
    expect(athlete).toContain('Private')
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
