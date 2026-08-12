export const APPOINTMENT_RPC_STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error',
  AUTH_WAIT: 'auth_wait',
}

export const createEmptyAppointmentDiagnostics = () => ({
  authUserPresent: false,
  userIdSuffix: null,
  rpcRequested: false,
  rpcStatus: APPOINTMENT_RPC_STATUS.IDLE,
  rpcResultCount: 0,
  normalizedCount: 0,
  canonicalCount: 0,
  futureFilterCount: 0,
  nextAppointmentPresent: false,
  errorCode: null,
  errorCategory: null,
  errorMessage: null,
  errorDetails: null,
  errorHint: null,
  errorFriendlyMessage: null,
  authSynced: null,
  lastFetchAt: null,
  currentInstant: new Date().toISOString(),
})

export const userIdSuffix = (value = null) => {
  const id = String(value ?? '')
  if (!id) return null
  return id.slice(-6)
}

const pickSupabaseErrorFields = (error = null) => ({
  code: error?.code ?? null,
  message: error?.message ?? null,
  details: error?.details ?? null,
  hint: error?.hint ?? null,
})

/** Prefer the original PostgREST/PostgreSQL error over friendly install wrappers. */
export const extractSupabaseError = (error = null) => {
  const cause = error?.cause && error.cause !== error ? error.cause : null
  const fromCause = cause ? pickSupabaseErrorFields(cause) : null
  const fromDirect = pickSupabaseErrorFields(error)

  return {
    code: fromCause?.code ?? fromDirect.code,
    message: fromCause?.message ?? fromDirect.message,
    details: fromCause?.details ?? fromDirect.details,
    hint: fromCause?.hint ?? fromDirect.hint,
    friendlyMessage:
      cause && fromDirect.message && fromCause?.message
        ? fromDirect.message
        : null,
  }
}
