import { getCoachWeekRange } from './weeklyReview'

export const WEEKLY_CHECK_IN_STATUS = {
  NOT_REQUIRED: 'not_required',
  NOT_DUE: 'not_due',
  DUE: 'due',
  OVERDUE: 'overdue',
  SUBMITTED: 'submitted',
}

export const CURRENT_WEEKLY_CHECK_IN_UI_STATUS = {
  LOADING: 'loading',
  NOT_REQUIRED: 'not_required',
  NOT_DUE: 'not_due',
  DUE: 'due',
  OVERDUE: 'overdue',
  SUBMITTED: 'submitted',
  UNAVAILABLE: 'unavailable',
  ERROR: 'error',
}

export const WEEKLY_CHECK_IN_PAIN = {
  NO_ISSUES: 'no_issues',
  MINOR_ISSUE: 'minor_issue',
  COACH_SHOULD_KNOW: 'coach_should_know',
}

export const WEEKLY_CHECK_IN_STEPS = [
  {
    id: 'training_rating',
    eyebrow: 'WEEKLY CHECK-IN',
    title: 'How did training feel this week?',
    type: 'rating',
    low: 'Rough',
    high: 'Great',
    labels: ['Rough', 'Off', 'Solid', 'Strong', 'Great'],
  },
  {
    id: 'recovery_rating',
    title: 'How has your recovery and energy been?',
    type: 'rating',
    low: 'Poor',
    high: 'Great',
    labels: ['Poor', 'Low', 'Okay', 'Good', 'Great'],
  },
  {
    id: 'nutrition_rating',
    title: 'How did nutrition go this week?',
    type: 'rating',
    low: 'Off track',
    high: 'On point',
    labels: ['Off track', 'Inconsistent', 'Okay', 'Good', 'On point'],
  },
  {
    id: 'pain_or_issue',
    title: 'Any pain, soreness, or issues your coach should know about?',
    type: 'choice',
    choices: [
      { value: WEEKLY_CHECK_IN_PAIN.NO_ISSUES, label: 'No issues' },
      { value: WEEKLY_CHECK_IN_PAIN.MINOR_ISSUE, label: 'Minor issue' },
      {
        value: WEEKLY_CHECK_IN_PAIN.COACH_SHOULD_KNOW,
        label: 'Yes, I want my coach to know',
      },
    ],
    noteField: 'pain_note',
    notePlaceholder: 'Optional short note',
  },
  {
    id: 'weekly_win',
    title: 'What was your biggest win this week?',
    type: 'text',
    optional: true,
    placeholder: 'Optional — a PR, consistency streak, habit, or moment',
  },
  {
    id: 'coach_note',
    title: 'Anything else your coach should know?',
    type: 'text',
    optional: true,
    placeholder: 'Optional',
  },
]

const DAY_MS = 86400000

export const emptyWeeklyCheckInDraft = () => ({
  training_rating: null,
  recovery_rating: null,
  nutrition_rating: null,
  pain_or_issue: WEEKLY_CHECK_IN_PAIN.NO_ISSUES,
  pain_note: '',
  weekly_win: '',
  coach_note: '',
})

export const normalizeWeeklyCheckIn = (row = null) => {
  if (!row) return null

  return {
    id: row.id ?? null,
    athleteId: row.athlete_id ?? row.athleteId ?? null,
    weekStart: row.week_start ?? row.weekStart ?? null,
    weekEnd: row.week_end ?? row.weekEnd ?? null,
    weekKey: row.week_start ?? row.weekStart ?? null,
    submittedAt: row.submitted_at ?? row.submittedAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
    trainingRating: Number(row.training_rating ?? row.trainingRating ?? 0),
    recoveryRating: Number(row.recovery_rating ?? row.recoveryRating ?? 0),
    nutritionRating: Number(row.nutrition_rating ?? row.nutritionRating ?? 0),
    painOrIssue: row.pain_or_issue ?? row.painOrIssue ?? WEEKLY_CHECK_IN_PAIN.NO_ISSUES,
    painNote: row.pain_note ?? row.painNote ?? '',
    weeklyWin: row.weekly_win ?? row.weeklyWin ?? '',
    coachNote: row.coach_note ?? row.coachNote ?? '',
    status: row.status ?? 'submitted',
  }
}

