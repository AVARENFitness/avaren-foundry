import { APPOINTMENT_STATUS } from './coachingAppointment'
import { AVA_COACH_PASS_QUERY_CONTRACT } from './appointmentPassFoundation'

export const PASS_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  ARCHIVED: 'archived',
}

export const PASS_LEDGER_ENTRY_TYPE = {
  PURCHASE: 'purchase',
  SESSION_USED: 'session_used',
  NO_SHOW_CHARGED: 'no_show_charged',
  BONUS: 'bonus',
  MANUAL_CREDIT: 'manual_credit',
  MANUAL_DEBIT: 'manual_debit',
  CREDIT_RESTORED: 'credit_restored',
  PACKAGE_REFUND: 'package_refund',
  EXPIRED_FORFEIT: 'expired_forfeit',
  LEGACY_MIGRATION_DEBIT: 'legacy_migration_debit',
}

export const COACH_VISIBLE_LEDGER_TYPES = Object.values(PASS_LEDGER_ENTRY_TYPE)

export const ATHLETE_VISIBLE_LEDGER_TYPES = [
  PASS_LEDGER_ENTRY_TYPE.PURCHASE,
  PASS_LEDGER_ENTRY_TYPE.SESSION_USED,
  PASS_LEDGER_ENTRY_TYPE.NO_SHOW_CHARGED,
  PASS_LEDGER_ENTRY_TYPE.BONUS,
  PASS_LEDGER_ENTRY_TYPE.CREDIT_RESTORED,
]

const PASS_RPC_ERROR_CODES = [
  'pass_not_eligible_for_session',
  'pass_id_required',
  'ledger_would_go_negative',
  'insufficient_balance',
  'ledger_appointment_client_mismatch',
  'ledger_client_pass_mismatch',
  'ledger_coach_pass_mismatch',
  'duplicate key',
  'unique_violation',
  'missed_charge_waived',
  'missed_charge_not_approved',
  'session_not_completed',
  'session_not_missed',
  'session_missing_business_client',
  'not_authorized',
  'not_authenticated',
  'business_client_not_found',
  'invalid_session_count',
  'starts_at_required',
  'reason_required',
  'invalid_quantity',
]

export const resolvePassCandidateId = (value) => {
  if (!value) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || null
  }
  if (typeof value === 'object') {
    return value.pass_id ?? value.passId ?? value.id ?? null
  }
  return null
}

export const parsePassUsageRpcPayload = (data) => {
  if (data == null) return null
  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return null
    }
  }
  if (typeof data === 'object') return data
  return null
}

export const normalizePassSelectionCandidates = (candidates = []) =>
  (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => {
      const passId = resolvePassCandidateId(candidate)
      if (!passId) return null
      return {
        ...candidate,
        pass_id: passId,
        passId,
        balance: Number(candidate.balance ?? candidate.remaining ?? 0),
        name: candidate.name ?? candidate.pass_name ?? 'Training pass',
        starts_at: candidate.starts_at ?? candidate.startsAt ?? null,
        expires_at: candidate.expires_at ?? candidate.expiresAt ?? null,
      }
    })
    .filter(Boolean)

export const passUsageResultUserMessage = (result = {}) => {
  if (result.message) return result.message
  if (result.unchanged) return 'Pass already applied.'
  if (result.passSelectionRequired) return 'Choose a training pass to continue.'
  if (result.noPass) return 'No eligible training pass for this session date.'

  const code = result.error ?? 'pass_action_failed'
  const messages = {
    pass_not_eligible_for_session: "This pass can't be used for this session.",
    pass_id_required: 'Select a training pass to continue.',
    pass_selection_required: 'Choose a training pass to continue.',
    ledger_would_go_negative: 'This pass does not have enough credits.',
    insufficient_balance: 'This pass does not have enough credits.',
    ledger_appointment_client_mismatch: "This pass can't be used for this session.",
    ledger_client_pass_mismatch: "This pass can't be used for this session.",
    ledger_coach_pass_mismatch: "This pass can't be used for this session.",
    'duplicate key': 'Pass already applied.',
    unique_violation: 'Pass already applied.',
    empty_response: "We couldn't apply this session to the pass. Try again.",
    session_not_completed: 'Complete the session before using a pass.',
    session_missing_business_client: 'This appointment is missing client linkage.',
    pass_action_failed: "We couldn't apply this session to the pass. Try again.",
  }

  return messages[code] ?? messages.pass_action_failed
}

