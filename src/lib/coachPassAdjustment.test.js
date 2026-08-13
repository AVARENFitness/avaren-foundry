import { describe, expect, it } from 'vitest'
import { PASS_LEDGER_ENTRY_TYPE } from './coachPass'
import {
  PASS_DEBIT_REASON,
  formatPassLedgerHistoryHeadline,
  formatPassLedgerQuantityLabel,
  listEligibleDebitPasses,
  mapPassAdjustmentError,
  normalizeManualPassAdjustmentResult,
  resolveManualDebitEntryType,
  resolveManualDebitLedgerReason,
  resolveManualCreditLedgerReason,
} from './coachPassAdjustment'

describe('coachPassAdjustment', () => {
  it('maps administrative manual debits to manual_debit ledger type', () => {
    expect(resolveManualDebitEntryType(PASS_DEBIT_REASON.NO_SHOW)).toBe(
      PASS_LEDGER_ENTRY_TYPE.MANUAL_DEBIT,
    )
    expect(resolveManualDebitEntryType(PASS_DEBIT_REASON.LATE_CANCELLATION)).toBe(
      PASS_LEDGER_ENTRY_TYPE.MANUAL_DEBIT,
    )
  })

  it('stores human-readable debit reasons for the ledger', () => {
    expect(
      resolveManualDebitLedgerReason(PASS_DEBIT_REASON.LATE_CANCELLATION),
    ).toBe('Late cancellation')
    expect(resolveManualDebitLedgerReason(PASS_DEBIT_REASON.NO_SHOW)).toBe(
      'No-show',
    )
    expect(
      resolveManualDebitLedgerReason(
        PASS_DEBIT_REASON.ADMINISTRATIVE,
        'Policy exception',
      ),
    ).toBe('Administrative adjustment: Policy exception')
  })

  it('stores charge reversed copy for credit restoration', () => {
    expect(
      resolveManualCreditLedgerReason('charge_reversed', '', {
        useCreditRestored: true,
      }),
    ).toBe('Charge reversed')
  })

  it('normalizes manual debit RPC success with balance transition', () => {
    const result = normalizeManualPassAdjustmentResult(
      { ok: true, balance_after: 3 },
      { passId: 'pass-1', quantity: 1, balanceBefore: 4 },
    )

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        passId: 'pass-1',
        balanceBefore: 4,
        balanceAfter: 3,
        quantity: 1,
      }),
    )
  })

  it('maps insufficient balance to friendly copy', () => {
    expect(
      mapPassAdjustmentError(new Error('insufficient_balance')),
    ).toBe('This pass has no sessions remaining.')
    expect(mapPassAdjustmentError(new Error('pass_not_found'))).toBe(
      'Select a pass to charge.',
    )
    expect(mapPassAdjustmentError(new Error('reason_required'))).toBe(
      'Enter a reason.',
    )
  })

  it('lists only active passes with remaining balance for debits', () => {
    expect(
      listEligibleDebitPasses([
        { id: 'a', status: 'active', balance: 2 },
        { id: 'b', status: 'active', balance: 0 },
        { id: 'c', status: 'archived', balance: 5 },
      ]).map((pass) => pass.id),
    ).toEqual(['a'])
  })

  it('renders ledger history headlines from reason or entry type', () => {
    expect(
      formatPassLedgerHistoryHeadline({
        entryType: PASS_LEDGER_ENTRY_TYPE.MANUAL_DEBIT,
        reason: 'Late cancellation',
      }),
    ).toBe('Late cancellation')
    expect(
      formatPassLedgerHistoryHeadline({
        entryType: PASS_LEDGER_ENTRY_TYPE.SESSION_USED,
      }),
    ).toBe('Completed session')
    expect(
      formatPassLedgerHistoryHeadline({
        entryType: PASS_LEDGER_ENTRY_TYPE.PURCHASE,
      }),
    ).toBe('Package purchased')
  })

  it('formats signed session quantity labels', () => {
    expect(formatPassLedgerQuantityLabel(-1)).toBe('−1 session')
    expect(formatPassLedgerQuantityLabel(5)).toBe('+5 sessions')
  })
})
