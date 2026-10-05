import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('server smart readiness reminders', () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      'supabase/functions/_shared/smartReminderPush.ts',
    ),
    'utf8',
  )

  it('only considers the local morning window', () => {
    expect(source).toContain('local.hour < 8 || local.hour >= 10')
  })

  it('suppresses reminders when readiness is already complete for the local date', () => {
    expect(source).toContain('hasReadinessForDate(state, candidate.localDate)')
  })

  it('uses a durable daily dedupe ledger', () => {
    expect(source).toContain("'smart_reminder_deliveries'")
    expect(source).toContain("'daily_readiness'")
    expect(source).toContain('candidate.localDate')
  })
})
