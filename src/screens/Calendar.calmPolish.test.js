import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('shared calm calendar polish', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/styles/screens/calendar-shared-polish.css'), 'utf8')
  it('keeps restrained controls and clear date context across both calendars', () => {
    expect(css).toContain('.coach-session-calendar-screen .coach-calendar-today-control')
    expect(css).toContain('.athlete-calendar-screen .coach-calendar-today-control')
    expect(css).toContain('.coach-calendar-month-day.is-outside')
    expect(css).toContain('.avaren-calendar-selected-overview')
  })
  it('limits phone month cell event labels without hiding overflow counts', () => {
    expect(css).toContain('@media(max-width: 620px)')
    expect(css).toContain('.coach-calendar-month-events span:nth-child(n+3)')
    expect(css).not.toContain('.coach-calendar-month-events em { display: none')
  })
})
