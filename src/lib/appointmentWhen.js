import { addDaysKey, dateKey } from './appointmentScheduling'
import {
  formatScheduledSessionTime,
  resolveCoachScheduleTimezone,
  syncSessionWallClockFromStartsAt,
} from './sessionTimezone'

const DATE_KEY_PATTERN = /^(\d{4}-\d{2}-\d{2})/

export const APPOINTMENT_DATE_UNAVAILABLE = 'Date unavailable'

export const extractAppointmentDateKey = (appointment = {}) => {
  const raw = appointment?.sessionDate ?? appointment?.session_date ?? null
  if (raw != null && String(raw).trim()) {
    const match = String(raw).trim().match(DATE_KEY_PATTERN)
    if (match) return match[1]
  }

  if (appointment?.startsAt) {
    const timeZone = resolveCoachScheduleTimezone(appointment)
    const synced = syncSessionWallClockFromStartsAt(appointment.startsAt, timeZone)
    if (synced.sessionDate) return synced.sessionDate
  }

  return null
}

const formatDateKeyLabel = (dateKeyValue, { weekday = 'short', month = 'short', day = 'numeric' } = {}) => {
  if (!dateKeyValue) return null

  const [year, monthIndex, dayOfMonth] = dateKeyValue.split('-').map(Number)
  if (![year, monthIndex, dayOfMonth].every(Number.isFinite)) return null

  const date = new Date(year, monthIndex - 1, dayOfMonth)
  if (!Number.isFinite(date.getTime())) return null

  const label = date.toLocaleDateString([], { weekday, month, day })
  return label.includes('Invalid') ? null : label
}

export const formatAppointmentDayLabel = (appointment = {}) => {
  const dateKeyValue = extractAppointmentDateKey(appointment)
  const label = formatDateKeyLabel(dateKeyValue, { weekday: 'short' })
  if (label) return label

  if (import.meta.env.DEV) {
    console.warn('[appointment-when]', {
      reason: 'invalid_session_date',
      sessionDate: appointment?.sessionDate ?? appointment?.session_date ?? null,
      startsAt: appointment?.startsAt ?? null,
    })
  }

  return APPOINTMENT_DATE_UNAVAILABLE
}

export const formatAppointmentHomeWhen = (appointment = {}, now = new Date()) => {
  const time = formatScheduledSessionTime(appointment)
  const dateKeyValue = extractAppointmentDateKey(appointment)
  const rawDate = appointment?.sessionDate ?? appointment?.session_date ?? null

  if (!dateKeyValue) {
    if (rawDate && import.meta.env.DEV) {
      console.warn('[appointment-when]', {
        reason: 'invalid_session_date',
        sessionDate: rawDate,
        startsAt: appointment?.startsAt ?? null,
      })
    }

    return time
      ? `${APPOINTMENT_DATE_UNAVAILABLE} · ${time}`
      : APPOINTMENT_DATE_UNAVAILABLE
  }

  const today = dateKey(now)
  const tomorrow = addDaysKey(today, 1)

  if (dateKeyValue === today) return `Today · ${time}`
  if (dateKeyValue === tomorrow) return `Tomorrow · ${time}`

  const dayLabel = formatDateKeyLabel(dateKeyValue, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  return `${dayLabel ?? APPOINTMENT_DATE_UNAVAILABLE} · ${time}`
}

export const formatAppointmentDayTime = (appointment = {}) => {
  const day = formatAppointmentDayLabel(appointment)
  const time = formatScheduledSessionTime(appointment)
  return `${day} · ${time}`
}