export const mapPassRpcError = (error) => {
  const message = String(error?.message ?? error ?? '')
  const code =
    PASS_RPC_ERROR_CODES.find((entry) => message.includes(entry)) ??
    'pass_action_failed'

  const userMessages = {
    pass_not_eligible_for_session: "This pass can't be used for this session.",
    pass_id_required: 'Select a training pass to continue.',
    ledger_would_go_negative: 'This pass does not have enough credits.',
    insufficient_balance: 'This pass does not have enough credits.',
    ledger_appointment_client_mismatch: "This pass can't be used for this session.",
    ledger_client_pass_mismatch: "This pass can't be used for this session.",
    ledger_coach_pass_mismatch: "This pass can't be used for this session.",
    'duplicate key': 'Pass already applied.',
    unique_violation: 'Pass already applied.',
    missed_charge_waived: 'This missed session was marked as no charge.',
    missed_charge_not_approved: 'Charge was not approved for this session.',
    session_not_completed: 'Complete the session before using a pass.',
    session_not_missed: 'Only missed sessions can be charged.',
    session_missing_business_client:
      'This appointment is missing client linkage.',
    not_authorized: 'You are not authorized for this action.',
    not_authenticated: 'Sign in to continue.',
    business_client_not_found: 'Client record not found.',
    invalid_session_count: 'Enter a valid number of sessions.',
    starts_at_required: 'Choose a start date for the pass.',
    reason_required: 'Add a short reason to continue.',
    invalid_quantity: 'Enter a valid quantity.',
    pass_action_failed: 'Could not update the training pass.',
  }

  if (import.meta.env?.DEV) {
    console.debug('[coach-pass-rpc]', { code, message })
  }

  return {
    ok: false,
    error: code,
    message: userMessages[code] ?? userMessages.pass_action_failed,
    devMessage: message,
  }
}

export const normalizePassBalanceViewRow = (row) => {
  if (!row) return null

  return {
    id: row.pass_id ?? row.id,
    coachId: row.coach_id,
    businessClientId: row.business_client_id,
    name: row.name ?? 'Training pass',
    sessionsPurchased: Number(row.sessions_purchased ?? 0),
    status: row.pass_status ?? row.status ?? PASS_STATUS.ACTIVE,
    startsAt: row.starts_at ?? null,
    expiresAt: row.expires_at ?? null,
    balance: Number(row.balance ?? 0),
  }
}

export const normalizeCoachPass = (row) => {
  if (!row) return null

  const balanceRow = row.coach_client_pass_balances ?? row.balance_row ?? null
  const balance =
    balanceRow?.balance ??
    row.balance ??
    (Array.isArray(row.coach_client_pass_balances)
      ? row.coach_client_pass_balances[0]?.balance
      : null) ??
    0

  return {
    id: row.id ?? row.pass_id,
    coachId: row.coach_id,
    businessClientId: row.business_client_id,
    name: row.name ?? 'Training pass',
    sessionsPurchased: Number(row.sessions_purchased ?? 0),
    status: row.pass_status ?? row.status ?? PASS_STATUS.ACTIVE,
    startsAt: row.starts_at ?? null,
    expiresAt: row.expires_at ?? null,
    notes: row.notes ?? '',
    balance: Number(balance ?? 0),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  }
}

export const normalizePassLedgerEntry = (row) => {
  if (!row) return null

  return {
    id: row.id,
    passId: row.pass_id,
    coachId: row.coach_id,
    businessClientId: row.business_client_id,
    entryType: row.entry_type,
    quantity: Number(row.quantity ?? 0),
    scheduledSessionId: row.scheduled_session_id ?? null,
    reason: row.reason ?? '',
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    passName: row.pass_name ?? row.coach_client_passes?.name ?? null,
  }
}

