import { coachBackend } from '../../lib/coachBackend'
import {
  appointmentsOnDate,
  filterUpcomingAppointments,
  formatAppointmentDayTime,
  formatAppointmentHeadline,
  formatAppointmentRelativeWhen,
  groupAppointmentsByDate,
  linkedWorkoutTitle,
  nextUpcomingAppointment,
} from '../../lib/coachingAppointment'
import { upcomingAppointmentsFromRpc } from '../../lib/athleteAppointments'
import {
  normalizeScheduledSession,
  sortScheduledSessions,
} from '../../lib/coachScheduledSessions'
import { buildCoachClientLabel } from './avaCoachClientResolver'
import { AVA_ACTION_IDS } from '../actions/avaActionTypes'

import { dateKey, addDaysKey } from '../../lib/appointmentScheduling'

const loadCoachAppointments = async ({ startDate, endDate } = {}) => {
  const rows = await coachBackend.listScheduledSessions({ startDate, endDate })
  return sortScheduledSessions(rows.map(normalizeScheduledSession).filter(Boolean))
}

export const queryCoachTodayAppointments = async (coachContext = {}, now = new Date()) => {
  const today = dateKey(now)
  const sessions = await loadCoachAppointments({ startDate: today, endDate: today })
  const items = appointmentsOnDate(sessions, today).map((session) => {
    const client =
      (coachContext.clients ?? []).find(
        (entry) => String(entry.athlete_id) === String(session.athleteId),
      ) ?? {}
    const clientName = buildCoachClientLabel(client) || 'Client'
    return {
      athleteId: session.athleteId,
      clientName,
      reason: `${formatAppointmentDayTime(session)} · ${formatAppointmentHeadline(session)}`,
      appointment: session,
    }
  })

  return {
    actionId: AVA_ACTION_IDS.SHOW_TODAY_APPOINTMENTS,
    items,
    totalCount: items.length,
    emptyMessage: 'No in-person sessions scheduled for today.',
  }
}

export const queryCoachTomorrowAppointments = async (coachContext = {}, now = new Date()) => {
  const tomorrow = addDaysKey(dateKey(now), 1)
  const sessions = await loadCoachAppointments({
    startDate: tomorrow,
    endDate: tomorrow,
  })
  const items = appointmentsOnDate(sessions, tomorrow).map((session) => {
    const client =
      (coachContext.clients ?? []).find(
        (entry) => String(entry.athlete_id) === String(session.athleteId),
      ) ?? {}
    return {
      athleteId: session.athleteId,
      clientName: buildCoachClientLabel(client) || 'Client',
      reason: formatAppointmentDayTime(session),
      appointment: session,
    }
  })

  return {
    actionId: AVA_ACTION_IDS.SHOW_TODAY_APPOINTMENTS,
    items,
    totalCount: items.length,
    emptyMessage: 'No in-person sessions scheduled for tomorrow.',
  }
}

export const queryCoachNextAppointment = async (_coachContext = {}, now = new Date()) => {
  const start = dateKey(now)
  const end = addDaysKey(start, 14)
  const sessions = await loadCoachAppointments({ startDate: start, endDate: end })
  const next = nextUpcomingAppointment(sessions, now)

  if (!next) {
    return {
      actionId: AVA_ACTION_IDS.OPEN_TODAY_SCHEDULE,
      items: [],
      emptyMessage: 'No upcoming in-person appointments on your calendar.',
    }
  }

  return {
    actionId: AVA_ACTION_IDS.OPEN_TODAY_SCHEDULE,
    items: [
      {
        clientName: formatAppointmentHeadline(next),
        reason: formatAppointmentDayTime(next),
        appointment: next,
      },
    ],
    totalCount: 1,
  }
}

export const queryCoachClientAppointments = async (
  athleteId = null,
  coachContext = {},
  now = new Date(),
) => {
  const client =
    (coachContext.clients ?? []).find(
      (entry) => String(entry.athlete_id) === String(athleteId),
    ) ?? null
  const clientName = buildCoachClientLabel(client) || 'Client'
  const start = dateKey(now)
  const end = addDaysKey(start, 21)
  const sessions = await loadCoachAppointments({ startDate: start, endDate: end, athleteId })
  const upcoming = filterUpcomingAppointments(sessions, now)

  if (!upcoming.length) {
    return {
      actionId: AVA_ACTION_IDS.OPEN_TODAY_SCHEDULE,
      items: [],
      emptyMessage: `No upcoming in-person appointments for ${clientName}.`,
    }
  }

  return {
    actionId: AVA_ACTION_IDS.OPEN_TODAY_SCHEDULE,
    items: upcoming.slice(0, 5).map((session) => ({
      athleteId: session.athleteId,
      clientName,
      reason: `${formatAppointmentDayTime(session)} · ${formatAppointmentHeadline(session)}`,
      appointment: session,
    })),
    totalCount: upcoming.length,
  }
}

export const formatCoachAppointmentMessage = (result = {}) => {
  if (!result?.items?.length) {
    return result.emptyMessage ?? 'No appointments to report.'
  }

  if (result.actionId === AVA_ACTION_IDS.SHOW_TODAY_APPOINTMENTS) {
    if (result.items.length === 1) {
      const item = result.items[0]
      return `${item.clientName} — ${item.reason}`
    }

    const header = `${result.items.length} in-person sessions:`
    const lines = result.items.map((item) => `${item.clientName} — ${item.reason}`)
    return [header, '', ...lines].join('\n')
  }

  const item = result.items[0]
  return `${item.reason}${item.clientName ? ` (${item.clientName})` : ''}`
}

export const formatAthleteAppointmentMessage = (appointments = [], now = new Date()) => {
  const upcoming = upcomingAppointmentsFromRpc(appointments)
  if (!upcoming.length) {
    return "You don't have an in-person session scheduled right now."
  }

  const next = upcoming[0]
  const when = formatAppointmentRelativeWhen(next, now)
  const workout = linkedWorkoutTitle(next)

  if (/\btomorrow\b/.test(when)) {
    if (workout) {
      return `Your next in-person session is tomorrow at ${formatAppointmentDayTime(next).split(' · ').pop()} for ${workout}.`
    }
    return `You train with your coach tomorrow at ${formatAppointmentDayTime(next).split(' · ').pop()}.`
  }

  if (workout) {
    return `Your next in-person session is ${when} for ${workout}.`
  }

  return `You train with your coach ${when}.`
}

export const formatAthleteAppointmentMessageForDay = (
  appointments = [],
  dayKey = '',
  now = new Date(),
) => {
  const dayAppointments = appointmentsOnDate(
    upcomingAppointmentsFromRpc(appointments),
    dayKey,
  )

  if (!dayAppointments.length) {
    return "You don't have an in-person session scheduled that day."
  }

  const next = dayAppointments[0]
  const workout = linkedWorkoutTitle(next)
  const when = formatAppointmentRelativeWhen(next, now)

  if (workout) {
    return `Your in-person session is ${when} for ${workout}.`
  }

  return `You train with your coach ${when}.`
}
