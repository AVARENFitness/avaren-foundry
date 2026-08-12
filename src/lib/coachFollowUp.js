export const FOLLOWUP_REASON_TYPE = {
  PAIN_OR_DISCOMFORT: 'PAIN_OR_DISCOMFORT',
  SCHEDULE_CONFLICT: 'SCHEDULE_CONFLICT',
  PROGRAM_CHANGE_REQUEST: 'PROGRAM_CHANGE_REQUEST',
  MISSED_TRAINING: 'MISSED_TRAINING',
  RECOVERY_CONCERN: 'RECOVERY_CONCERN',
  ATHLETE_QUESTION: 'ATHLETE_QUESTION',
}

export const FOLLOWUP_STATUS = {
  OPEN: 'open',
  REVIEWED: 'reviewed',
  RESOLVED: 'resolved',
}

export const FOLLOWUP_SOURCE_TYPE = {
  AVA_ATHLETE: 'ava_athlete',
  SESSION_COMPLETE: 'session_complete',
  WEEKLY_CHECKIN: 'weekly_checkin',
}

const ALLOWED_REASONS = new Set(Object.values(FOLLOWUP_REASON_TYPE))
const ALLOWED_STATUSES = new Set(Object.values(FOLLOWUP_STATUS))
const ALLOWED_SOURCES = new Set(Object.values(FOLLOWUP_SOURCE_TYPE))

export const FOLLOWUP_REASON_PRIORITY = {
  [FOLLOWUP_REASON_TYPE.PAIN_OR_DISCOMFORT]: 96,
  [FOLLOWUP_REASON_TYPE.PROGRAM_CHANGE_REQUEST]: 90,
  [FOLLOWUP_REASON_TYPE.RECOVERY_CONCERN]: 78,
  [FOLLOWUP_REASON_TYPE.MISSED_TRAINING]: 72,
  [FOLLOWUP_REASON_TYPE.SCHEDULE_CONFLICT]: 58,
  [FOLLOWUP_REASON_TYPE.ATHLETE_QUESTION]: 48,
}

export const FOLLOWUP_REASON_LABEL = {
  [FOLLOWUP_REASON_TYPE.PAIN_OR_DISCOMFORT]: 'Pain or discomfort',
  [FOLLOWUP_REASON_TYPE.SCHEDULE_CONFLICT]: 'Schedule conflict',
  [FOLLOWUP_REASON_TYPE.PROGRAM_CHANGE_REQUEST]: 'Program change request',
  [FOLLOWUP_REASON_TYPE.MISSED_TRAINING]: 'Missed training',
  [FOLLOWUP_REASON_TYPE.RECOVERY_CONCERN]: 'Recovery concern',
  [FOLLOWUP_REASON_TYPE.ATHLETE_QUESTION]: 'Athlete question',
}

export const normalizeCoachFollowUp = (row = {}) => ({
  id: row.id ?? row.followUpId ?? crypto.randomUUID(),
  coachId: row.coach_id ?? row.coachId ?? null,
  athleteId: row.athlete_id ?? row.athleteId ?? null,
  reasonType: row.reason_type ?? row.reasonType ?? FOLLOWUP_REASON_TYPE.ATHLETE_QUESTION,
  sourceType: row.source_type ?? row.sourceType ?? FOLLOWUP_SOURCE_TYPE.AVA_ATHLETE,
  summary: String(row.summary ?? '').trim(),
  status: row.status ?? FOLLOWUP_STATUS.OPEN,
  sessionId: row.session_id ?? row.sessionId ?? null,
  assignmentId: row.assignment_id ?? row.assignmentId ?? null,
  scheduledSessionId: row.scheduled_session_id ?? row.scheduledSessionId ?? null,
  createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString(),
  reviewedAt: row.reviewed_at ?? row.reviewedAt ?? null,
  resolvedAt: row.resolved_at ?? row.resolvedAt ?? null,
})

export const validateCoachFollowUpInput = ({
  athleteId = null,
  reasonType = null,
  summary = '',
  sourceType = FOLLOWUP_SOURCE_TYPE.AVA_ATHLETE,
} = {}) => {
  if (!athleteId) {
    return { ok: false, reason: 'missing_athlete' }
  }

  if (!ALLOWED_REASONS.has(reasonType)) {
    return { ok: false, reason: 'invalid_reason_type' }
  }

  if (!ALLOWED_SOURCES.has(sourceType)) {
    return { ok: false, reason: 'invalid_source_type' }
  }

  const trimmed = String(summary ?? '').trim()
  if (trimmed.length < 8) {
    return { ok: false, reason: 'summary_too_short' }
  }

  if (trimmed.length > 280) {
    return { ok: false, reason: 'summary_too_long' }
  }

  return { ok: true }
}

const BODY_AREAS = [
  'lower back',
  'shoulder',
  'hamstring',
  'knee',
  'elbow',
  'wrist',
  'ankle',
  'neck',
  'quad',
  'calf',
  'glute',
  'tricep',
  'bicep',
  'hip',
  'back',
]

