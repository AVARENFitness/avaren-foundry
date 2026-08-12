import { sessionDateTime } from './coachScheduledSessions'
import { upcomingAppointmentsFromRpc } from './athleteAppointments'
import { addDaysKey, dateKey } from './appointmentScheduling'
import {
  extractAppointmentDateKey,
  formatAppointmentDayTime,
  formatAppointmentHomeWhen,
} from './appointmentWhen'
import {
  formatScheduledSessionDate,
  formatScheduledSessionTime,
} from './sessionTimezone'
import { isRsvpException, RSVP_STATUS } from './sessionRsvp'

export { formatAppointmentDayTime, formatAppointmentHomeWhen } from './appointmentWhen'

export const APPOINTMENT_TYPE = {
  IN_PERSON_TRAINING: 'IN_PERSON_TRAINING',
  CONSULTATION: 'CONSULTATION',
  ASSESSMENT: 'ASSESSMENT',
  CHECK_IN: 'CHECK_IN',
}

export const APPOINTMENT_TYPE_LABEL = {
  [APPOINTMENT_TYPE.IN_PERSON_TRAINING]: 'In-person training',
  [APPOINTMENT_TYPE.CONSULTATION]: 'Consultation',
  [APPOINTMENT_TYPE.ASSESSMENT]: 'Assessment',
  [APPOINTMENT_TYPE.CHECK_IN]: 'Check-in',
}

export const APPOINTMENT_STATUS = {
  SCHEDULED: 'scheduled',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  MISSED: 'missed',
}

export const LOCATION_TYPE = {
  DEFAULT: 'default',
  AVAREN_GYM: 'avaren_gym',
  CLIENT_GYM: 'client_gym',
  OTHER: 'other',
}

export const LOCATION_TYPE_LABEL = {
  [LOCATION_TYPE.DEFAULT]: 'Default location',
  [LOCATION_TYPE.AVAREN_GYM]: 'AVAREN Gym',
  [LOCATION_TYPE.CLIENT_GYM]: 'Client gym',
  [LOCATION_TYPE.OTHER]: 'Other',
}

export const DEFAULT_APPOINTMENT_DURATION_MINUTES = 60

const DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]

const normalize = (value = '') =>
  String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

export const appointmentInstantMs = (appointment = {}) => {
  if (appointment.startsAt) {
    const parsed = new Date(appointment.startsAt).getTime()
    if (Number.isFinite(parsed)) return parsed
  }
  return sessionDateTime(appointment)
}

export const appointmentEndMs = (appointment = {}) => {
  if (appointment.endsAt) {
    const parsed = new Date(appointment.endsAt).getTime()
    if (Number.isFinite(parsed)) return parsed
  }

  const start = appointmentInstantMs(appointment)
  const durationMinutes =
    appointment.durationMinutes ?? DEFAULT_APPOINTMENT_DURATION_MINUTES
  return start + durationMinutes * 60 * 1000
}

export const appointmentRangeMs = (appointment = {}) => ({
  start: appointmentInstantMs(appointment),
  end: appointmentEndMs(appointment),
})

export const isActiveScheduledAppointment = (appointment = {}) =>
  appointment?.status === APPOINTMENT_STATUS.SCHEDULED

export const isHistoricalAppointment = (appointment = {}) =>
  appointment?.status === APPOINTMENT_STATUS.COMPLETED ||
  appointment?.status === APPOINTMENT_STATUS.CANCELLED ||
  appointment?.status === APPOINTMENT_STATUS.MISSED

export const filterActiveAppointments = (appointments = []) =>
  (appointments ?? []).filter(isActiveScheduledAppointment)

export const appointmentsOverlap = (first = {}, second = {}) => {
  if (!isActiveScheduledAppointment(first) || !isActiveScheduledAppointment(second)) {
    return false
  }

  if (first.id && second.id && first.id === second.id) return false
  if (String(first.coachId ?? '') !== String(second.coachId ?? '')) return false

  const a = appointmentRangeMs(first)
  const b = appointmentRangeMs(second)

  if (!a.start || !a.end || !b.start || !b.end) return false

  return a.start < b.end && b.start < a.end
}

export const findOverlappingAppointment = (
  candidate = {},
  existing = [],
  { excludeId = null } = {},
) =>
  (existing ?? []).find((item) => {
    if (excludeId && item.id === excludeId) return false
    return appointmentsOverlap(candidate, item)
  }) ?? null

export const sortAppointmentsByStart = (appointments = []) =>
  [...appointments].sort(
    (first, second) =>
      appointmentInstantMs(first) - appointmentInstantMs(second) ||
      String(first.startTime ?? '').localeCompare(String(second.startTime ?? '')),
  )

export const filterUpcomingAppointments = (
  appointments = [],
  now = new Date(),
) =>
  sortAppointmentsByStart(appointments).filter((item) => {
    if (!isActiveScheduledAppointment(item)) return false
    return appointmentInstantMs(item) >= now.getTime() - 30 * 60 * 1000
  })

