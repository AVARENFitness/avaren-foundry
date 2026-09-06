import { describe, expect, it } from 'vitest'
import {
  buildAthletePassStatus,
  formatAthletePassRemainingLabel,
} from './athletePassStatus'
import {
  derivePassFundingUsageDisplay,
  formatPassFundingUsageLabel,
  PASS_LEDGER_ENTRY_TYPE,
  PASS_STATUS,
} from './coachPass'

const summaryRow = ({
  passId,
  balance,
  businessClientId = 'bc-1',
  status = 'active',
  name = 'Training pass',
}) => ({
  pass_id: passId,
  business_client_id: businessClientId,
  balance,
  status,
  name,
  starts_at: '2026-08-01',
  expires_at: null,
})

const historyRow = ({
  entryType,
  quantity,
  occurredAt,
  businessClientId = 'bc-1',
}) => ({
  occurred_at: occurredAt,
  entry_type: entryType,
  quantity,
  pass_name: 'Training pass',
  business_client_id: businessClientId,
})

describe('buildAthletePassStatus', () => {
  it('hides pass UI for unlinked athletes with no pass rows', () => {
    const status = buildAthletePassStatus({
      summaryRows: [],
      historyRows: [],
    })
    expect(status.visible).toBe(false)
    expect(status.primary).toBeNull()
  })

  it('shows compact remaining for a linked active athlete', () => {
    const status = buildAthletePassStatus({
      summaryRows: [summaryRow({ passId: 'p1', balance: 11 })],
      historyRows: [
        historyRow({
          entryType: PASS_LEDGER_ENTRY_TYPE.PURCHASE,
          quantity: 12,
          occurredAt: '2026-09-01T10:00:00.000Z',
        }),
        historyRow({
          entryType: PASS_LEDGER_ENTRY_TYPE.SESSION_USED,
          quantity: -1,
          occurredAt: '2026-09-03T10:00:00.000Z',
        }),
        historyRow({
          entryType: PASS_LEDGER_ENTRY_TYPE.SESSION_USED,
          quantity: -1,
          occurredAt: '2026-09-05T10:00:00.000Z',
        }),
      ],
    })

    expect(status.visible).toBe(true)
    expect(status.primary.remaining).toBe(11)
    expect(formatAthletePassRemainingLabel(status.primary.remaining)).toBe(
      '11 remaining',
    )
  })

  it('Schedule detail matches coach funding display for carryover pool', () => {
    const summaryRows = [
      summaryRow({ passId: 'old', balance: 0, name: 'Old pack' }),
      summaryRow({ passId: 'new', balance: 11, name: 'New pack' }),
    ]
    const historyRows = [
      historyRow({
        entryType: PASS_LEDGER_ENTRY_TYPE.PURCHASE,
        quantity: 12,
        occurredAt: '2026-08-01T10:00:00.000Z',
      }),
      historyRow({
        entryType: PASS_LEDGER_ENTRY_TYPE.SESSION_USED,
        quantity: -11,
        occurredAt: '2026-08-15T10:00:00.000Z',
      }),
      historyRow({
        entryType: PASS_LEDGER_ENTRY_TYPE.PURCHASE,
        quantity: 12,
        occurredAt: '2026-09-01T10:00:00.000Z',
      }),
      historyRow({
        entryType: PASS_LEDGER_ENTRY_TYPE.SESSION_USED,
        quantity: -1,
        occurredAt: '2026-09-03T10:00:00.000Z',
      }),
      historyRow({
        entryType: PASS_LEDGER_ENTRY_TYPE.SESSION_USED,
        quantity: -1,
        occurredAt: '2026-09-05T10:00:00.000Z',
      }),
    ]

    const athlete = buildAthletePassStatus({ summaryRows, historyRows })
    const coachPasses = summaryRows.map((row) => ({
      id: row.pass_id,
      status: PASS_STATUS.ACTIVE,
      balance: row.balance,
      sessionsPurchased: 12,
      name: row.name,
    }))
    const coachLedger = historyRows.map((row) => ({
      entryType: row.entry_type,
      quantity: row.quantity,
      createdAt: row.occurred_at,
    }))
    const coach = derivePassFundingUsageDisplay({
      passes: coachPasses,
      ledger: coachLedger,
    })

    expect(athlete.primary.remaining).toBe(11)
    expect(athlete.primary.used).toBe(2)
    expect(athlete.primary.effectiveTotal).toBe(13)
    expect(athlete.primary.usageLabel).toBe('2 of 13 used')
    expect(athlete.primary.remaining).toBe(coach.remaining)
    expect(athlete.primary.used).toBe(coach.used)
    expect(athlete.primary.effectiveTotal).toBe(coach.effectiveTotal)
    expect(formatPassFundingUsageLabel(coach)).toBe('2 of 13 used')
  })

  it('1 carryover + 12 purchase => effective total 13', () => {
    const status = buildAthletePassStatus({
      summaryRows: [
        summaryRow({ passId: 'old', balance: 1 }),
        summaryRow({ passId: 'new', balance: 12 }),
      ],
      historyRows: [
        historyRow({
          entryType: PASS_LEDGER_ENTRY_TYPE.PURCHASE,
          quantity: 12,
          occurredAt: '2026-08-01T10:00:00.000Z',
        }),
        historyRow({
          entryType: PASS_LEDGER_ENTRY_TYPE.SESSION_USED,
          quantity: -11,
          occurredAt: '2026-08-15T10:00:00.000Z',
        }),
        historyRow({
          entryType: PASS_LEDGER_ENTRY_TYPE.PURCHASE,
          quantity: 12,
          occurredAt: '2026-09-01T10:00:00.000Z',
        }),
      ],
    })

    expect(status.primary.remaining).toBe(13)
    expect(status.primary.used).toBe(0)
    expect(status.primary.effectiveTotal).toBe(13)
    expect(status.primary.usageLabel).toBe('0 of 13 used')
  })

  it('displays 0 remaining correctly', () => {
    const status = buildAthletePassStatus({
      summaryRows: [summaryRow({ passId: 'p1', balance: 0 })],
      historyRows: [
        historyRow({
          entryType: PASS_LEDGER_ENTRY_TYPE.PURCHASE,
          quantity: 10,
          occurredAt: '2026-08-01T10:00:00.000Z',
        }),
        historyRow({
          entryType: PASS_LEDGER_ENTRY_TYPE.SESSION_USED,
          quantity: -10,
          occurredAt: '2026-09-01T10:00:00.000Z',
        }),
      ],
    })

    expect(status.visible).toBe(true)
    expect(status.primary.remaining).toBe(0)
    expect(formatAthletePassRemainingLabel(0)).toBe('0 remaining')
    expect(status.primary.isLow).toBe(true)
  })

  it('marks low balance without inventing alarmist messaging', () => {
    const status = buildAthletePassStatus({
      summaryRows: [summaryRow({ passId: 'p1', balance: 2 })],
      historyRows: [
        historyRow({
          entryType: PASS_LEDGER_ENTRY_TYPE.PURCHASE,
          quantity: 12,
          occurredAt: '2026-09-01T10:00:00.000Z',
        }),
      ],
    })

    expect(status.primary.remaining).toBe(2)
    expect(status.primary.isLow).toBe(true)
    expect(formatAthletePassRemainingLabel(2)).toBe('2 remaining')
  })

  it('does not merge balances from different business clients', () => {
    const status = buildAthletePassStatus({
      summaryRows: [
        summaryRow({
          passId: 'p-a',
          balance: 5,
          businessClientId: 'bc-a',
          name: 'Coach A',
        }),
        summaryRow({
          passId: 'p-b',
          balance: 3,
          businessClientId: 'bc-b',
          name: 'Coach B',
        }),
      ],
      historyRows: [
        historyRow({
          entryType: PASS_LEDGER_ENTRY_TYPE.PURCHASE,
          quantity: 5,
          occurredAt: '2026-09-01T10:00:00.000Z',
          businessClientId: 'bc-a',
        }),
        historyRow({
          entryType: PASS_LEDGER_ENTRY_TYPE.PURCHASE,
          quantity: 3,
          occurredAt: '2026-09-02T10:00:00.000Z',
          businessClientId: 'bc-b',
        }),
      ],
    })

    expect(status.multipleRelationships).toBe(true)
    expect(status.groups).toHaveLength(2)
    expect(status.groups.map((group) => group.remaining).sort()).toEqual([3, 5])
    expect(status.groups.reduce((sum, group) => sum + group.remaining, 0)).toBe(
      8,
    )
  })

  it('ignores another client’s rows when they are not in athlete RPC payload', () => {
    const status = buildAthletePassStatus({
      summaryRows: [summaryRow({ passId: 'mine', balance: 4, businessClientId: 'bc-mine' })],
      historyRows: [
        historyRow({
          entryType: PASS_LEDGER_ENTRY_TYPE.PURCHASE,
          quantity: 4,
          occurredAt: '2026-09-01T10:00:00.000Z',
          businessClientId: 'bc-mine',
        }),
      ],
    })

    expect(status.groups).toHaveLength(1)
    expect(status.primary.remaining).toBe(4)
    expect(status.groups[0].businessClientId).toBe('bc-mine')
  })

  it('rehydrates the same balance from the same canonical rows', () => {
    const payload = {
      summaryRows: [summaryRow({ passId: 'p1', balance: 7 })],
      historyRows: [
        historyRow({
          entryType: PASS_LEDGER_ENTRY_TYPE.PURCHASE,
          quantity: 10,
          occurredAt: '2026-09-01T10:00:00.000Z',
        }),
        historyRow({
          entryType: PASS_LEDGER_ENTRY_TYPE.SESSION_USED,
          quantity: -3,
          occurredAt: '2026-09-10T10:00:00.000Z',
        }),
      ],
    }

    const first = buildAthletePassStatus(payload)
    const second = buildAthletePassStatus(payload)
    expect(second).toEqual(first)
    expect(first.primary.remaining).toBe(7)
    expect(first.primary.usageLabel).toBe('3 of 10 used')
  })
})
