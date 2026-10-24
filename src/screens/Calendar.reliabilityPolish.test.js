import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const file = p => readFileSync(resolve(process.cwd(),p),'utf8')
describe('calendar clarity and pass-neutral completion', () => {
  it('shows activity on month dates at phone sizes', () => {
    const css=file('src/styles/screens/calendar-shared-polish.css')
    expect(css).toContain('.coach-calendar-month-day.has-items .coach-calendar-month-date::after')
    expect(css).toContain('.athlete-calendar-screen .coach-calendar-month-day.has-items')
  })
  it('hides repeat selection until explicitly requested', () => {
    const src=file('src/components/CoachSessionCalendar.jsx')
    expect(src).toContain('const [repeatMode, setRepeatMode] = useState(false)')
    expect(src).toContain('hidden={!repeatMode}')
    expect(src).toContain('Repeat appointments')
  })
  it('makes pass-neutral completion clear and prominent', () => {
    const src=file('src/components/coach/CoachSessionDetailSheet.jsx')
    expect(src).toContain('Mark complete · no pass deducted')
    expect(src).toContain('onComplete?.(session)')
    const hook=file('src/hooks/useCoachSessionDetail.js')
    expect(hook).toContain('Session completed. Pass balance unchanged.')
  })
})
