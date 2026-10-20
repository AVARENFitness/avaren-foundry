import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const sql = readFileSync(resolve(process.cwd(), 'docs/supabase/AVAREN_CALENDAR_ATOMIC_REPEAT_BATCH_20261019.sql'), 'utf8')
describe('server-enforced recurrence idempotency', () => {
  it('keys each generated event by coach, original event and occurrence date', () => {
    expect(sql).toContain('coach_calendar_repeat_occurrence_unique')
    expect(sql).toContain('repeat_source_id, repeat_occurrence_date')
    expect(sql).toContain('on conflict (coach_id,repeat_source_id,repeat_occurrence_date)')
  })
  it('uses a transaction advisory lock and rejects time overlaps before writing', () => {
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toContain('coach_scheduled_sessions')
    expect(sql).toContain('calendar_overlap_in_batch')
    expect(sql).toContain('calendar_overlap')
  })
  it('is authenticated and prevents a retry changing an existing occurrence', () => {
    expect(sql).toContain('security invoker')
    expect(sql).toContain('auth.uid()')
    expect(sql).toContain('repeat_retry_changed')
    expect(sql).toContain('grant execute')
  })
})