export const normalizePassUsageRpcResult = (payload) => {
  const parsed = parsePassUsageRpcPayload(payload)
  if (!parsed || typeof parsed !== 'object') {
    return {
      ok: false,
      error: 'empty_response',
      message: passUsageResultUserMessage({ error: 'empty_response' }),
    }
  }

  if (parsed.pass_selection_required) {
    return {
      ok: false,
      passSelectionRequired: true,
      candidates: normalizePassSelectionCandidates(parsed.candidates ?? []),
      error: 'pass_selection_required',
      message: passUsageResultUserMessage({ passSelectionRequired: true }),
    }
  }

  if (parsed.no_pass) {
    return {
      ok: true,
      noPass: true,
      unchanged: Boolean(parsed.unchanged),
      requiresCoachResolution: Boolean(parsed.requires_coach_resolution),
      message: passUsageResultUserMessage({ noPass: true }),
    }
  }

  if (parsed.unchanged) {
    return {
      ok: true,
      unchanged: true,
      passId: parsed.pass_id ?? null,
      message: passUsageResultUserMessage({ unchanged: true }),
    }
  }

  if (parsed.ok === false && parsed.error) {
    return {
      ok: false,
      error: parsed.error,
      message: passUsageResultUserMessage({ error: parsed.error }),
    }
  }

  return {
    ok: true,
    passId: parsed.pass_id ?? null,
    balanceAfter: parsed.balance_after ?? null,
    debited: parsed.debited ?? null,
    decision: parsed.decision ?? null,
  }
}

export const formatPassLedgerLabel = (entryType = '') => {
  const labels = {
    [PASS_LEDGER_ENTRY_TYPE.PURCHASE]: 'Purchase',
    [PASS_LEDGER_ENTRY_TYPE.SESSION_USED]: 'Session used',
    [PASS_LEDGER_ENTRY_TYPE.NO_SHOW_CHARGED]: 'No-show charged',
    [PASS_LEDGER_ENTRY_TYPE.BONUS]: 'Bonus',
    [PASS_LEDGER_ENTRY_TYPE.MANUAL_CREDIT]: 'Manual credit',
    [PASS_LEDGER_ENTRY_TYPE.MANUAL_DEBIT]: 'Manual debit',
    [PASS_LEDGER_ENTRY_TYPE.CREDIT_RESTORED]: 'Credit restored',
    [PASS_LEDGER_ENTRY_TYPE.PACKAGE_REFUND]: 'Package refund',
    [PASS_LEDGER_ENTRY_TYPE.EXPIRED_FORFEIT]: 'Expired forfeit',
    [PASS_LEDGER_ENTRY_TYPE.LEGACY_MIGRATION_DEBIT]: 'Legacy migration',
  }
  return labels[entryType] ?? entryType.replace(/_/g, ' ')
}

export const indexLedgerBySessionId = (entries = []) =>
  (entries ?? []).reduce((map, entry) => {
    if (entry?.scheduledSessionId) {
      map[entry.scheduledSessionId] = entry
    }
    return map
  }, {})

export const appointmentPassEffectLabel = (
  appointment = {},
  ledgerBySessionId = {},
) => appointmentPassEffectMeta(appointment, ledgerBySessionId).label

export const appointmentPassEffectMeta = (
  appointment = {},
  ledgerBySessionId = {},
) => {
  const status = appointment?.status
  const ledger = ledgerBySessionId[appointment?.id]

  if (status === APPOINTMENT_STATUS.COMPLETED) {
    if (ledger?.entryType === PASS_LEDGER_ENTRY_TYPE.SESSION_USED) {
      return {
        label: 'Completed · 1 session used',
        chip: 'Completed',
        detail: '1 session used',
        tone: 'success',
        needsPassAction: false,
      }
    }

    return {
      label: 'Completed · No eligible training pass',
      chip: 'Completed',
      detail: 'No eligible training pass',
      tone: 'attention',
      needsPassAction: true,
    }
  }

  if (status === APPOINTMENT_STATUS.CANCELLED) {
    return {
      label: 'Cancelled · No charge',
      chip: 'Cancelled',
      detail: 'No charge',
      tone: 'neutral',
      needsPassAction: false,
    }
  }

  if (status === APPOINTMENT_STATUS.MISSED) {
    if (ledger?.entryType === PASS_LEDGER_ENTRY_TYPE.NO_SHOW_CHARGED) {
      return {
        label: 'Missed · Session charged',
        chip: 'Missed',
        detail: 'Session charged',
        tone: 'attention',
        needsPassAction: false,
      }
    }

    if (appointment?.missedChargeDecision === 'no_charge') {
      return {
        label: 'Missed · No charge',
        chip: 'Missed',
        detail: 'No charge',
        tone: 'neutral',
        needsPassAction: false,
      }
    }

    return {
      label: 'Missed · No charge recorded',
      chip: 'Missed',
      detail: 'No charge recorded',
      tone: 'neutral',
      needsPassAction: false,
    }
  }

  return {
    label: null,
    chip: status ?? null,
    detail: null,
    tone: 'neutral',
    needsPassAction: false,
  }
}

