import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Coach Floor ad-hoc backend contract', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/lib/coachFloorSession.js'),
    'utf8',
  )

  it('starts and resumes ad-hoc floor sessions by business client', () => {
    expect(source).toContain('start_ad_hoc_coach_floor_session')
    expect(source).toContain('p_business_client_id')
    expect(source).toContain('startAdHoc')
  })

  it('uses separate ad-hoc save and completion RPCs', () => {
    expect(source).toContain('save_ad_hoc_coach_floor_session')
    expect(source).toContain('complete_ad_hoc_coach_floor_session')
    expect(source).toContain('p_pass_id')
  })
})
