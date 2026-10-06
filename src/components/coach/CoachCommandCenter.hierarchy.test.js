import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Coach Hub visual hierarchy', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/coach/CoachCommandCenter.jsx'),
    'utf8',
  )

  it('puts today schedule before business snapshot and utilities', () => {
    const schedule = source.indexOf('<CoachTodaySchedule')
    const brief = source.indexOf('<CoachAvaDailyBrief')
    const tools = source.indexOf('coach-command-tools--quiet')
    const snapshot = source.indexOf('coach-operations-snapshot')

    expect(schedule).toBeGreaterThan(-1)
    expect(brief).toBeGreaterThan(schedule)
    expect(tools).toBeGreaterThan(brief)
    expect(snapshot).toBeGreaterThan(tools)
  })

  it('collapses business metrics instead of leading with four counters', () => {
    expect(source).toContain('<details className="coach-operations-snapshot">')
    expect(source).toContain('Business snapshot')
  })
})