export const resolveSessionPassDebitState = ({
  session = null,
  ledgerBySessionId = {},
  passSummary = null,
} = {}) => {
  if (!session || session.status !== APPOINTMENT_STATUS.COMPLETED) {
    return { kind: 'not_applicable' }
  }

  const ledger = ledgerBySessionId[session.id]
  if (ledger?.entryType === PASS_LEDGER_ENTRY_TYPE.SESSION_USED) {
    return { kind: 'debited', passId: ledger.passId ?? null }
  }

  const activeCount = passSummary?.activeCount ?? 0
  const totalBalance = passSummary?.totalBalance ?? 0

  if (activeCount > 1 || (passSummary?.passes ?? []).filter((p) => p.balance > 0).length > 1) {
    return { kind: 'selection_required' }
  }

  if (totalBalance > 0 && activeCount > 0) {
    return { kind: 'pending_debit' }
  }

  return { kind: 'no_eligible_pass' }
}

export const summarizeClientPasses = (passes = []) => {
  const active = (passes ?? []).filter(
    (pass) => pass?.status === PASS_STATUS.ACTIVE,
  )
  const totalBalance = active.reduce(
    (sum, pass) => sum + Number(pass.balance ?? 0),
    0,
  )
  const primary =
    active.find((pass) => pass.balance > 0) ??
    active[0] ??
    passes[0] ??
    null

  return {
    activeCount: active.length,
    totalBalance,
    primaryPass: primary,
    passes: passes ?? [],
  }
}

export const lowPassLabel = (balance) => {
  const value = Number(balance ?? 0)
  if (value <= 0) return 'No sessions remaining'
  if (value <= 2) return `Low pass · ${value} sessions remaining`
  return null
}

export const buildCoachPassAvaContext = ({
  client = {},
  passes = [],
  ledger = [],
  appointments = [],
} = {}) => {
  const summary = summarizeClientPasses(passes)
  const completed = (appointments ?? []).filter(
    (item) => item?.status === APPOINTMENT_STATUS.COMPLETED,
  )
  const snapshot = {
    remainingSessions: summary.totalBalance,
    usedSessions: Math.max(
      0,
      summary.passes.reduce(
        (sum, pass) =>
          sum + Math.max(0, pass.sessionsPurchased - pass.balance),
        0,
      ),
    ),
  }

  const lastCompleted = [...completed].sort((a, b) =>
    String(b.sessionDate ?? '').localeCompare(String(a.sessionDate ?? '')),
  )[0]

  return {
    clientId: client.business_client_id ?? client.businessClientId ?? null,
    athleteId: client.athlete_id ?? null,
    displayName: client.display_name ?? client.athlete_display_name ?? '',
    passSummary: summary,
    sessionsRemaining: AVA_COACH_PASS_QUERY_CONTRACT.sessionsRemaining({
      snapshot,
    }),
    sessionsUsed: AVA_COACH_PASS_QUERY_CONTRACT.sessionsUsed({ snapshot }),
    lastInPersonSession: AVA_COACH_PASS_QUERY_CONTRACT.lastInPersonSession({
      history: completed,
    }),
    ledgerEntryCount: ledger.length,
    lastSessionDate: lastCompleted?.sessionDate ?? null,
  }
}

export const normalizeAthletePassSummary = (rows = []) =>
  (Array.isArray(rows) ? rows : []).map((row) => ({
    passId: row.pass_id,
    name: row.name ?? 'Training pass',
    balance: Number(row.balance ?? 0),
    startsAt: row.starts_at ?? null,
    expiresAt: row.expires_at ?? null,
    status: row.status ?? PASS_STATUS.ACTIVE,
  }))

export const normalizeAthletePassHistory = (rows = []) =>
  (Array.isArray(rows) ? rows : []).map((row) => ({
    occurredAt: row.occurred_at ?? row.created_at ?? null,
    entryType: row.entry_type,
    quantity: Number(row.quantity ?? 0),
    passName: row.pass_name ?? 'Training pass',
    label: formatPassLedgerLabel(row.entry_type),
  }))

export const auditDirectPassMutations = (sourceText = '') => {
  const forbidden = [
    ".from('coach_client_passes').insert",
    '.from("coach_client_passes").insert',
    ".from('coach_client_pass_ledger').insert",
    '.from("coach_client_pass_ledger").insert',
  ]
  return forbidden.filter((pattern) => sourceText.includes(pattern))
}
