import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COACH_NOTIFICATIONS_DEDUPE_PARTIAL_CONFLICT,
  COACH_NOTIFICATIONS_DEDUPE_PARTIAL_INDEX,
  REMINDER_CLAIM_DEDUPE_UNIQUE_CONSTRAINT,
} from './appointmentNotificationDeliveries'

const repoRoot = resolve(import.meta.dirname, '../..')

const readSql = (relativePath) =>
  readFileSync(resolve(repoRoot, relativePath), 'utf8')

const extractEnqueueFunctionSql = (sql) => {
  const match = sql.match(
    /create or replace function public\.enqueue_appointment_notification[\s\S]*?\$\$;/i,
  )
  return match?.[0] ?? ''
}

describe('appointment enqueue SQL regression', () => {
  it('documents coach_notifications partial dedupe index name', () => {
    expect(COACH_NOTIFICATIONS_DEDUPE_PARTIAL_INDEX).toBe(
      'coach_notifications_dedupe_key_unique',
    )
  })

  it('documents partial ON CONFLICT target required for coach_notifications dedupe', () => {
    expect(COACH_NOTIFICATIONS_DEDUPE_PARTIAL_CONFLICT).toBe(
      'on conflict (dedupe_key) where dedupe_key is not null do nothing',
    )
  })

  it('8.10.10 patch matches partial coach_notifications dedupe index', () => {
    const patchSql = extractEnqueueFunctionSql(
      readSql(
        'docs/supabase/AVAREN_APPOINTMENT_NOTIFICATIONS_8_10_10_SCHEDULE_CONFLICT_FIX.sql',
      ),
    ).toLowerCase()

    expect(patchSql).toContain(COACH_NOTIFICATIONS_DEDUPE_PARTIAL_CONFLICT)
    expect(patchSql).not.toMatch(
      /insert into public\.coach_notifications[\s\S]*on conflict \(dedupe_key\) do nothing/,
    )
    expect(patchSql).toContain('on conflict (dedupe_key) do nothing')
  })

  it('migration defines coach_notifications dedupe as partial unique index only', () => {
    const migrationSql = readSql(
      'docs/supabase/AVAREN_APPOINTMENT_NOTIFICATIONS_8_10_MIGRATION.sql',
    ).toLowerCase()

    expect(migrationSql).toContain('coach_notifications_dedupe_key_unique')
    expect(migrationSql).toContain(
      'on public.coach_notifications (dedupe_key)',
    )
    expect(migrationSql).toContain('where dedupe_key is not null')
    expect(migrationSql).not.toContain(
      'constraint coach_notifications_dedupe_key_unique',
    )
  })

  it('8.10.10 migration enqueue function uses partial coach conflict target', () => {
    const enqueueSql = extractEnqueueFunctionSql(
      readSql(
        'docs/supabase/AVAREN_APPOINTMENT_NOTIFICATIONS_8_10_MIGRATION.sql',
      ),
    ).toLowerCase()

    expect(enqueueSql).toContain(COACH_NOTIFICATIONS_DEDUPE_PARTIAL_CONFLICT)
    expect(enqueueSql).not.toMatch(
      /insert into public\.coach_notifications[\s\S]*on conflict \(dedupe_key\) do nothing/,
    )
  })

  it('delivery ledger keeps full unique constraint conflict target', () => {
    const migrationSql = readSql(
      'docs/supabase/AVAREN_APPOINTMENT_NOTIFICATIONS_8_10_MIGRATION.sql',
    )

    expect(migrationSql).toContain(
      `constraint ${REMINDER_CLAIM_DEDUPE_UNIQUE_CONSTRAINT} unique (dedupe_key)`,
    )

    const enqueueSql = extractEnqueueFunctionSql(migrationSql).toLowerCase()
    expect(enqueueSql).toContain('on conflict (dedupe_key) do nothing')
  })

  it('8.10.10 precheck distinguishes constraint vs partial-index dedupe shapes', () => {
    const precheckSql = readSql(
      'docs/supabase/AVAREN_APPOINTMENT_NOTIFICATIONS_8_10_10_SCHEDULE_CONFLICT_PRECHECK.sql',
    )

    expect(precheckSql).toContain('coach_notifications_dedupe_key_unique')
    expect(precheckSql).toContain(
      'appointment_notification_deliveries_dedupe_key_unique',
    )
    expect(precheckSql).toContain('has_bare_dedupe_conflict')
    expect(precheckSql).toContain('has_partial_dedupe_conflict')
    expect(precheckSql).toContain('WHERE dedupe_key IS NOT NULL')
  })
})
