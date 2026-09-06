import { FOLLOWUP_STATUS } from './coachFollowUp'
import { SCHEDULED_SESSION_STATUS } from './coachScheduledSessions'

export const CLIENT_TIMELINE_EVENT = {
  COACHING_BEGAN: 'coaching_began',
  APPOINTMENT: 'appointment',
  APPOINTMENT_COMPLETED: 'appointment_completed',
  APPOINTMENT_MISSED: 'appointment_missed',
  PASS_ADJUSTMENT: 'pass_adjustment',
  WEEKLY_CHECK_IN: 'weekly_check_in',
  COACH_FOLLOW_UP: 'coach_follow_up',
  WORKOUT_COMPLETED: 'workout_completed',
  PROGRESS_MARKER: 'progress_marker',
}

const toTimestamp = (value) => {
  if (!value) return 0
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

export const buildClientTimeline = ({
  client = null,
  appointments = [],
  passLedger = [],
  checkIns = [],
  followUps = [],
  workouts = [],
  progressMarkers = [],
} = {}) => {
  const events = []

  if (client?.started_at ?? client?.startedAt) {
    events.push({
      id: `coaching-began-${client.id ?? 'client'}`,
      type: CLIENT_TIMELINE_EVENT.COACHING_BEGAN,
      at: client.started_at ?? client.startedAt,
      title: 'Coaching began',
      detail: '',
    })
  }

  ;(appointments ?? []).forEach((appointment) => {
    const status = appointment.status
    const type =
      status === SCHEDULED_SESSION_STATUS.COMPLETED
        ? CLIENT_TIMELINE_EVENT.APPOINTMENT_COMPLETED
        : status === SCHEDULED_SESSION_STATUS.MISSED
          ? CLIENT_TIMELINE_EVENT.APPOINTMENT_MISSED
          : CLIENT_TIMELINE_EVENT.APPOINTMENT

    events.push({
      id: `appointment-${appointment.id}`,
      type,
      at:
        appointment.startsAt ??
        (appointment.sessionDate
          ? `${appointment.sessionDate}T${String(appointment.startTime ?? '12:00').slice(0, 5)}:00`
          : null),
      title:
        status === SCHEDULED_SESSION_STATUS.COMPLETED
          ? 'Completed session'
          : status === SCHEDULED_SESSION_STATUS.MISSED
            ? 'Missed session'
            : 'Scheduled session',
      detail: appointment.appointmentType ?? '',
    })
  })

  ;(passLedger ?? []).slice(0, 12).forEach((entry) => {
    events.push({
      id: `pass-${entry.id ?? entry.entryId}`,
      type: CLIENT_TIMELINE_EVENT.PASS_ADJUSTMENT,
      at: entry.createdAt ?? entry.created_at,
      title: 'Pass adjustment',
      detail: entry.entryType ?? entry.entry_type ?? '',
    })
  })

  ;(checkIns ?? []).slice(0, 8).forEach((checkIn) => {
    events.push({
      id: `check-in-${checkIn.id ?? checkIn.weekStart}`,
      type: CLIENT_TIMELINE_EVENT.WEEKLY_CHECK_IN,
      at: checkIn.submittedAt ?? checkIn.submitted_at ?? checkIn.createdAt,
      title: 'Weekly check-in',
      detail: checkIn.summary ?? '',
    })
  })

  ;(followUps ?? []).forEach((followUp) => {
    if (followUp.status === FOLLOWUP_STATUS.RESOLVED) return
    events.push({
      id: `follow-up-${followUp.id}`,
      type: CLIENT_TIMELINE_EVENT.COACH_FOLLOW_UP,
      at: followUp.createdAt,
      title: 'Follow-up opened',
      detail: followUp.summary ?? '',
    })
  })

  ;(workouts ?? []).slice(0, 8).forEach((workout) => {
    events.push({
      id: `workout-${workout.id}`,
      type: CLIENT_TIMELINE_EVENT.WORKOUT_COMPLETED,
      at: workout.finishedAt ?? workout.date,
      title: workout.name ?? 'Workout completed',
      detail: '',
    })
  })

  ;(progressMarkers ?? []).slice(0, 6).forEach((marker) => {
    events.push({
      id: `progress-${marker.id ?? marker.label}`,
      type: CLIENT_TIMELINE_EVENT.PROGRESS_MARKER,
      at: marker.date ?? marker.at,
      title: marker.label ?? 'Progress marker',
      detail: marker.detail ?? '',
    })
  })

  return events
    .filter((event) => event.at)
    .sort((first, second) => toTimestamp(second.at) - toTimestamp(first.at))
}
