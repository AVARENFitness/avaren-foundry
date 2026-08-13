const LIFECYCLE_ERROR_MESSAGES = {
  not_authorized: 'Unable to complete this action.',
  business_client_not_found: 'Client record not found. Refresh and try again.',
  first_name_required: 'First name is required.',
  lifecycle_action_failed: 'Unable to complete this action.',
}

export const mapLifecycleUserMessage = (
  error = null,
  fallback = 'Unable to complete this action.',
) => {
  const raw = String(error?.message ?? error ?? '')
  const code = raw.match(/^[a-z0-9_]+$/)?.[0] ?? raw
  if (LIFECYCLE_ERROR_MESSAGES[code]) {
    return LIFECYCLE_ERROR_MESSAGES[code]
  }
  if (/create_coach_business_client|create business/i.test(raw)) {
    return 'Unable to create client.'
  }
  if (/not installed|migration|does not exist/i.test(raw)) {
    return fallback
  }
  return fallback
}

export const LIFECYCLE_SUCCESS = {
  CLIENT_CREATED: 'Client added.',
  INVITE_SENT: 'Invitation sent.',
}

export const INVITE_EMAIL_REQUIRED = 'Enter a valid athlete email.'

/** Invite-to-AVAREN only — not used for Add Client (business client creation). */
export function validateInviteEmail(email = '') {
  const normalized = String(email).trim().toLowerCase()
  if (!normalized.includes('@')) {
    return INVITE_EMAIL_REQUIRED
  }
  return null
}