export const isSubmittedWeeklyCheckIn = (record = null, now = new Date()) => {
  if (!record) return false
  const weekRange = getCoachWeekRange(now)
  const normalized = normalizeWeeklyCheckIn(record)
  return (
    normalized?.status === 'submitted' &&
    normalized.weekStart === weekRange.weekStart &&
    normalized.trainingRating >= 1 &&
    normalized.recoveryRating >= 1 &&
    normalized.nutritionRating >= 1
  )
}

const daysIntoCoachWeek = (now = new Date()) => {
  const weekRange = getCoachWeekRange(now)
  const weekStart = new Date(`${weekRange.weekStart}T12:00:00`).getTime()
  const today = new Date(now)
  today.setHours(12, 0, 0, 0)
  return Math.max(0, Math.floor((today.getTime() - weekStart) / DAY_MS))
}

export const getWeeklyCheckInStatus = ({
  hasCoach = false,
  submission = null,
  now = new Date(),
  devForceDue = false,
} = {}) => {
  const weekRange = getCoachWeekRange(now)

  if (!hasCoach) {
    if (devForceDue && import.meta.env?.DEV) {
      const daysIntoWeek = daysIntoCoachWeek(now)
      const overdue = daysIntoWeek >= 4
      return {
        status: overdue
          ? WEEKLY_CHECK_IN_STATUS.OVERDUE
          : WEEKLY_CHECK_IN_STATUS.DUE,
        weekKey: weekRange.weekStart,
        weekRange,
        submitted: false,
        daysIntoWeek,
        devForcedDue: true,
      }
    }

    return {
      status: WEEKLY_CHECK_IN_STATUS.NOT_REQUIRED,
      weekKey: weekRange.weekStart,
      weekRange,
      submitted: false,
    }
  }

  if (isSubmittedWeeklyCheckIn(submission, now)) {
    return {
      status: WEEKLY_CHECK_IN_STATUS.SUBMITTED,
      weekKey: weekRange.weekStart,
      weekRange,
      submitted: true,
      submission: normalizeWeeklyCheckIn(submission),
    }
  }

  const daysIntoWeek = daysIntoCoachWeek(now)
  const overdue = daysIntoWeek >= 4

  return {
    status: overdue
      ? WEEKLY_CHECK_IN_STATUS.OVERDUE
      : WEEKLY_CHECK_IN_STATUS.DUE,
    weekKey: weekRange.weekStart,
    weekRange,
    submitted: false,
    daysIntoWeek,
  }
}

export const isWeeklyCheckInDue = (state = null) => {
  if (!state) return false
  if (typeof state.due === 'boolean') return state.due

  return (
    (state.status === WEEKLY_CHECK_IN_STATUS.DUE ||
      state.status === WEEKLY_CHECK_IN_STATUS.OVERDUE ||
      state.status === CURRENT_WEEKLY_CHECK_IN_UI_STATUS.DUE ||
      state.status === CURRENT_WEEKLY_CHECK_IN_UI_STATUS.OVERDUE) &&
    !state.submitted
  )
}

