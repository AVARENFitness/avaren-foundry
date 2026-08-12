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
  LEde: "I'll let your coach know you can't make this session.",
  SEND_LABEL: 'Send to coach',
  CANCEL_LABEL: 'Never mind',
  SUCCESS_TITLE: 'Coach notified',
  SUCCESS_BODY: 'Your schedule conflict was sent for review.',
  ALREADY_SENT_BODY: 'Your coach already has this schedule conflict on file.',
  ERROR_BODY: 'Could not send your schedule conflict. Try again in a moment.',
}

export const buildAppointmentScheduleConflictProposal = (appointment = {}) => {
  const coachId = resolveAppointmentCoachId(appointment)

  return {
    reasonType: FOLLOWUP_REASON_TYPE.SCHEDULE_CONFLICT,
    summary: buildScheduleConflictSummaryFromAppointment(appointment),
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
    const proposal = buildAppointmentScheduleConflictProposal(appointment)
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
