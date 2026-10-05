import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  readinessEntryForDate,
  saveReadinessEntry,
} from './readiness'

describe('readiness local calendar day', () => {
  it('uses the shared local-calendar helper rather than UTC date slices', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/lib/readiness.js'),
      'utf8',
    )

    expect(source).toContain("import { localCalendarDateKey } from './localCalendarDay'")
    expect(source).toContain('localCalendarDateKey(value)')
    expect(source).not.toContain("toISOString().slice(0, 10)")
  })

  it('saves and resolves the same device-local day', () => {
    const localEvening = new Date(2026, 9, 4, 20, 30, 0)
    const saved = saveReadinessEntry(
      { entries: [], lastPromptedDate: null },
      { sleep: 4, energy: 4, soreness: 2, stress: 2 },
      localEvening,
    )

    expect(saved.entries[0].date).toBe('2026-10-04')
    expect(saved.lastPromptedDate).toBe('2026-10-04')
    expect(readinessEntryForDate(saved, localEvening)).toMatchObject({
      date: '2026-10-04',
    })
  })
})
