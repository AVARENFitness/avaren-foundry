import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
describe('calendar progressive disclosure', () => {
  it('keeps month, week, day and repeat operations with repeat hidden until requested', () => {
    const src = readFileSync(resolve(process.cwd(),'src/components/CoachSessionCalendar.jsx'),'utf8')
    expect(src).toContain('coach-calendar-bulk-tools')
    expect(src).toContain('More calendar tools')
    expect(src).toContain('Repeat appointments')
    expect(src).toContain('Done selecting')
    expect(src).toContain('open={repeatMode || undefined}')
    expect(src).toContain("setRepeatSelection([])")
  })
})
