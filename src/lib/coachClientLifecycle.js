import { normalizeBusinessClientRecord } from './coachBusinessClient.js'

const LIFECYCLE_RPC_ERROR_CODES = [
  'not_authorized',
  'not_authenticated',
  'business_client_not_found',
  'business_client_not_linked',
  'lifecycle_action_failed',
]

export const END_COACHING_COPY = {
  title: 'End coaching',
  message:
    'Future scheduled appointments will be cancelled. All sessions, passes, notes, workouts, and coaching history will be preserved.',
  confirmLabel: 'End coaching',
  success: 'Coaching ended. History preserved.',
}

export const REOPEN_COACHING_COPY = {
  title: 'Reopen coaching',
  message: 'Return this client to your active roster.',
  confirmLabel: 'Reopen coaching',
  success: 'Coaching reopened.',
}

export const UNLINK_ACCOUNT_COPY = {
  title: 'Unlink AVAREN account',
  message:
    'Remove app access while keeping this business client and all coaching history on file.',
  confirmLabel: 'Unlink account',
  success: 'AVAREN account unlinked.',
}

const LIFECYCLE_USER_MESSAGES = {
  not_authorized: 'Unable to complete this action.',
  not_authenticated: 'Sign in to continue.',
  business_client_not_found: 'Client record not found. Refresh and try again.',
  business_client_not_linked: 'This client is not linked to an AVAREN account.',
  lifecycle_action_failed: 'Unable to complete this action.',
}

export const mapLifecycleRpcError = (error) => {
  const message = String(error?.message ?? error ?? '')
  const code =
    LIFECYCLE_RPC_ERROR_CODES.find((entry) => message.includes(entry)) ??
    'lifecycle_action_failed'

  if (import.meta.env?.DEV) {
    console.debug('[coach-lifecycle-rpc]', { code, message })
  }

  return {
    ok: false,
    error: code,
    message: LIFECYCLE_USER_MESSAGES[code] ?? LIFECYCLE_USER_MESSAGES.lifecycle_action_failed,
    devMessage: message,
  }
}

export const normalizeLifecycleRpcResult = (payload) => {
  if (!payload || payload.ok !== true) {
    throw new Error('lifecycle_action_failed')
  }
  return payload
}

export const mapLifecycleActionError = (
  error,
  fallback = 'Unable to complete this action.',
) => {
  const message = String(error?.message ?? error ?? '')
  const mapped = mapLifecycleRpcError(error)
  if (mapped.error !== 'lifecycle_action_failed') {
    return mapped.message
  }
  if (/business_client_not_linked/i.test(message)) {
    return LIFECYCLE_USER_MESSAGES.business_client_not_linked
  }
  return fallback
}

export async function endBusinessClientCoaching(
  coachBackend,
  businessClientId,
  { unlinkAccount = false } = {},
) {
  const updated = await coachBackend.endBusinessClientCoaching({
    businessClientId,
    unlinkAccount,
  })
  return normalizeBusinessClientRecord(updated)
}

export async function reopenBusinessClientCoaching(coachBackend, businessClientId) {
  const updated = await coachBackend.reopenBusinessClientCoaching({
    businessClientId,
  })
  return normalizeBusinessClientRecord(updated)
}

export async function unlinkBusinessClientAccount(coachBackend, businessClientId) {
  const updated = await coachBackend.unlinkBusinessClientAccount({
    businessClientId,
  })
  return normalizeBusinessClientRecord(updated)
}

/** Canonical Phase C unlink entry — alias for unlinkBusinessClientAccount. */
export const unlinkBusinessClientUser = unlinkBusinessClientAccount
