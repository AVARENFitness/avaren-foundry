export const WEEKLY_REVIEW_DECISIONS = [
  {
    id: 'keep_course',
    label: 'KEEP COURSE',
    description: 'Current approach remains appropriate.',
  },
  {
    id: 'progress',
    label: 'PROGRESS',
    description: 'Client is responding well and may be ready for progression.',
  },
  {
    id: 'manage_load',
    label: 'MANAGE LOAD',
    description: 'Reduce or modify upcoming training demand.',
  },
  {
    id: 'recovery_focus',
    label: 'RECOVERY FOCUS',
    description: 'Center the upcoming week on recovery habits or lower training stress.',
  },
  {
    id: 'follow_up',
    label: 'FOLLOW UP',
    description: 'Direct follow-up before making programming changes.',
  },
]

export const WEEKLY_REVIEW_STATUS = {
  REVIEW_DUE: 'REVIEW DUE',
  REVIEWED: 'REVIEWED',
  READY: 'READY FOR REVIEW',
}

export const getCoachWeekRange = (date = new Date()) => {
  const anchor = new Date(date)
  anchor.setHours(0, 0, 0, 0)
  const day = anchor.getDay()
  const offset = day === 0 ? -6 : 1 - day
  const weekStart = new Date(anchor)
  weekStart.setDate(anchor.getDate() + offset)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)

  return {
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: weekEnd.toISOString().slice(0, 10),
  }
}

export const formatWeekRangeLabel = (weekStart, weekEnd) => {
  if (!weekStart || !weekEnd) return 'This week'

  const start = new Date(`${weekStart}T12:00:00`)
  const end = new Date(`${weekEnd}T12:00:00`)

  const sameMonth = start.getMonth() === end.getMonth()
  const startLabel = start.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })
  const endLabel = end.toLocaleDateString([], {
    month: sameMonth ? undefined : 'short',
    day: 'numeric',
  })

  return `${startLabel} – ${endLabel}`
}

export const isDateInWeek = (value, weekStart, weekEnd) => {
  if (!value || !weekStart || !weekEnd) return false
  const date = String(value).slice(0, 10)
  return date >= weekStart && date <= weekEnd
}

export const normalizeWeeklyReview = (row) => {
  if (!row) return null

  return {
    id: row.id,
    athleteId: row.athlete_id,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    decision: row.decision ?? '',
    observation: row.observation ?? '',
    priorities: Array.isArray(row.priorities) ? row.priorities : [],
    followUpRequired: Boolean(row.follow_up_required),
    followUpNote: row.follow_up_note ?? '',
    snapshot: row.snapshot ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const getWeeklyReviewStatus = ({
  currentReview = null,
  weekRange = getCoachWeekRange(),
  now = new Date(),
} = {}) => {
  const currentWeek = getCoachWeekRange(now)

  if (currentReview && currentReview.weekStart === currentWeek.weekStart) {
    return {
      status: WEEKLY_REVIEW_STATUS.REVIEWED,
      actionLabel: 'Reviewed',
      weekRange: currentWeek,
      review: currentReview,
    }
  }

  if (weekRange.weekStart === currentWeek.weekStart) {
    return {
      status: WEEKLY_REVIEW_STATUS.REVIEW_DUE,
      actionLabel: 'Review This Week',
      weekRange: currentWeek,
      review: null,
    }
  }

  return {
    status: WEEKLY_REVIEW_STATUS.READY,
    actionLabel: 'Review This Week',
    weekRange: currentWeek,
    review: null,
  }
}

export const emptyWeeklyReviewDraft = () => ({
  decision: '',
  observation: '',
  priorities: ['', '', ''],
  followUpRequired: false,
  followUpNote: '',
})

export const weeklyReviewDraftFromRecord = (review) => {
  if (!review) return emptyWeeklyReviewDraft()

  const priorities = [...(review.priorities ?? [])]
  while (priorities.length < 3) priorities.push('')

  return {
    decision: review.decision ?? '',
    observation: review.observation ?? '',
    priorities: priorities.slice(0, 3),
    followUpRequired: Boolean(review.followUpRequired),
    followUpNote: review.followUpNote ?? '',
  }
}

export const sanitizeWeeklyReviewDraft = (draft) => ({
  decision: String(draft?.decision ?? '').trim(),
  observation: String(draft?.observation ?? '').trim(),
  priorities: (draft?.priorities ?? [])
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .slice(0, 3),
  followUpRequired: Boolean(draft?.followUpRequired),
  followUpNote: String(draft?.followUpNote ?? '').trim(),
})
