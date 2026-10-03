import { resolveAppointmentCoachId } from './appointmentFollowUpIdentity'
import {
  FOLLOWUP_REASON_TYPE,
  FOLLOWUP_SOURCE_TYPE,
  isOpenFollowUp,
} from './coachFollowUp'
import {
  appointmentTypeLabel,
  buildScheduleConflictSummaryFromAppointment,
  formatAppointmentDayTime,
} from './coachingAppointment'
import { RSVP_STATUS } from './sessionRsvp'

export const APPOINTMENT_SCHEDULE_CONFLICT_HANDOFF = {
  TITLE: "CAN'T MAKE IT?",
  LEde:
    "I'll let your coach know you can't make this session. If another time works better, you can suggest it below.",
  SEND_LABEL: 'Send request',
  CANCEL_LABEL: 'Never mind',
  SUCCESS_TITLE: 'Coach notified',
  SUCCESS_BODY: 'Your schedule request was sent for review.',
  ALREADY_SENT_BODY: 'Your coach already has this schedule request on file.',
  REQUEST_NOTE: 'This is a request, not a booking. Your coach will confirm any change.',
  ERROR_BODY: 'Could not send your schedule request. Try again in a moment.',
}

const formatRequestedDate = (value = '') => {
  const match = String(value ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return ''

  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day), 12)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

const formatRequestedTime = (value = '') => {
  const match = String(value ?? '').trim().match(/^(\d{2}):(\d{2})/)
  if (!match) return ''

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return ''

  const date = new Date(2000, 0, 1, hours, minutes)
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export const formatAppointmentReschedulePreference = ({
  preferredDate = '',
  preferredTime = '',
} = {}) => {
  const dateLabel = formatRequestedDate(preferredDate)
  if (!dateLabel) return ''

  const timeLabel = formatRequestedTime(preferredTime)
  return timeLabel ? `${dateLabel} at ${timeLabel}` : dateLabel
}

export const buildAppointmentScheduleConflictProposal = (
  appointment = {},
  rescheduleRequest = {},
) => {
  const coachId = resolveAppointmentCoachId(appointment)
  const baseSummary = buildScheduleConflictSummaryFromAppointment(appointment)
  const preference = formatAppointmentReschedulePreference(rescheduleRequest)

  return {
    reasonType: FOLLOWUP_REASON_TYPE.SCHEDULE_CONFLICT,
    summary: preference
      ? `${baseSummary} Requested another time; prefers ${preference}.`
      : baseSummary,
    sourceType: FOLLOWUP_SOURCE_TYPE.AVA_ATHLETE,
    sessionId: null,
    coachId,
    assignmentId: appointment.assignmentId ?? null,
    scheduledSessionId: appointment.id ?? null,
  }
}

export const formatAppointmentScheduleConflictLine = (appointment = {}) => {
  const when = formatAppointmentDayTime(appointment)
  const coachName = appointment.coachDisplayName ?? 'Coach'
  const sessionType = appointmentTypeLabel(appointment)
  return `${sessionType} with ${coachName}`
}

export const findOpenScheduleConflictFollowUp = (
  followUps = [],
  scheduledSessionId = null,
) => {
  if (!scheduledSessionId) return null

  return (
    (followUps ?? []).find(
      (item) =>
        isOpenFollowUp(item) &&
        item.reasonType === FOLLOWUP_REASON_TYPE.SCHEDULE_CONFLICT &&
        String(item.scheduledSessionId ?? '') === String(scheduledSessionId),
    ) ?? null
  )
}

export const hasOpenScheduleConflictFollowUp = (
  followUps = [],
  scheduledSessionId = null,
) => Boolean(findOpenScheduleConflictFollowUp(followUps, scheduledSessionId))

export async function submitAppointmentScheduleConflict({
  appointment = null,
  existingFollowUps = [],
  rescheduleRequest = {},
  createFollowUp,
  updateRsvp,
} = {}) {
  if (!appointment?.id) {
    return { ok: false, error: 'missing_appointment' }
  }

  if (typeof createFollowUp !== 'function') {
    return { ok: false, error: 'follow_up_unavailable' }
  }

  const existing = findOpenScheduleConflictFollowUp(
    existingFollowUps,
    appointment.id,
  )

  const coachId = resolveAppointmentCoachId(appointment)
  if (!coachId) {
    return { ok: false, error: 'followup_missing_session_coach' }
  }

  let followUp = existing
  if (!existing) {
    const proposal = buildAppointmentScheduleConflictProposal(
      appointment,
      rescheduleRequest,
    )
    followUp = await createFollowUp(proposal)
  }

  let session = appointment

  if (
    typeof updateRsvp === 'function' &&
    appointment.rsvpStatus !== RSVP_STATUS.CANNOT_ATTEND &&
    appointment.status === 'scheduled'
  ) {
    const result = await updateRsvp(appointment.id, RSVP_STATUS.CANNOT_ATTEND)
    if (!result?.ok) {
      return {
        ok: false,
        error: result?.error ?? 'rsvp_failed',
        followUp,
        partial: Boolean(followUp),
      }
    }
    session = result.session ?? session
  }

  return {
    ok: true,
    alreadySent: Boolean(existing),
    followUp,
    session,
  }
}
