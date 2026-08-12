import {
  isActiveScheduledAppointment,
  sortAppointmentsByStart,
} from './coachingAppointment'
import { normalizeAthleteScheduledSession } from './coachScheduledSessions'

export const parseAthleteScheduledSessionsRpc = (data) => {
  if (Array.isArray(data)) {
    return data
      .map((entry) => {
        if (typeof entry === 'string') {
          try {
            return JSON.parse(entry)
          } catch {
            return null
          }
        }
        return entry
      })
      .filter(Boolean)
  }
  if (data == null) return []

  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data)
      return parseAthleteScheduledSessionsRpc(parsed)
    } catch {
      return []
    }
  }

  if (typeof data === 'object') {
    if (Array.isArray(data.sessions)) return parseAthleteScheduledSessionsRpc(data.sessions)
    if (Array.isArray(data.appointments)) {
      return parseAthleteScheduledSessionsRpc(data.appointments)
    }

    if (
      'id' in data &&
      ('starts_at' in data || 'startsAt' in data || 'session_date' in data || 'sessionDate' in data)
    ) {
      return [data]
    }

    const values = Object.values(data)
    if (
      values.length > 0 &&
      values.every(
        (entry) =>
          entry &&
          typeof entry === 'object' &&
          ('id' in entry || 'starts_at' in entry || 'startsAt' in entry),
      )
    ) {
      return values
    }
  }

  return []
}

export const APPOINTMENT_FETCH_ERROR = {
  NONE: 'none',
  EMPTY: 'empty',
  RPC_UNAVAILABLE: 'rpc_unavailable',
  NETWORK: 'network',
  AUTHORIZATION: 'authorization',
  BAD_DATA: 'bad_data',
  UNKNOWN: 'unknown',
}

export const classifyAthleteAppointmentFetchError = (error = null) => {
  const message = String(error?.message ?? error ?? '').trim()
  const code = String(error?.code ?? '').trim()
  const lowered = message.toLowerCase()

  if (
    lowered.includes('not installed') ||
    lowered.includes('does not exist') ||
    lowered.includes('could not find the function') ||
    lowered.includes('schema cache') ||
    code === '42883' ||
    code === '42P01' ||
    code === 'PGRST202'
  ) {
    return {
      category: APPOINTMENT_FETCH_ERROR.RPC_UNAVAILABLE,
      message: 'Appointment scheduling is unavailable right now.',
      devMessage: message || 'rpc_unavailable',
    }
  }

  if (
    lowered.includes('auth_user_mismatch') ||
    lowered.includes('not_authenticated') ||
    lowered.includes('jwt') ||
    code === '401' ||
    code === '403' ||
    code === '42501'
  ) {
    return {
      category: APPOINTMENT_FETCH_ERROR.AUTHORIZATION,
      message: 'Sign in again to view your appointment schedule.',
      devMessage: message || 'authorization',
    }
  }

  if (
    lowered.includes('network') ||
    lowered.includes('fetch') ||
    lowered.includes('failed to fetch')
  ) {
    return {
      category: APPOINTMENT_FETCH_ERROR.NETWORK,
      message: "I couldn't load your appointment schedule right now.",
      devMessage: message || 'network',
    }
  }

  return {
    category: APPOINTMENT_FETCH_ERROR.UNKNOWN,
    message: "I couldn't load your appointment schedule right now.",
    devMessage: message || 'unknown',
  }
}

export const athleteAppointmentAvaMessageForError = (error = null) => {
  const classified = error?.category
    ? error
    : classifyAthleteAppointmentFetchError(error)
  return classified.message
}

export const normalizeAthleteAppointmentsFromRpc = (data) =>
  parseAthleteScheduledSessionsRpc(data)
    .map(normalizeAthleteScheduledSession)
    .filter(Boolean)

/** RPC already applies status + starts_at >= now(); avoid double time filtering. */
export const upcomingAppointmentsFromRpc = (appointments = []) =>
  sortAppointmentsByStart(
    (appointments ?? []).filter(isActiveScheduledAppointment),
  )

export const nextUpcomingAppointmentFromRpc = (appointments = []) =>
  upcomingAppointmentsFromRpc(appointments)[0] ?? null

export const logAppointmentReadDiagnostics = (rows = [], { source = 'rpc' } = {}) => {
  if (!import.meta.env.DEV) return

  const now = Date.now()
  const parsed = parseAthleteScheduledSessionsRpc(rows)

  if (!parsed.length) {
    console.info('[appointment-read]', { source, count: 0 })
    return
  }

  parsed.forEach((row) => {
    const startsAt = row.starts_at ?? row.startsAt ?? null
    const startsMs = startsAt ? new Date(startsAt).getTime() : null

    console.info('[appointment-read]', {
      source,
      id: row.id ?? null,
      status: row.status ?? null,
      startsAtPresent: Boolean(startsAt),
      futureRelativeToNow:
        Number.isFinite(startsMs) ? startsMs >= now : null,
      timezone: row.schedule_timezone ?? row.scheduleTimezone ?? null,
      included: true,
    })
  })
}
