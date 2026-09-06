import { describe, expect, it } from 'vitest'
import { APPOINTMENT_STATUS } from './coachingAppointment'
import {
  appointmentPassEffectLabel,
  auditDirectPassMutations,
  buildCoachPassAvaContext,
  derivePassFundingUsageDisplay,
  formatPassFundingUsageLabel,
  formatPassLedgerLabel,
  indexLedgerBySessionId,
  lowPassLabel,
  mapPassRpcError,
  normalizePassBalanceViewRow,
  normalizePassSelectionCandidates,
  normalizePassUsageRpcResult,
  passUsageResultUserMessage,
  PASS_LEDGER_ENTRY_TYPE,
  PASS_STATUS,
  parsePassUsageRpcPayload,
  resolvePassCandidateId,
  summarizeClientPasses,
} from './coachPass'

describe('coachPass', () => {
  it('maps rpc errors to calm user-facing messages', () => {
    const mapped = mapPassRpcError(new Error('pass_not_eligible_for_session'))
    expect(mapped.ok).toBe(false)
    expect(mapped.message).toContain("can't be used")
    expect(mapped.devMessage).toContain('pass_not_eligible_for_session')
  })

  it('normalizes pass balance view rows', () => {
    const pass = normalizePassBalanceViewRow({
      pass_id: 'p1',
      coach_id: 'c1',
      business_client_id: 'bc1',
      name: 'Training pass',
      sessions_purchased: 12,
      pass_status: 'active',
      starts_at: '2026-01-01',
      balance: 4,
    })

    expect(pass.balance).toBe(4)
    expect(pass.sessionsPurchased).toBe(12)
  })

  it('summarizes active pass balances for coach UI', () => {
    const summary = summarizeClientPasses([
      { id: 'a', status: 'active', balance: 2, sessionsPurchased: 12, name: 'A' },
      { id: 'b', status: 'active', balance: 3, sessionsPurchased: 6, name: 'B' },
    ])

    expect(summary.totalBalance).toBe(5)
    expect(summary.activeCount).toBe(2)
  })

  it('detects low pass state quietly', () => {
    expect(lowPassLabel(2)).toContain('Low pass')
    expect(lowPassLabel(0)).toContain('No sessions remaining')
    expect(lowPassLabel(8)).toBeNull()
  })

  it('handles pass selection required responses', () => {
    const result = normalizePassUsageRpcResult({
      ok: false,
      pass_selection_required: true,
      candidates: [{ pass_id: 'p1', name: 'Pass A', balance: 2 }],
    })

    expect(result.passSelectionRequired).toBe(true)
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0].pass_id).toBe('p1')
    expect(result.message).toContain('Choose a training pass')
  })

  it('parses string rpc payloads and normalizes candidate pass ids', () => {
    const payload = parsePassUsageRpcPayload(
      JSON.stringify({
        ok: false,
        pass_selection_required: true,
        candidates: [{ passId: 'p2', name: 'Pass B', balance: 3 }],
      }),
    )
    const result = normalizePassUsageRpcResult(payload)

    expect(result.passSelectionRequired).toBe(true)
    expect(result.candidates[0].pass_id).toBe('p2')
  })

  it('resolves candidate pass ids from alternate shapes', () => {
    expect(resolvePassCandidateId({ passId: 'abc' })).toBe('abc')
    expect(resolvePassCandidateId(' pass-1 ')).toBe('pass-1')
    expect(normalizePassSelectionCandidates([{ id: 'p3', balance: 1 }])).toEqual([
      expect.objectContaining({ pass_id: 'p3', passId: 'p3' }),
    ])
  })

  it('maps pass usage results to contextual user messages', () => {
    expect(
      passUsageResultUserMessage({ error: 'pass_not_eligible_for_session' }),
    ).toContain("can't be used")
    expect(passUsageResultUserMessage({ unchanged: true })).toBe(
      'Pass already applied.',
    )
    expect(
      passUsageResultUserMessage({ passSelectionRequired: true }),
    ).toContain('Choose a training pass')
  })

  it('is idempotent when rpc returns unchanged', () => {
    const result = normalizePassUsageRpcResult({ ok: true, unchanged: true })
    expect(result.ok).toBe(true)
    expect(result.unchanged).toBe(true)
  })

  it('labels appointment pass effects for coach history', () => {
    const ledgerBySessionId = indexLedgerBySessionId([
      {
        scheduledSessionId: 's1',
        entryType: PASS_LEDGER_ENTRY_TYPE.SESSION_USED,
      },
    ])

    expect(
      appointmentPassEffectLabel(
        { id: 's1', status: APPOINTMENT_STATUS.COMPLETED },
        ledgerBySessionId,
      ),
    ).toBe('Completed · 1 session used')

    expect(
      appointmentPassEffectLabel(
        { id: 's2', status: APPOINTMENT_STATUS.COMPLETED },
        {},
      ),
    ).toBe('Completed · No eligible training pass')

    expect(
      appointmentPassEffectLabel(
        { id: 's3', status: APPOINTMENT_STATUS.CANCELLED },
        {},
      ),
    ).toBe('Cancelled · No charge')
  })

  it('builds deterministic AVA coach pass context', () => {
    const context = buildCoachPassAvaContext({
      client: { athlete_id: 'a1', business_client_id: 'bc1' },
      passes: [
        {
          id: 'p1',
          status: 'active',
          balance: 4,
          sessionsPurchased: 12,
          name: 'Training pass',
        },
      ],
      appointments: [{ status: APPOINTMENT_STATUS.COMPLETED, sessionDate: '2026-02-01' }],
    })

    expect(context.sessionsRemaining).toBe(4)
    expect(context.lastSessionDate).toBe('2026-02-01')
  })

  it('1 carryover + 12 purchase => effective total 13', () => {
    const passes = [
      {
        id: 'old',
        status: PASS_STATUS.ACTIVE,
        balance: 1,
        sessionsPurchased: 12,
        name: 'Old pack',
      },
      {
        id: 'new',
        status: PASS_STATUS.ACTIVE,
        balance: 12,
        sessionsPurchased: 12,
        name: 'New pack',
      },
    ]
    const ledger = [
      {
        entryType: PASS_LEDGER_ENTRY_TYPE.PURCHASE,
        quantity: 12,
        createdAt: '2026-08-01T10:00:00.000Z',
        passId: 'old',
      },
      {
        entryType: PASS_LEDGER_ENTRY_TYPE.SESSION_USED,
        quantity: 11,
        createdAt: '2026-08-15T10:00:00.000Z',
        passId: 'old',
      },
      {
        entryType: PASS_LEDGER_ENTRY_TYPE.PURCHASE,
        quantity: 12,
        createdAt: '2026-09-01T10:00:00.000Z',
        passId: 'new',
      },
    ]

    const usage = derivePassFundingUsageDisplay({ passes, ledger })
    expect(usage.remaining).toBe(13)
    expect(usage.used).toBe(0)
    expect(usage.effectiveTotal).toBe(13)
    expect(formatPassFundingUsageLabel(usage)).toBe('0 of 13 used')
  })

  it('after 2 uses on carried pool => 11 remaining / 2 of 13 used', () => {
    const passes = [
      {
        id: 'old',
        status: PASS_STATUS.ACTIVE,
        balance: 0,
        sessionsPurchased: 12,
        name: 'Old pack',
      },
      {
        id: 'new',
        status: PASS_STATUS.ACTIVE,
        balance: 11,
        sessionsPurchased: 12,
        name: 'New pack',
      },
    ]
    const ledger = [
      {
        entryType: PASS_LEDGER_ENTRY_TYPE.PURCHASE,
        quantity: 12,
        createdAt: '2026-08-01T10:00:00.000Z',
        passId: 'old',
      },
      {
        entryType: PASS_LEDGER_ENTRY_TYPE.SESSION_USED,
        quantity: 11,
        createdAt: '2026-08-15T10:00:00.000Z',
        passId: 'old',
      },
      {
        entryType: PASS_LEDGER_ENTRY_TYPE.PURCHASE,
        quantity: 12,
        createdAt: '2026-09-01T10:00:00.000Z',
        passId: 'new',
      },
      {
        entryType: PASS_LEDGER_ENTRY_TYPE.SESSION_USED,
        quantity: 1,
        createdAt: '2026-09-03T10:00:00.000Z',
        passId: 'old',
      },
      {
        entryType: PASS_LEDGER_ENTRY_TYPE.SESSION_USED,
        quantity: 1,
        createdAt: '2026-09-05T10:00:00.000Z',
        passId: 'new',
      },
    ]

    const usage = derivePassFundingUsageDisplay({ passes, ledger })
    expect(usage.remaining).toBe(11)
    expect(usage.used).toBe(2)
    expect(usage.effectiveTotal).toBe(13)
    expect(formatPassFundingUsageLabel(usage)).toBe('2 of 13 used')
  })

  it('0 carryover + 12 purchase behaves as 12', () => {
    const passes = [
      {
        id: 'new',
        status: PASS_STATUS.ACTIVE,
        balance: 12,
        sessionsPurchased: 12,
        name: 'New pack',
      },
    ]
    const ledger = [
      {
        entryType: PASS_LEDGER_ENTRY_TYPE.PURCHASE,
        quantity: 12,
        createdAt: '2026-09-01T10:00:00.000Z',
        passId: 'new',
      },
    ]

    const usage = derivePassFundingUsageDisplay({ passes, ledger })
    expect(usage.remaining).toBe(12)
    expect(usage.used).toBe(0)
    expect(usage.effectiveTotal).toBe(12)
  })

  it('repeated renewal preserves carryover into the next funded pool', () => {
    const passes = [
      {
        id: 'a',
        status: PASS_STATUS.ACTIVE,
        balance: 0,
        sessionsPurchased: 12,
      },
      {
        id: 'b',
        status: PASS_STATUS.ACTIVE,
        balance: 0,
        sessionsPurchased: 12,
      },
      {
        id: 'c',
        status: PASS_STATUS.ACTIVE,
        balance: 23,
        sessionsPurchased: 12,
      },
    ]
    const ledger = [
      {
        entryType: PASS_LEDGER_ENTRY_TYPE.PURCHASE,
        quantity: 12,
        createdAt: '2026-07-01T10:00:00.000Z',
      },
      {
        entryType: PASS_LEDGER_ENTRY_TYPE.PURCHASE,
        quantity: 12,
        createdAt: '2026-08-01T10:00:00.000Z',
      },
      {
        entryType: PASS_LEDGER_ENTRY_TYPE.SESSION_USED,
        quantity: 1,
        createdAt: '2026-08-10T10:00:00.000Z',
      },
      {
        entryType: PASS_LEDGER_ENTRY_TYPE.PURCHASE,
        quantity: 12,
        createdAt: '2026-09-01T10:00:00.000Z',
      },
    ]

    const usage = derivePassFundingUsageDisplay({ passes, ledger })
    expect(usage.remaining).toBe(23)
    expect(usage.used).toBe(0)
    expect(usage.effectiveTotal).toBe(23)
  })

  it('does not mutate ledger history while deriving usage display', () => {
    const ledger = [
      {
        entryType: PASS_LEDGER_ENTRY_TYPE.PURCHASE,
        quantity: 12,
        createdAt: '2026-09-01T10:00:00.000Z',
      },
      {
        entryType: PASS_LEDGER_ENTRY_TYPE.SESSION_USED,
        quantity: 2,
        createdAt: '2026-09-05T10:00:00.000Z',
      },
    ]
    const snapshot = structuredClone(ledger)
    derivePassFundingUsageDisplay({
      passes: [
        {
          id: 'p1',
          status: PASS_STATUS.ACTIVE,
          balance: 10,
          sessionsPurchased: 12,
        },
      ],
      ledger,
    })
    expect(ledger).toEqual(snapshot)
  })

  it('uses distinct ledger labels for credit restored vs package refund', () => {
    expect(formatPassLedgerLabel(PASS_LEDGER_ENTRY_TYPE.CREDIT_RESTORED)).toBe(
      'Credit restored',
    )
    expect(formatPassLedgerLabel(PASS_LEDGER_ENTRY_TYPE.PACKAGE_REFUND)).toBe(
      'Package refund',
    )
  })

  it('flags forbidden direct pass table inserts in frontend audit', () => {
    const hits = auditDirectPassMutations(
      "supabase.from('coach_client_pass_ledger').insert({})",
    )
    expect(hits.length).toBeGreaterThan(0)
  })
})
