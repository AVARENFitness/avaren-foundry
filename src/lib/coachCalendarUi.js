import {
  APPOINTMENT_STATUS,
  appointmentEndMs,
  appointmentInstantMs,
  appointmentsOnDate,
  filterActiveAppointments,
  isActiveScheduledAppointment,
  sortAppointmentsByStart,
} from './coachingAppointment'

export const COACH_CALENDAR_VIEW = {
  TODAY: 'today',
  WEEK: 'week',
}

export const appointmentsForCoachDayAgenda = (appointments = [], dayKey = '') =>
  sortAppointmentsByStart(
    (appointments ?? []).filter(
      (item) => String(item.sessionDate ?? '') === String(dayKey),
    ),
  )

export const isPastCoachAppointment = (appointment = {}, now = new Date()) =>
  appointmentEndMs(appointment) < now.getTime()

export const identifyNextCoachAppointment = (
  appointments = [],
  { now = new Date(), dayKey = '' } = {},
) => {
  const upcoming = sortAppointmentsByStart(
    (appointments ?? []).filter((item) => {
      if (!isActiveScheduledAppointment(item)) return false
      if (dayKey && String(item.sessionDate) !== String(dayKey)) return false
      return appointmentInstantMs(item) >= now.getTime()
    }),
  )

  return upcoming[0] ?? null
}

export const countActiveAppointmentsByDay = (appointments = [], dayKeys = []) => {
  const counts = Object.fromEntries(dayKeys.map((key) => [key, 0]))

  filterActiveAppointments(appointments).forEach((item) => {
    const key = String(item.sessionDate ?? '')
    if (Object.prototype.hasOwnProperty.call(counts, key)) {
      counts[key] += 1
    }
  })

  return counts
}

export const buildCoachWeekAgendaDays = (appointments = [], dayKeys = []) =>
  dayKeys.map((date) => ({
    date,
    items: appointmentsForCoachDayAgenda(appointments, date).filter(
      (item) =>
        isActiveScheduledAppointment(item) ||
        item.status === APPOINTMENT_STATUS.CANCELLED,
    ),
    activeCount: appointmentsOnDate(filterActiveAppointments(appointments), date)
      .length,
  }))

export const formatCoachCalendarDayHeading = (dayKey = '') => {
  if (!dayKey) return 'Select a day'

  return new Date(`${dayKey}T12:00:00`).toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

export const formatCoachCalendarWeekHeading = (weekStartKey = '') => {
  if (!weekStartKey) return 'This week'

  const start = new Date(`${weekStartKey}T12:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)

  const startLabel = start.toLocaleDateString([], { month: 'short', day: 'numeric' })
  const endLabel = end.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })

  return `${startLabel} – ${endLabel}`
}

export const coachAppointmentRowStatus = (appointment = {}) => {
  if (appointment.status === APPOINTMENT_STATUS.CANCELLED) return 'Cancelled'
  if (appointment.status === APPOINTMENT_STATUS.MISSED) return 'Missed'
  if (appointment.status === APPOINTMENT_STATUS.COMPLETED) return 'Completed'
  if (
    appointment.rsvpStatus === 'cannot_attend' &&
    appointment.status === APPOINTMENT_STATUS.SCHEDULED
  ) {
    return 'Cannot attend'
  }
  if (
    appointment.rsvpStatus === 'cannot_attend' ||
    appointment.rsvpStatus === 'awaiting_response'
  ) {
    return null
  }

  return null
}
