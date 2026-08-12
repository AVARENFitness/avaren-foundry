import { describe, expect, it } from 'vitest'
import { APPOINTMENT_STATUS } from './coachingAppointment'
import {
  buildPassCompletionForensics,
  buildPassSelectionForensics,
  logPassCompletionForensics,
} from './coachPassForensics'
import {
  PASS_LEDGER_ENTRY_TYPE,
  resolveSessionPassDebitState,
} from './coachPass'

describe('coachPassForensics', () => {
  it('builds a dev-safe completion report', () => {
    const report = buildPassCompletionForensics({
      session: {
        id: 'session-1',
        athleteId: 'athlete-jake',
        businessClientId: 'bc-jake',
        status: 'completed',
        sessionDate: '2026-08-13',
      },
      passResult: {
        ok: false,
        passSelectionRequired: true,
        candidates: [{ pass_id: 'p1' }, { pass_id: 'p2' }],
      },
      attendanceUpdateCalled: true,
      attendanceUpdateSucceeded: true,
      passUsageCalled: true,
      passUsageRpcCalled: true,
    })

    expect(report.passUsageRpcCalled).toBe(true)
    expect(report.passUsageResult.passSelectionRequired).toBe(true)
    expect(report.passUsageResult.candidateCount).toBe(2)
    expect(report.businessClientIdPresent).toBe(true)
    expect(report.appointmentStatusCompleted).toBe(true)
  })

  it('does not log outside dev', () => {
    const original = import.meta.env.DEV
    import.meta.env.DEV = false
    expect(() => logPassCompletionForensics({ passUsageRpcCalled: true })).not.toThrow()
    import.meta.env.DEV = original
  })

  it('builds a dev-safe selected-pass report', () => {
    const report = buildPassSelectionForensics({
      session: {
        id: 'session-1',
        status: 'completed',
        businessClientId: 'bc-jake',
      },
      passId: 'pass-1',
      candidate: { pass_id: 'pass-1', balance: 3 },
      passResult: { ok: true, passId: 'pass-1', balanceAfter: 2 },
    })

    expect(report.handlerName).toBe('handlePassSelection')
    expect(report.sessionIdSent).toBe(true)
    expect(report.passIdSent).toBe(true)
    expect(report.appointmentStatus).toBe('completed')
    expect(report.passBalanceShown).toBe(3)
  })
})

describe('resolveSessionPassDebitState', () => {
  it('requires pass selection when multiple active passes remain', () => {
    const state = resolveSessionPassDebitState({
      session: { id: 's1', status: APPOINTMENT_STATUS.COMPLETED },
      ledgerBySessionId: {},
      passSummary: {
        activeCount: 2,
        totalBalance: 8,
        passes: [
          { balance: 3, status: 'active' },
          { balance: 5, status: 'active' },
        ],
      },
    })

    expect(state.kind).toBe('selection_required')
  })

  it('marks completed sessions without ledger as pending when one pass has balance', () => {
    const state = resolveSessionPassDebitState({
      session: { id: 's1', status: APPOINTMENT_STATUS.COMPLETED },
      ledgerBySessionId: {},
      passSummary: {
        activeCount: 1,
        totalBalance: 7,
        passes: [{ balance: 7, status: 'active' }],
      },
    })

    expect(state.kind).toBe('pending_debit')
  })

  it('detects debited sessions from ledger', () => {
    const state = resolveSessionPassDebitState({
      session: { id: 's1', status: APPOINTMENT_STATUS.COMPLETED },
      ledgerBySessionId: {
        s1: { entryType: PASS_LEDGER_ENTRY_TYPE.SESSION_USED, passId: 'p1' },
      },
      passSummary: { activeCount: 1, totalBalance: 6, passes: [] },
    })

    expect(state.kind).toBe('debited')
    expect(state.passId).toBe('p1')
  })
})
