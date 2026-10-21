import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const file = path => readFileSync(resolve(process.cwd(), path), 'utf8')
describe('shared coach and athlete calendar polish', () => {
  const css = file('src/styles/screens/calendar-shared-polish.css')
  it('loads the shared calendar design layer for both roles', () => {
    expect(file('src/components/CoachSessionCalendar.jsx')).toContain("calendar-shared-polish.css")
    expect(file('src/screens/AthleteInPersonScheduleScreen.jsx')).toContain("calendar-shared-polish.css")
  })
  it('preserves readable day/week/month controls on phones and accessible focus', () => {
    expect(css).toContain('coach-calendar-command-bar')
    expect(css).toContain('coach-calendar-month-day')
    expect(css).toContain('coach-calendar-week-item')
    expect(css).toContain('athlete-calendar-agenda-item')
    expect(css).toContain('max-width: 620px')
    expect(css).toContain(':focus-visible')
    expect(css).toContain('prefers-reduced-motion')
  })
})
