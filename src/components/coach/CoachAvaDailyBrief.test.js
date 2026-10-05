import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('CoachAvaDailyBrief presentation', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/coach/CoachAvaDailyBrief.jsx'),
    'utf8',
  )

  it('keeps the brief selective', () => {
    expect(source).toContain('NEEDS ATTENTION')
    expect(source).toContain('BEFORE YOU TRAIN')
    expect(source).toContain('Going well')
  })

  it('renders deterministic facts immediately and refines them with AVA', () => {
    expect(source).toContain('buildCoachDailyBriefFallback')
    expect(source).toContain('requestCoachDailyBrief')
    expect(source).toContain('readCoachDailyBriefCache')
  })
})