export const appointmentsOnDate = (appointments = [], dateKey = '') =>
  sortAppointmentsByStart(
    (appointments ?? []).filter(
      (item) =>
        isActiveScheduledAppointment(item) &&
        String(item.sessionDate) === String(dateKey),
    ),
  )

export const nextUpcomingAppointment = (appointments = [], now = new Date()) =>
  filterUpcomingAppointments(appointments, now)[0] ?? null

export const appointmentTypeLabel = (appointment = {}) =>
  APPOINTMENT_TYPE_LABEL[appointment.appointmentType] ??
  APPOINTMENT_TYPE_LABEL[APPOINTMENT_TYPE.IN_PERSON_TRAINING]

export const locationLabel = (appointment = {}) => {
  const custom = String(appointment.locationName ?? '').trim()
  if (custom) return custom

  return (
    LOCATION_TYPE_LABEL[appointment.locationType] ??
    LOCATION_TYPE_LABEL[LOCATION_TYPE.DEFAULT]
  )
}

export const linkedWorkoutTitle = (appointment = {}) =>
  String(
    appointment.linkedWorkoutTitle ??
      appointment.assignmentTitle ??
      '',
  ).trim() || null

export const APPOINTMENT_STATUS_LABEL = {
  [APPOINTMENT_STATUS.SCHEDULED]: 'Scheduled',
  [APPOINTMENT_STATUS.COMPLETED]: 'Completed',
  [APPOINTMENT_STATUS.CANCELLED]: 'Cancelled',
  [APPOINTMENT_STATUS.MISSED]: 'Missed',
}

export const appointmentStatusLabel = (appointment = {}) =>
  APPOINTMENT_STATUS_LABEL[appointment.status] ??
  APPOINTMENT_STATUS_LABEL[APPOINTMENT_STATUS.SCHEDULED]

export const appointmentLinksToAssignment = (
  appointment = null,
  assignmentId = null,
) =>
  Boolean(
    appointment &&
      assignmentId &&
      appointment.assignmentId &&
      String(appointment.assignmentId) === String(assignmentId),
  )

export const findAppointmentLinkedToAssignment = (
  appointments = [],
  assignmentId = null,
  now = new Date(),
) => {
  if (!assignmentId) return null

  const today = dateKey(now)
  return (
    upcomingAppointmentsFromRpc(appointments).find(
      (item) =>
        item.sessionDate === today &&
        appointmentLinksToAssignment(item, assignmentId),
    ) ?? null
  )
}

export const formatAppointmentDuration = (appointment = {}) => {
  const minutes =
    appointment.durationMinutes ?? DEFAULT_APPOINTMENT_DURATION_MINUTES
  return `${minutes} min`
}

export const formatAppointmentHeadline = (appointment = {}) => {
  const workout = linkedWorkoutTitle(appointment)
  if (workout) return workout
  return appointmentTypeLabel(appointment)
}

export const formatAppointmentWhen = (appointment = {}) => {
  const date = formatScheduledSessionDate(appointment)
  const time = formatScheduledSessionTime(appointment)
  return [date, time].filter(Boolean).join(' · ')
}

export const formatAppointmentRelativeWhen = (appointment = {}, now = new Date()) => {
  const dateKeyValue = extractAppointmentDateKey(appointment)
  const time = formatScheduledSessionTime(appointment)

  if (!dateKeyValue) {
    return time || 'Date unavailable'
  }

  const today = dateKey(now)
  const tomorrow = addDaysKey(today, 1)

  if (dateKeyValue === today) return `today at ${time}`
  if (dateKeyValue === tomorrow) return `tomorrow at ${time}`

  const { year, month, day } = dateKeyValue.split('-').map(Number)
  if (![year, month, day].every(Number.isFinite)) {
    return time || 'Date unavailable'
  }

  const date = new Date(year, month - 1, day)
  if (!Number.isFinite(date.getTime())) {
    return time || 'Date unavailable'
  }

  const dayLabel = date.toLocaleDateString([], { weekday: 'long' })
  return dayLabel.includes('Invalid') ? time || 'Date unavailable' : `${dayLabel} at ${time}`
}

const mentionedDayKey = (message = '', now = new Date()) => {
  const text = normalize(message)
  const today = dateKey(now)

  if (/\btoday\b/.test(text)) return today
  if (/\btomorrow\b/.test(text)) return addDaysKey(today, 1)

  for (let index = 0; index < DAY_NAMES.length; index += 1) {
    if (new RegExp(`\\b${DAY_NAMES[index]}\\b`).test(text)) {
      const nowDate = new Date(`${today}T12:00:00`)
      const currentDay = nowDate.getDay()
      let delta = index - currentDay
      if (delta <= 0) delta += 7
      return addDaysKey(today, delta)
    }
  }

  return null
}

