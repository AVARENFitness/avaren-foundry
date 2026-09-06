import { COACH_ATTENTION_CATEGORY } from './coachAttentionTypes'

export const NEXT_BEST_ACTION_SUBJECT = {
  BUSINESS_CLIENT: 'business_client',
  LEAD: 'lead',
}

export const NEXT_BEST_ACTION = {
  OPEN_CLIENT: 'OPEN_CLIENT',
  OPEN_PASSES: 'OPEN_PASSES',
  SCHEDULE: 'SCHEDULE',
  OPEN_LEAD: 'OPEN_LEAD',
  REVIEW_FOLLOW_UP: 'REVIEW_FOLLOW_UP',
  REVIEW_CHECK_IN: 'REVIEW_CHECK_IN',
}

const CATEGORY_TO_ACTION = {
  [COACH_ATTENTION_CATEGORY.NO_NEXT_APPOINTMENT]: NEXT_BEST_ACTION.SCHEDULE,
  [COACH_ATTENTION_CATEGORY.LOW_SESSION_BALANCE]: NEXT_BEST_ACTION.OPEN_PASSES,
  [COACH_ATTENTION_CATEGORY.MISSED_APPOINTMENT]: NEXT_BEST_ACTION.OPEN_CLIENT,
  [COACH_ATTENTION_CATEGORY.CHECK_IN_CONCERN]: NEXT_BEST_ACTION.REVIEW_CHECK_IN,
  [COACH_ATTENTION_CATEGORY.PAIN_OR_DISCOMFORT]:
    NEXT_BEST_ACTION.REVIEW_FOLLOW_UP,
  [COACH_ATTENTION_CATEGORY.PROGRAM_CHANGE_REQUEST]:
    NEXT_BEST_ACTION.REVIEW_FOLLOW_UP,
  [COACH_ATTENTION_CATEGORY.RECOVERY_CONCERN]: NEXT_BEST_ACTION.OPEN_CLIENT,
  [COACH_ATTENTION_CATEGORY.MISSED_TRAINING]: NEXT_BEST_ACTION.OPEN_CLIENT,
  [COACH_ATTENTION_CATEGORY.ATHLETE_QUESTION]:
    NEXT_BEST_ACTION.REVIEW_FOLLOW_UP,
}

export const toNextBestActionFromAttention = ({
  category,
  businessClientId = null,
  athleteId = null,
  priorityTier = 'medium',
} = {}) => {
  if (!category) return null

  return {
    subjectType: NEXT_BEST_ACTION_SUBJECT.BUSINESS_CLIENT,
    subjectId: businessClientId ?? athleteId ?? null,
    businessClientId,
    athleteId,
    reason: category,
    priority: priorityTier,
    action: CATEGORY_TO_ACTION[category] ?? NEXT_BEST_ACTION.OPEN_CLIENT,
  }
}

export const toNextBestActionFromLead = ({
  leadId,
  priority = 'high',
} = {}) => ({
  subjectType: NEXT_BEST_ACTION_SUBJECT.LEAD,
  subjectId: leadId ?? null,
  reason: 'FOLLOW_UP_DUE',
  priority,
  action: NEXT_BEST_ACTION.OPEN_LEAD,
})

export const sortNextBestActions = (actions = []) =>
  [...actions].sort((first, second) => {
    const priorityRank = { critical: 4, high: 3, medium: 2, low: 1 }
    const firstRank = priorityRank[first.priority] ?? 0
    const secondRank = priorityRank[second.priority] ?? 0
    return secondRank - firstRank
  })
