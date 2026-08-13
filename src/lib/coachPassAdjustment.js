import {
  PASS_LEDGER_ENTRY_TYPE,
  formatPassLedgerLabel,
  parsePassUsageRpcPayload,
} from './coachPass'

export const PASS_DEBIT_REASON = {
  LATE_CANCELLATION: 'late_cancellation',
  NO_SHOW: 'no_show',
  CANCELLATION_POLICY: 'cancellation_policy',
  ADMINISTRATIVE: 'administrative_adjustment',
  OTHER: 'other',
}

export const PASS_CREDIT_REASON = {
  CHARGE_REVERSED: 'charge_reversed',
  ADMINISTRATIVE: 'administrative_adjustment',
  OTHER: 'other',
}

export const PASS_DEBIT_REASON_OPTIONS = [
  { id: PASS_DEBIT_REASON.LATE_CANCELLATION, label: 'Late cancellation' },
  { id: PASS_DEBIT_REASON.NO_SHOW, label: 'No-show' },
  { id: PASS_DEBIT_REASON.CANCELLATION_POLICY, label: 'Cancellation policy' },
  {
    id: PASS_DEBIT_REASON.ADMINISTRATIVE,
    label: 'Administrative adjustment',
  },
  { id: PASS_DEBIT_REASON.OTHER, label: 'Other' },
]

export const PASS_CREDIT_REASON_OPTIONS = [
  { id: PASS_CREDIT_REASON.CHARGE_REVERSED, label: 'Charge reversed' },
  {
    id: PASS_CREDIT_REASON.ADMINISTRATIVE,
    label: 'Administrative adjustment',
  },
  { id: PASS_CREDIT_REASON.OTHER, label: 'Other' },
]

const PASS_DEBIT_REASON_LABELS = Object.fromEntries(
  PASS_DEBIT_REASON_OPTIONS.map((option) => [option.id, option.label]),
)

const PASS_CREDIT_REASON_LABELS = Object.fromEntries(
  PASS_CREDIT_REASON_OPTIONS.map((option) => [option.id, option.label]),
)

/** Administrative manual debits always use manual_debit — no_show_charged requires an appointment. */
export const resolveManualDebitEntryType = () => PASS_LEDGER_ENTRY_TYPE.MANUAL_DEBIT

export const resolveManualDebitLedgerReason = (reasonCode = '', note = '') => {
  const trimmedNote = String(note ?? '').trim()
  const base =
    PASS_DEBIT_REASON_LABELS[reasonCode] ?? 'Administrative adjustment'

  if (reasonCode === PASS_DEBIT_REASON.OTHER) {
    return trimmedNote || base
  }

  if (trimmedNote) {
    return `${base}: ${trimmedNote}`
  }

  return base
}

export const resolveManualCreditLedgerReason = (
  reasonCode = '',
  note = '',
  { useCreditRestored = false } = {},
) => {
  const trimmedNote = String(note ?? '').trim()
  const labels = useCreditRestored
    ? {
        ...PASS_CREDIT_REASON_LABELS,
        [PASS_CREDIT_REASON.CHARGE_REVERSED]: 'Charge reversed',
      }
    : PASS_CREDIT_REASON_LABELS
  const base = labels[reasonCode] ?? 'Administrative adjustment'

  if (reasonCode === PASS_CREDIT_REASON.OTHER) {
    return trimmedNote || base
  }

  if (trimmedNote) {
    return `${base}: ${trimmedNote}`
  }

  return base
}

export const formatPassLedgerHistoryHeadline = (entry = {}) => {
  const entryType = entry.entryType ?? entry.entry_type ?? ''
  const reason = String(entry.reason ?? '').trim()

  switch (entryType) {
    case PASS_LEDGER_ENTRY_TYPE.SESSION_USED:
      return 'Completed session'
    case PASS_LEDGER_ENTRY_TYPE.PURCHASE:
      return 'Package purchased'
    case PASS_LEDGER_ENTRY_TYPE.NO_SHOW_CHARGED:
      return reason || 'No-show'
    case PASS_LEDGER_ENTRY_TYPE.MANUAL_DEBIT:
    case PASS_LEDGER_ENTRY_TYPE.MANUAL_CREDIT:
    case PASS_LEDGER_ENTRY_TYPE.CREDIT_RESTORED:
    case PASS_LEDGER_ENTRY_TYPE.BONUS:
      return reason || formatPassLedgerLabel(entryType)
    default:
      return reason || formatPassLedgerLabel(entryType)
  }
}

export const formatPassLedgerQuantityLabel = (quantity = 0) => {
  const value = Number(quantity ?? 0)
  const absolute = Math.abs(value)
  const unit = absolute === 1 ? 'session' : 'sessions'
  const prefix = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${prefix}${absolute} ${unit}`
}

export const listEligibleDebitPasses = (passes = []) =>
  (passes ?? []).filter(
    (pass) =>
      pass?.status === 'active' && Number(pass.balance ?? 0) > 0,
  )

export const listEligibleCreditPasses = (passes = []) =>
  (passes ?? []).filter((pass) => pass?.status === 'active')

export const mapPassAdjustmentError = (error, fallback = 'Unable to adjust pass.') => {
  const message = String(error?.message ?? error ?? '')
  const codeMatchers = [
    ['insufficient_balance', 'This pass has no sessions remaining.'],
    ['ledger_would_go_negative', 'This pass has no sessions remaining.'],
    ['pass_not_found', 'Select a pass to charge.'],
    ['reason_required', 'Enter a reason.'],
    ['invalid_quantity', 'Enter a valid quantity.'],
    ['not_authorized', 'Unable to adjust pass.'],
    ['pass_not_eligible_for_session', 'Unable to adjust pass.'],
  ]

  for (const [code, copy] of codeMatchers) {
    if (message.includes(code)) {
      return copy
    }
  }

  return fallback
}

export const normalizeManualPassAdjustmentResult = (
  payload,
  { passId, quantity, balanceBefore = null } = {},
) => {
  const parsed = parsePassUsageRpcPayload(payload)

  if (!parsed?.ok) {
    return {
      ok: false,
      message: mapPassAdjustmentError({ message: parsed?.error ?? '' }),
    }
  }

  const balanceAfter = Number(parsed.balance_after ?? 0)
  const resolvedBefore =
    balanceBefore != null
      ? Number(balanceBefore)
      : balanceAfter + Number(quantity ?? 0)

  return {
    ok: true,
    passId,
    balanceBefore: resolvedBefore,
    balanceAfter,
    quantity: Number(quantity ?? 0),
    ledgerEntryId: parsed.ledger_entry_id ?? null,
    message: `${Number(quantity ?? 0)} session${Number(quantity ?? 0) === 1 ? '' : 's'} adjusted`,
  }
}
