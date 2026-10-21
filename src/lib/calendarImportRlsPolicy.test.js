import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const sql = readFileSync(resolve(process.cwd(), 'docs/supabase/AVAREN_CALENDAR_COACH_BUSINESS_CLIENT_RLS_20261021.sql'), 'utf8')
describe('calendar session RLS policy', () => {
  it('requires owning coach, allowlist and canonical business-client ownership', () => {
    expect(sql).toContain('coach_id = (select auth.uid())')
    expect(sql).toContain('public.is_avaren_coach()')
    expect(sql).toContain('bc.id = business_client_id')
    expect(sql).toContain('bc.coach_id = (select auth.uid())')
  })
  it('allows offline clients but blocks linking to a different athlete account', () => {
    expect(sql).toContain('(athlete_id is null or bc.linked_user_id = athlete_id)')
    expect(sql).toContain('for insert to authenticated')
    expect(sql).toContain('for update to authenticated')
  })
})