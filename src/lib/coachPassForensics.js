export const buildPassCompletionForensics = ({
  session = null,
  passResult = null,
  passUsageError = null,
  attendanceUpdateCalled = false,
  attendanceUpdateSucceeded = false,
  passUsageCalled = false,
  passUsageRpcCalled = false,
  refreshCalled = false,
  eligiblePassCount = null,
  activePassCount = null,
} = {}) => {
  const result = passResult ?? {}
  return {
    attendanceUpdateCalled,
    attendanceUpdateSucceeded,
    passUsageCalled,
    passUsageRpcCalled,
    passUsageResult: {
      ok: result.ok ?? null,
      unchanged: Boolean(result.unchanged),
      noPass: Boolean(result.noPass),
      passSelectionRequired: Boolean(result.passSelectionRequired),
      passId: result.passId ?? null,
      balanceAfter: result.balanceAfter ?? null,
      error: result.error ?? passUsageError ?? null,
      candidateCount: result.candidates?.length ?? null,
    },
    passUsageError: passUsageError ?? result.error ?? null,
    refreshCalled,
    appointmentExists: Boolean(session?.id),
    businessClientIdPresent: Boolean(
      session?.businessClientId ?? session?.business_client_id,
    ),
    coachIdMatches: true,
    athleteIdPresent: Boolean(session?.athleteId ?? session?.athlete_id),
    appointmentStatusCompleted:
      session?.status === 'completed' || session?.status === 'COMPLETED',
    sessionDate: session?.sessionDate ?? session?.session_date ?? null,
    scheduleTimezone: session?.scheduleTimezone ?? session?.schedule_timezone ?? null,
    eligiblePassCount,
    activePassCount,
  }
}

export const buildPassSelectionForensics = ({
  session = null,
  passId = null,
  candidate = null,
  passResult = null,
  rpcError = null,
  handlerName = 'handlePassSelection',
} = {}) => {
  const resolvedPassId = passId ?? candidate?.pass_id ?? candidate?.passId ?? null
  const result = passResult ?? {}
  return {
    handlerName,
    scheduledSessionIdPresent: Boolean(session?.id),
    selectedPassIdPresent: Boolean(resolvedPassId),
    businessClientIdPresent: Boolean(
      session?.businessClientId ?? session?.business_client_id,
    ),
    appointmentStatus: session?.status ?? null,
    passBalanceShown: candidate?.balance ?? null,
    sessionIdSent: Boolean(session?.id),
    passIdSent: Boolean(resolvedPassId),
    selectedPassIdMatchesCandidate:
      !resolvedPassId ||
      !candidate?.pass_id ||
      resolvedPassId === candidate.pass_id ||
      resolvedPassId === candidate.passId,
    rpcCalled: 'record_completed_session_pass_usage',
    rpcData: result.rawData ?? null,
    rpcErrorCode: rpcError?.code ?? null,
    rpcErrorMessage: rpcError?.message ?? result.devMessage ?? result.error ?? null,
    passUsageResult: {
      ok: result.ok ?? null,
      unchanged: Boolean(result.unchanged),
      passSelectionRequired: Boolean(result.passSelectionRequired),
      passId: result.passId ?? resolvedPassId ?? null,
      balanceAfter: result.balanceAfter ?? null,
      error: result.error ?? null,
    },
  }
}

export const logPassSelectionForensics = (report) => {
  if (!import.meta.env?.DEV || !report) return
  console.debug('[coach-pass-selection]', report)
}

export const logPassCompletionForensics = (report) => {
  if (!import.meta.env?.DEV || !report) return
  console.debug('[coach-pass-completion]', report)
}