const mentionedTimeToken = (message = '') => {
  const text = normalize(message)
  const match = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/)
  if (!match) return null

  let hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  const meridiem = match[3]

  if (meridiem === 'pm' && hour < 12) hour += 12
  if (meridiem === 'am' && hour === 12) hour = 0

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export const findAppointmentForScheduleConflict = (
  message = '',
  appointments = [],
  now = new Date(),
) => {
  const upcoming = filterUpcomingAppointments(appointments, now)
  if (!upcoming.length) return null

  const dayKey = mentionedDayKey(message, now)
  const timeToken = mentionedTimeToken(message)

  let candidates = upcoming
  if (dayKey) {
    candidates = candidates.filter((item) => item.sessionDate === dayKey)
  }

  if (timeToken) {
    const byTime = candidates.filter((item) =>
      String(item.startTime ?? '').startsWith(timeToken),
    )
    if (byTime.length === 1) return byTime[0]
    if (byTime.length > 1) candidates = byTime
  }

  if (candidates.length === 1) return candidates[0]
  if (dayKey && candidates.length > 0) return candidates[0]

  return nextUpcomingAppointment(upcoming, now)
}

export const buildScheduleConflictSummaryFromAppointment = (appointment = {}) => {
  const when = formatAppointmentDayTime(appointment)
  const workout = linkedWorkoutTitle(appointment)
  if (workout) {
    return `Schedule conflict: ${when} in-person session (${workout}).`
  }
  return `Schedule conflict: ${when} in-person session.`
}

export const mapAppointmentOverlapError = (error = null) => {
  const message = String(error?.message ?? error ?? '')
  if (message.includes('appointment_overlap')) {
    return {
      ok: false,
      error: 'appointment_overlap',
      message: 'This time overlaps another in-person appointment.',
    }
  }
  return null
}

export const groupAppointmentsByDate = (appointments = []) => {
  const groups = new Map()

  sortAppointmentsByStart(appointments).forEach((item) => {
    const key = item.sessionDate ?? 'unknown'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  })

  return [...groups.entries()].map(([date, items]) => ({ date, items }))
}

export const filterAppointmentHistory = (appointments = []) =>
  sortAppointmentsByStart(appointments ?? []).filter(isHistoricalAppointment)

export const summarizeAppointmentHistory = (appointments = []) => {
  const history = filterAppointmentHistory(appointments)
  const active = filterActiveAppointments(appointments)

  return {
    upcoming: active.length,
    completed: history.filter(
      (item) => item.status === APPOINTMENT_STATUS.COMPLETED,
    ).length,
    cancelled: history.filter(
      (item) => item.status === APPOINTMENT_STATUS.CANCELLED,
    ).length,
    missed: history.filter(
      (item) => item.status === APPOINTMENT_STATUS.MISSED,
    ).length,
    total: history.length,
  }
}

export const coachAppointmentCardStatus = (appointment = {}) => {
  if (!isActiveScheduledAppointment(appointment)) {
    return appointmentStatusLabel(appointment)
  }

  return rsvpStatusLabel(appointment) ?? appointmentStatusLabel(appointment)
}

export const rsvpStatusLabel = (appointment = {}) => {
  if (!isActiveScheduledAppointment(appointment)) return null

  if (isRsvpException(appointment)) return 'Needs attention'
  if (appointment.rsvpStatus === RSVP_STATUS.CONFIRMED) return 'Confirmed'
  if (appointment.rsvpStatus === RSVP_STATUS.CANNOT_ATTEND) return 'Cannot attend'
  if (appointment.rsvpStatus === RSVP_STATUS.AWAITING) return 'Awaiting reply'

  return 'Awaiting reply'
}

export const attendanceStatusLabel = (appointment = {}) =>
  appointmentStatusLabel(appointment)

export const endOfWeekKey = (weekStartKey = '') => addDaysKey(weekStartKey, 6)

export const partitionCoachCalendarAppointments = (
  appointments = [],
  { todayKey = '', weekStartKey = '' } = {},
) => {
  const active = filterActiveAppointments(appointments)
  const weekEndKey = endOfWeekKey(weekStartKey)

  const today = appointmentsOnDate(active, todayKey)
  const thisWeek = sortAppointmentsByStart(
    active.filter((item) => {
      const sessionDate = String(item.sessionDate ?? '')
      return sessionDate > todayKey && sessionDate <= weekEndKey
    }),
  )
  const upcoming = sortAppointmentsByStart(
    active.filter((item) => String(item.sessionDate ?? '') > weekEndKey),
  )

  return {
    today,
    thisWeek,
    thisWeekByDay: groupAppointmentsByDate(thisWeek),
    upcoming,
    upcomingByDay: groupAppointmentsByDate(upcoming),
  }
}

export const appointmentsOnSelectedDay = (
  appointments = [],
  selectedDayKey = '',
) => appointmentsOnDate(filterActiveAppointments(appointments), selectedDayKey)

export const formatCoachCalendarEmptyHint = (appointments = [], now = new Date()) => {
  const next = nextUpcomingAppointment(appointments, now)
  if (!next) return null

  const relative = formatAppointmentRelativeWhen(next, now)
  if (!relative) return null

  return `Your next session is ${relative}.`
}
