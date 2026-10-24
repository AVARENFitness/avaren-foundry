import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const source = path => readFileSync(resolve(process.cwd(), path), 'utf8')
describe('coach quick-plan release contracts', () => {
  it('keeps a single editable client plan, not a new row for each update', () => {
    const backend = source('src/lib/coachQuickPlanBackend.js')
    expect(backend).toContain("onConflict: 'coach_id,business_client_id'")
    expect(backend).toContain('business_client_id: businessClientId')
    expect(backend).not.toContain('recordCompletedSessionPassUsage')
    expect(backend).toContain("rpc('get_my_quick_plan')")
  })
  it('requires coach ownership and limits athlete access to linked clients', () => {
    const sql = source('docs/supabase/AVAREN_COACH_QUICK_PLANS_20261024.sql')
    expect(sql).toContain('enable row level security')
    expect(sql).toContain('coach_quick_plans_owner_unique')
    expect(sql).toContain('is_linked_quick_plan_athlete')
    expect(sql).toContain('b.linked_user_id=auth.uid()')
    expect(source('docs/supabase/AVAREN_QUICK_PLAN_OWN_ATHLETE_READ_20261024.sql')).toContain('b.linked_user_id=auth.uid()')
  })
  it('supports editable pencil-friendly fields, exercise rows and printing', () => {
    const editor = source('src/components/CoachQuickPlan.jsx')
    expect(editor).toContain('Add exercise')
    expect(editor).toContain('Print plan')
    expect(editor).toContain('Save changes')
    expect(editor).toContain('Coach notes')
    expect(source('src/styles/screens/coach-quick-plan.css')).toContain('@media print')
  })
  it('exposes plans to coach and athlete without athlete edits', () => {
    expect(source('src/screens/CoachClientProfile.jsx')).toContain('<CoachQuickPlan businessClientId=')
    expect(source('src/screens/AthleteInPersonScheduleScreen.jsx')).toContain('<CoachQuickPlan readOnly')
    expect(source('src/components/CoachQuickPlan.jsx')).toContain('disabled={readOnly}')
  })
  it('keeps the waiver text readable while signing', () => {
    const css = source('src/styles/screens/coach-hub.css')
    expect(css).toContain('.coach-waiver-signing-sheet .coach-waiver-terms')
    expect(css).toContain('min-height: 280px')
    expect(css).toContain('overflow-y: auto')
  })
})