export const resolveCurrentWeeklyCheckInState = ({
  capability = null,
  status = null,
  loading = false,
  now = new Date(),
} = {}) => {
  const weekRange = getCoachWeekRange(now)
  const weekStart = status?.weekKey ?? weekRange.weekStart
  const weekEnd = status?.weekRange?.weekEnd ?? weekRange.weekEnd
  const submittedAt =
    status?.submission?.submittedAt ?? status?.submission?.submitted_at ?? null

  const base = {
    weekStart,
    weekEnd,
    weekKey: weekStart,
    submittedAt,
    submitted: false,
    due: false,
    loading: false,
  }

  if (loading) {
    return {
      ...base,
      status: CURRENT_WEEKLY_CHECK_IN_UI_STATUS.LOADING,
      loading: true,
    }
  }

  if (
    capability &&
    (capability.schemaAvailable === false ||
      capability.status === 'unavailable')
  ) {
    return {
      ...base,
      status: CURRENT_WEEKLY_CHECK_IN_UI_STATUS.UNAVAILABLE,
    }
  }

  if (
    capability &&
    (capability.status === 'checking' || capability.status === 'unknown') &&
    !status
  ) {
    return {
      ...base,
      status: CURRENT_WEEKLY_CHECK_IN_UI_STATUS.LOADING,
      loading: true,
    }
  }

  if (!status) {
    return {
      ...base,
      status: CURRENT_WEEKLY_CHECK_IN_UI_STATUS.LOADING,
      loading: true,
    }
  }

  if (status.status === WEEKLY_CHECK_IN_STATUS.SUBMITTED || status.submitted) {
    return {
      ...base,
      status: CURRENT_WEEKLY_CHECK_IN_UI_STATUS.SUBMITTED,
      submitted: true,
      submittedAt:
        submittedAt ??
        status?.submission?.updatedAt ??
        status?.submission?.updated_at ??
        null,
    }
  }

  if (status.status === WEEKLY_CHECK_IN_STATUS.NOT_REQUIRED) {
    return {
      ...base,
      status: CURRENT_WEEKLY_CHECK_IN_UI_STATUS.NOT_REQUIRED,
    }
  }

  if (status.status === WEEKLY_CHECK_IN_STATUS.OVERDUE) {
    return {
      ...base,
      status: CURRENT_WEEKLY_CHECK_IN_UI_STATUS.OVERDUE,
      due: true,
    }
  }

  if (status.status === WEEKLY_CHECK_IN_STATUS.DUE) {
    return {
      ...base,
      status: CURRENT_WEEKLY_CHECK_IN_UI_STATUS.DUE,
      due: true,
    }
  }

  return {
    ...base,
    status: CURRENT_WEEKLY_CHECK_IN_UI_STATUS.NOT_DUE,
  }
}

export const getCurrentWeeklyCheckInState = resolveCurrentWeeklyCheckInState

export const sanitizeWeeklyCheckInDraft = (draft = {}) => ({
  training_rating: Number(draft.training_rating ?? draft.trainingRating),
  recovery_rating: Number(draft.recovery_rating ?? draft.recoveryRating),
  nutrition_rating: Number(draft.nutrition_rating ?? draft.nutritionRating),
  pain_or_issue:
    draft.pain_or_issue ??
    draft.painOrIssue ??
    WEEKLY_CHECK_IN_PAIN.NO_ISSUES,
  pain_note: String(draft.pain_note ?? draft.painNote ?? '').trim(),
  weekly_win: String(draft.weekly_win ?? draft.weeklyWin ?? '').trim(),
  coach_note: String(draft.coach_note ?? draft.coachNote ?? '').trim(),
})

export const validateWeeklyCheckInDraft = (draft = {}) => {
  const sanitized = sanitizeWeeklyCheckInDraft(draft)
  const ratings = [
    sanitized.training_rating,
    sanitized.recovery_rating,
    sanitized.nutrition_rating,
  ]

  if (ratings.some((value) => !Number.isFinite(value) || value < 1 || value > 5)) {
    return { ok: false, message: 'Complete each rating before submitting.' }
  }

  if (
    sanitized.pain_or_issue === WEEKLY_CHECK_IN_PAIN.COACH_SHOULD_KNOW &&
    !sanitized.pain_note
  ) {
    return {
      ok: false,
      message: 'Add a short note so your coach knows what to look at.',
    }
  }

  return { ok: true, draft: sanitized }
}

export const formatWeeklyCheckInPainLabel = (value = '') => {
  switch (value) {
    case WEEKLY_CHECK_IN_PAIN.MINOR_ISSUE:
      return 'Minor issue'
    case WEEKLY_CHECK_IN_PAIN.COACH_SHOULD_KNOW:
      return 'Coach should know'
    default:
      return 'No issues'
  }
}

export const formatWeeklyCheckInSummary = (record = null) => {
  const normalized = normalizeWeeklyCheckIn(record)
  if (!normalized) return null

  return {
    training: `${normalized.trainingRating}/5`,
    recovery: `${normalized.recoveryRating}/5`,
    nutrition: `${normalized.nutritionRating}/5`,
    issue: formatWeeklyCheckInPainLabel(normalized.painOrIssue),
    issueDetail: normalized.painNote || null,
    win: normalized.weeklyWin || null,
    coachNote: normalized.coachNote || null,
    submittedAt: normalized.submittedAt,
  }
}

export const athleteCheckInStatusLabel = (status = null) => {
  switch (status) {
    case 'submitted':
      return 'Submitted'
    case 'missing':
      return 'Missing'
    case 'unknown':
      return 'Unknown'
    case 'not_required':
      return 'Not due'
    default:
      return 'Missing'
  }
}
