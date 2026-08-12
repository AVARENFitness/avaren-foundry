import { supabase } from './supabase'
import { classifyAthleteAppointmentFetchError, parseAthleteScheduledSessionsRpc } from './athleteAppointments'

const devOnly = (fn) => {
  if (import.meta.env.DEV) fn()
}

export const logAppointmentCreate = ({
  success = false,
  selectedLocalDate = null,
  selectedLocalTime = null,
  timezone = null,
  row = null,
  error = null,
} = {}) => {
  devOnly(() => {
    const startsAt = row?.starts_at ?? row?.startsAt ?? null
    const startsMs = startsAt ? new Date(startsAt).getTime() : null

    console.info('[appointment-create]', {
      success,
      selectedLocalDate,
      selectedLocalTime,
      timezone,
      storedSessionDate: row?.session_date ?? row?.sessionDate ?? null,
      startsAtPresent: Boolean(startsAt),
      futureRelativeToNow: Number.isFinite(startsMs) ? startsMs > Date.now() : null,
      appointmentIdPresent: Boolean(row?.id),
      errorCode: error?.code ?? null,
      errorMessage: error?.message ?? null,
    })
  })
}

export const logCoachCreateCheckpoint = (row = {}, { expectedAthleteId = null } = {}) => {
  devOnly(() => {
    const athleteId = row.athlete_id ?? row.athleteId ?? null
    const startsAt = row.starts_at ?? row.startsAt ?? null
    const startsMs = startsAt ? new Date(startsAt).getTime() : null

    console.info('[appointment-db-row]', {
      rowExists: Boolean(row?.id),
      appointmentId: row?.id ?? null,
      athleteMatchesExpected:
        expectedAthleteId == null
          ? null
          : String(athleteId) === String(expectedAthleteId),
      status: row?.status ?? null,
      startsAtPresent: Boolean(startsAt),
      startsAtFuture: Number.isFinite(startsMs) ? startsMs > Date.now() : null,
      timezone: row.schedule_timezone ?? row.scheduleTimezone ?? null,
      assignmentLinked: Boolean(row.assignment_id ?? row.assignmentId),
    })
  })
}

export const logAthleteRpcCheckpoint = ({
  authUserId = null,
  expectedUserId = null,
  rpcOk = false,
  rawData = null,
  error = null,
  controlAppointmentId = null,
} = {}) => {
  devOnly(() => {
    const parsed = parseAthleteScheduledSessionsRpc(rawData)
    const classified = error ? classifyAthleteAppointmentFetchError(error) : null

    console.info('[athlete-appointments-rpc]', {
      requested: true,
      authenticatedUserPresent: Boolean(authUserId),
      authenticated: Boolean(authUserId),
      authMatchesExpected:
        expectedUserId == null
          ? null
          : String(authUserId) === String(expectedUserId),
      ok: rpcOk,
      rpcOk,
      resultCount: parsed.length,
      containsControlAppointment: controlAppointmentId
        ? parsed.some((row) => String(row?.id) === String(controlAppointmentId))
        : null,
      errorCode: error?.code ?? null,
      errorMessage: error?.message ?? null,
      errorDetails: error?.details ?? null,
      errorHint: error?.hint ?? null,
      errorCategory: classified?.category ?? null,
    })
  })
}

export const logAthleteClientCheckpoint = ({
  fetchStarted = false,
  fetchSucceeded = false,
  resultCount = 0,
  nextAppointmentPresent = false,
  stateStatus = 'idle',
  authSynced = null,
} = {}) => {
  devOnly(() => {
    console.info('[athlete-appointments-client]', {
      fetchStarted,
      fetchSucceeded,
      resultCount,
      nextAppointmentPresent,
      stateStatus,
      authSynced,
    })
  })
}

export const logHomeAppointmentCheckpoint = ({
  appointmentStateReady = false,
  upcomingCount = 0,
  nextAppointmentPresent = false,
  rendered = false,
} = {}) => {
  devOnly(() => {
    console.info('[home-appointment]', {
      appointmentStateReady,
      upcomingCount,
      nextAppointmentPresent,
      rendered,
    })
  })
}

export async function resolveAuthenticatedUserId() {
  if (!supabase) return null

  const { data, error } = await supabase.auth.getSession()
  if (error) return null
  return data?.session?.user?.id ?? null
}

/** DEV manual probe: window.__avarenTraceAthleteAppointments(controlId) */
export async function traceAthleteAppointmentsRpc(controlAppointmentId = null) {
  if (!import.meta.env.DEV || !supabase) return null

  const authUserId = await resolveAuthenticatedUserId()
  const { data, error } = await supabase.rpc('list_athlete_scheduled_sessions')

  logAthleteRpcCheckpoint({
    authUserId,
    rpcOk: !error,
    rawData: data,
    error,
    controlAppointmentId,
  })

  return { authUserId, data, error }
}

export function installAthleteAppointmentDevTrace() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return

  window.__avarenTraceAthleteAppointments = traceAthleteAppointmentsRpc
}
