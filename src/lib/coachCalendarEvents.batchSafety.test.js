import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('ordinary event batch persistence', () => {
  const backend = readFileSync(resolve(process.cwd(), 'src/lib/coachBackend.js'), 'utf8')
  const section = backend.split('async createCoachCalendarEventBatch(')[1]?.split('async createCoachCalendarEvent(')[0]

  it('writes events as one atomic database insert, never a loop of writes', () => {
    expect(section).toBeTruthy()
    expect(section).toContain("supabase.from('coach_calendar_events').insert(rows)")
    expect(section).not.toContain('for (const row of rows)')
    expect(section).not.toContain('await this.createCoachCalendarEvent(')
  })

  it('validates lengths, occurrence dates, times and duplicate/conflicting windows', () => {
    expect(section).toContain('events.length > 60')
    expect(section).toContain('Number.isInteger(duration)')
    expect(section).toContain('findOverlappingAppointment(')
    expect(section).toContain('collisionCandidates.filter(')
  })
})
