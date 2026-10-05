import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Coach Today AVA brief integration', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/coach/CoachCommandCenter.jsx'),
    'utf8',
  )

  it('puts one AVA intelligence surface before the schedule', () => {
    const briefIndex = source.indexOf('<CoachAvaDailyBrief')
    const scheduleIndex = source.indexOf('<CoachTodaySchedule')

    expect(briefIndex).toBeGreaterThan(-1)
    expect(scheduleIndex).toBeGreaterThan(briefIndex)
  })

  it('does not duplicate the old Needs Attention panel on Today', () => {
    expect(source).not.toContain('<CoachAttentionQueue')
  })

  it('feeds attention, wins, and today sessions into the brief packet', () => {
    expect(source).toContain('attentionItems: attentionResult.items')
    expect(source).toContain('wins: portfolio?.wins')
    expect(source).toContain('todaySessions')
    expect(source).toContain('rosterEntries: portfolio?.rosterEntries')
  })
})
