import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('calendar screenshot save diagnostics', () => {
  it('retains error messages for each failed appointment without losing the review', () => {
    const calendar = readFileSync(resolve(process.cwd(), 'src/components/CoachSessionCalendar.jsx'), 'utf8')
    const importSheet = readFileSync(resolve(process.cwd(), 'src/components/CoachCalendarImportSheet.jsx'), 'utf8')
    const save = calendar.split('const handleSaveScreenshotEntries = async (rows) => {')[1]?.split('const handleSavePrivateEvent = async')[0]
    expect(save).toContain('catch (error)')
    expect(save).toContain('failures.push(')
    expect(save).toContain('return { failedIds, failures,')
    expect(importSheet).toContain('setSaveFailures(failures)')
    expect(importSheet).toContain('failure.reason')
  })
})