const capitalize = (value = '') =>
  value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value

export const extractBodyArea = (message = '') => {
  const text = String(message ?? '').toLowerCase()
  for (const area of BODY_AREAS) {
    if (text.includes(area)) return area
  }
  return null
}

export const buildPainFollowUpSummary = ({
  exerciseName = null,
  message = '',
} = {}) => {
  const bodyArea = extractBodyArea(message)
  const exercise = exerciseName ? String(exerciseName).trim() : null

  if (bodyArea && exercise) {
    return `${capitalize(bodyArea)} discomfort during ${exercise}.`
  }
  if (exercise) {
    return `Discomfort during ${exercise}.`
  }
  if (bodyArea) {
    return `${capitalize(bodyArea)} discomfort during training.`
  }
  return 'Pain or discomfort during training.'
}

export const buildScheduleFollowUpSummary = ({ message = '' } = {}) => {
  const text = String(message ?? '').toLowerCase()
  const dayMatch = text.match(
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)\b/,
  )

  if (dayMatch) {
    return `Unable to make ${capitalize(dayMatch[1])} session.`
  }

  return 'Schedule conflict reported.'
}

export const buildAthleteQuestionFollowUpSummary = ({ message = '' } = {}) => {
  const text = String(message ?? '').toLowerCase()

  if (/\b(travel|trip|vacation|away)\b/.test(text)) {
    return 'Travel may affect upcoming training.'
  }

  if (/\b(reschedule|schedule conflict|move my session)\b/.test(text)) {
    return buildScheduleFollowUpSummary({ message })
  }

  return 'Athlete requested coach follow-up.'
}

export const buildFollowUpSummary = ({
  reasonType = FOLLOWUP_REASON_TYPE.ATHLETE_QUESTION,
  exerciseName = null,
  workoutName = null,
  detail = '',
} = {}) => {
  const message = String(detail ?? '').trim()

  if (reasonType === FOLLOWUP_REASON_TYPE.PAIN_OR_DISCOMFORT) {
    return buildPainFollowUpSummary({ exerciseName, message })
  }

  if (reasonType === FOLLOWUP_REASON_TYPE.PROGRAM_CHANGE_REQUEST) {
    if (exerciseName) {
      return `Requested change involving ${exerciseName}.`
    }
    return 'Program change request.'
  }

  if (reasonType === FOLLOWUP_REASON_TYPE.SCHEDULE_CONFLICT) {
    return buildScheduleFollowUpSummary({ message })
  }

  if (reasonType === FOLLOWUP_REASON_TYPE.MISSED_TRAINING) {
    return 'Missed training session.'
  }

  if (reasonType === FOLLOWUP_REASON_TYPE.RECOVERY_CONCERN) {
    return 'Recovery concern reported.'
  }

  if (reasonType === FOLLOWUP_REASON_TYPE.ATHLETE_QUESTION) {
    return buildAthleteQuestionFollowUpSummary({ message })
  }

  if (workoutName) {
    return `Athlete follow-up (${workoutName}).`
  }

  return 'Athlete follow-up.'
}

export const inferFollowUpReason = ({
  message = '',
  isPain = false,
  isProgramChange = false,
  isSchedule = false,
  isMissed = false,
  isRecovery = false,
} = {}) => {
  if (isPain) return FOLLOWUP_REASON_TYPE.PAIN_OR_DISCOMFORT
  if (isProgramChange) return FOLLOWUP_REASON_TYPE.PROGRAM_CHANGE_REQUEST
  if (isSchedule) return FOLLOWUP_REASON_TYPE.SCHEDULE_CONFLICT
  if (isMissed) return FOLLOWUP_REASON_TYPE.MISSED_TRAINING
  if (isRecovery) return FOLLOWUP_REASON_TYPE.RECOVERY_CONCERN
  if (/\b(let my coach know|tell my coach|flag for coach)\b/i.test(message)) {
    return FOLLOWUP_REASON_TYPE.ATHLETE_QUESTION
  }
  return FOLLOWUP_REASON_TYPE.ATHLETE_QUESTION
}

export const isOpenFollowUp = (item = {}) =>
  item?.status === FOLLOWUP_STATUS.OPEN

export const followUpsForAthlete = (items = [], athleteId = null) =>
  (items ?? []).filter((item) => item.athleteId === athleteId)

export const openFollowUpsForCoach = (items = []) =>
  (items ?? []).filter(isOpenFollowUp)

export const canTransitionFollowUpStatus = (from = null, to = null) => {
  if (!ALLOWED_STATUSES.has(to)) return false
  if (from === to) return true
  if (from === FOLLOWUP_STATUS.OPEN && to === FOLLOWUP_STATUS.REVIEWED) return true
  if (from === FOLLOWUP_STATUS.REVIEWED && to === FOLLOWUP_STATUS.RESOLVED) return true
  if (from === FOLLOWUP_STATUS.OPEN && to === FOLLOWUP_STATUS.RESOLVED) return true
  return false
}
