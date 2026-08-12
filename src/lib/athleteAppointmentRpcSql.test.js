import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const patchPath = resolve(root, 'docs/supabase/AVAREN_COACH_APPOINTMENTS_8_3_9.sql')
const patchSql = readFileSync(patchPath, 'utf8')
const patchSqlBody = patchSql
  .split('\n')
  .filter((line) => !/^\s*--/.test(line))
  .join('\n')

const brokenOrderByPattern = /order\s+by\s+scoped\.session_row\.starts_at/i
const scalarOrderByPattern = /order\s+by\s+scoped\.session_starts_at/i
const scalarSelectPattern = /s\.starts_at\s+as\s+session_starts_at/i

describe('list_athlete_scheduled_sessions RPC query shape', () => {
  it('does not order jsonb_agg through composite session_row field access', () => {
    expect(patchSqlBody).not.toMatch(brokenOrderByPattern)
  })

  it('orders jsonb_agg by explicit session_starts_at scalar from subquery', () => {
    expect(patchSqlBody).toMatch(scalarSelectPattern)
    expect(patchSqlBody).toMatch(scalarOrderByPattern)
  })

  it('still passes composite session_row into athlete_scheduled_session_public_json', () => {
    expect(patchSqlBody).toMatch(/s\s+as\s+session_row/)
    expect(patchSqlBody).toMatch(/scoped\.session_row/)
    expect(patchSqlBody).toMatch(/athlete_scheduled_session_public_json\s*\(/)
  })
})
