import { coachBackend } from '../../lib/coachBackend'
import {
  athleteAppointmentAvaMessageForError,
  classifyAthleteAppointmentFetchError,
  nextUpcomingAppointmentFromRpc,
  normalizeAthleteAppointmentsFromRpc,
  upcomingAppointmentsFromRpc,
} from '../../lib/athleteAppointments'
import {
  findAppointmentLinkedToAssignment,
  formatAppointmentDayTime,
} from '../../lib/coachingAppointment'
import {
  formatAthleteAppointmentMessage,
  formatAthleteAppointmentMessageForDay,
} from './avaCoachAppointmentQueries'
import {
  AVA_PIPELINE_KIND,
  createPipelineOutcome,
} from '../avaPipelineOutcome'

const normalize = (value = '') =>
  String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

import { addDaysKey, dateKey } from '../../lib/appointmentScheduling'

export const isAthleteAppointmentQuery = (message = '') => {
  const text = normalize(message)
  return (
    /\bwhen do i train with my coach\b/.test(text) ||
    /\btrain with my coach\b/.test(text) ||
    /\bwhen is my next in[- ]person session\b/.test(text) ||
    /\bnext in[- ]person session\b/.test(text) ||
    /\bdo i train with my coach tomorrow\b/.test(text) ||
    /\bwhat time is my session\b/.test(text) ||
    /\bwhat time am i training tomorrow\b/.test(text) ||
    /\bdo i have an appointment this week\b/.test(text) ||
    /\bdo i have an in[- ]person session\b/.test(text) ||
    /\bin[- ]person session this week\b/.test(text) ||
    /\bwhat am i doing with my coach\b/.test(text) ||
    /\bnext in[- ]person\b/.test(text) ||
    /\bwhen is my next session with my coach\b/.test(text)
  )
}

const resolveAppointmentMessage = (appointments = [], message = '', now = new Date()) => {
  const text = normalize(message)
  const tomorrow = addDaysKey(dateKey(now), 1)

  if (/\btomorrow\b/.test(text)) {
    return formatAthleteAppointmentMessageForDay(appointments, tomorrow, now)
  }

  if (/\bthis week\b/.test(text)) {
    const upcoming = upcomingAppointmentsFromRpc(appointments)
    if (!upcoming.length) {
      return "You don't have an in-person session scheduled right now."
    }

    const lines = upcoming.slice(0, 4).map((item) => formatAppointmentDayTime(item))
    if (lines.length === 1) {
      return formatAthleteAppointmentMessage(appointments, now)
    }

    return ['Upcoming in-person sessions:', ...lines.map((line) => `• ${line}`)].join('\n')
  }

  return formatAthleteAppointmentMessage(appointments, now)
}

export async function runAthleteAppointmentPipelineStep({
  message,
  packet,
  role = 'athlete',
  now = new Date(),
} = {}) {
  if (role === 'coach') return null
  if (!isAthleteAppointmentQuery(message)) return null

  try {
    const cachedReady = packet?.athleteAppointmentsReady === true
    const cached = packet?.athleteAppointments
    let appointments

    if (cachedReady && Array.isArray(cached)) {
      appointments = normalizeAthleteAppointmentsFromRpc(cached)
    } else {
      appointments = normalizeAthleteAppointmentsFromRpc(
        await coachBackend.listAthleteScheduledSessions(),
      )
    }

    const upcoming = upcomingAppointmentsFromRpc(appointments)
    const copy = resolveAppointmentMessage(appointments, message, now)

    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.RESPONSE,
      message: copy,
      readOnly: true,
      raw: {
        appointments: upcoming,
        nextAppointment: nextUpcomingAppointmentFromRpc(appointments),
      },
    })
  } catch (error) {
    const classified = classifyAthleteAppointmentFetchError(error)

    if (import.meta.env.DEV) {
      console.warn('[appointment-read]', {
        source: 'ava_athlete_appointment_pipeline',
        category: classified.category,
        error: classified.devMessage,
      })
    }

    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.RESPONSE,
      message: athleteAppointmentAvaMessageForError(classified),
      readOnly: true,
      raw: {
        error: classified,
      },
    })
  }
}

export const buildAthleteAppointmentContextLine = (
  appointments = [],
  { assignmentId = null, now = new Date() } = {},
) => {
  if (!assignmentId) return null

  const linked = findAppointmentLinkedToAssignment(
    appointments,
    assignmentId,
    now,
  )
  if (!linked) return null

  const isToday = linked.sessionDate === dateKey(now)
  const prefix = isToday ? 'In person today' : 'In person'
  return `${prefix} · ${formatAppointmentDayTime(linked)}`
}
