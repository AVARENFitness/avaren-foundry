import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REMINDER_CLAIM_DEDUPE_UNIQUE_CONSTRAINT } from './appointmentNotificationDeliveries'

const repoRoot = resolve(import.meta.dirname, '../..')

const readSql = (relativePath) =>
  readFileSync(resolve(repoRoot, relativePath), 'utf8')

const extractClaimFunctionSql = (sql) => {
  const match = sql.match(
    /create or replace function public\.claim_appointment_reminder_targets[\s\S]*?\$\$;/i,
  )
  return match?.[0] ?? ''
}

describe('appointment reminder claim SQL regression', () => {
  it('documents the unique constraint used for reminder claim upserts', () => {
    expect(REMINDER_CLAIM_DEDUPE_UNIQUE_CONSTRAINT).toBe(
      'appointment_notification_deliveries_dedupe_key_unique',
    )
  })

  it('8.10.9 patch avoids RETURNS TABLE dedupe_key ON CONFLICT ambiguity', () => {
    const patchSql = extractClaimFunctionSql(
      readSql(
        'docs/supabase/AVAREN_APPOINTMENT_NOTIFICATIONS_8_10_9_DEDUPE_AMBIGUITY_FIX.sql',
      ),
    ).toLowerCase()

    expect(patchSql).toContain(
      `on conflict on constraint ${REMINDER_CLAIM_DEDUPE_UNIQUE_CONSTRAINT}`,
    )
    expect(patchSql).not.toContain('on conflict (dedupe_key)')
  })

  it('migration defines dedupe uniqueness as a real table constraint', () => {
    const migrationSql = readSql(
      'docs/supabase/AVAREN_APPOINTMENT_NOTIFICATIONS_8_10_MIGRATION.sql',
    )
    const claimFunctionSql = extractClaimFunctionSql(migrationSql).toLowerCase()

    expect(migrationSql).toContain(
      'constraint appointment_notification_deliveries_dedupe_key_unique unique (dedupe_key)',
    )
    expect(claimFunctionSql).toContain(
      `on conflict on constraint ${REMINDER_CLAIM_DEDUPE_UNIQUE_CONSTRAINT}`,
    )
    expect(claimFunctionSql).not.toContain('on conflict (dedupe_key)')
  })

  it('precheck distinguishes constraint-backed dedupe uniqueness from index-only objects', () => {
    const precheckSql = readSql(
      'docs/supabase/AVAREN_APPOINTMENT_NOTIFICATIONS_8_10_9_DEDUPE_AMBIGUITY_PRECHECK.sql',
    )

    expect(precheckSql).toContain('appointment_notification_deliveries_dedupe_key_unique')
    expect(precheckSql).toContain("contype = 'u'")
    expect(precheckSql).toContain('unique_index_only')
  })
})
