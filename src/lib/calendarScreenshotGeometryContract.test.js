import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('weekly calendar import geometry contract', () => {
  const source = readFileSync(resolve(process.cwd(), 'supabase/functions/calendar-screenshot-analyze/index.ts'), 'utf8')
  it('uses measured event rectangles instead of AI-generated event lists', () => {
    expect(source).toContain('geometry?.blocks')
    expect(source).toContain('const events=safe.map')
    expect(source).toContain('You MUST NOT invent, create, merge or move events')
  })
  it('computes dates and times from pixel bounds and calibrated grid', () => {
    expect(source).toContain('gridLeftX')
    expect(source).toContain('pixelsPerHour')
    expect(source).toContain('const rawTime')
    expect(source).toContain('const rawDuration')
    expect(source).toContain('startTime:valid?timeString(min)')
  })
  it('retains user-visible titles without completing clipped client names', () => {
    expect(source).toContain('Do not complete truncated names')
    expect(source).toContain('title:labels.get(b.id)')
  })
})
