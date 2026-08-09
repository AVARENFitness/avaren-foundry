const normalize = (value = '') =>
  String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

export const DAILY_PLAN_QUERY_PATTERNS = [
  /\bwhat should i do today\b/,
  /\bwhat(?:'s| is) the plan today\b/,
  /\bwhat should i prioritize today\b/,
  /\bwhat matters today\b/,
  /\bwhat(?:'s| is) on today\b/,
  /\bwhat workout do i have today\b/,
]

export const WEEK_PLAN_QUERY_PATTERNS = [
  /\bwhat does my week look like\b/,
  /\bhow should i handle this week\b/,
  /\bwhat(?:'s| is) my week look like\b/,
  /\bhow should this week go\b/,
  /\bwhat would you change\b/,
  /\bcan we make this week lighter\b/,
]

export const ADAPTIVE_PLANNING_PATTERNS = [
  ...DAILY_PLAN_QUERY_PATTERNS,
  ...WEEK_PLAN_QUERY_PATTERNS,
  /\bi only have \d+\s*minutes\b/,
  /\b(?:only have|have) \d+\s*minutes\b/,
  /\bwhat would you do\b/,
  /\bi missed yesterday\b/,
  /\bi missed (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
  /\bi(?:'m| am) traveling\b/,
  /\btraveling (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
  /\bmake it easier\b/,
  /\bshorten (today|this session|the workout)\b/,
  /\bmove (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
  /\bmake it easier\b/,
  /\bmake this easier\b/,
]

export const PLAN_APPLY_PATTERNS = [
  /^apply( it| plan| that| this plan)?\.?$/,
  /^do that\.?$/,
  /^yes,? apply\.?$/,
  /^go ahead\.?$/,
  /^sounds good,? apply\.?$/,
]

export const PLAN_CANCEL_PATTERNS = [
  /^keep (it|current|the plan)( how it is)?\.?$/,
  /^keep current plan\.?$/,
  /^leave it\.?$/,
  /^no,? keep it\.?$/,
  /^don't change it\.?$/,
  /^do not change it\.?$/,
  /^cancel( plan| that)?\.?$/,
]

export const PLAN_UNDO_PATTERNS = [
  /^undo that\.?$/,
  /^undo the plan\.?$/,
  /^revert that\.?$/,
]

export const isDailyPlanQuery = (message = '') => {
  const text = normalize(message)
  return DAILY_PLAN_QUERY_PATTERNS.some((pattern) => pattern.test(text))
}

export const isWeekPlanQuery = (message = '') => {
  const text = normalize(message)
  return WEEK_PLAN_QUERY_PATTERNS.some((pattern) => pattern.test(text))
}

export const isAdaptivePlanningQuery = (message = '') => {
  const text = normalize(message)
  if (!text) return false
  return ADAPTIVE_PLANNING_PATTERNS.some((pattern) => pattern.test(text))
}

export const isPlanApplyCommand = (message = '') => {
  const text = normalize(message)
  return PLAN_APPLY_PATTERNS.some((pattern) => pattern.test(text))
}

export const isPlanCancelCommand = (message = '') => {
  const text = normalize(message)
  return PLAN_CANCEL_PATTERNS.some((pattern) => pattern.test(text))
}

export const isPlanUndoCommand = (message = '') => {
  const text = normalize(message)
  return PLAN_UNDO_PATTERNS.some((pattern) => pattern.test(text))
}

export const resolvePlanningIntent = (message = '', session = null) => {
  const text = normalize(message)

  if (isPlanApplyCommand(text)) {
    return { intent: 'apply_proposal', requiresActiveProposal: true }
  }

  if (isPlanCancelCommand(text)) {
    return { intent: 'cancel_proposal', requiresActiveProposal: Boolean(session?.activePlanProposal) }
  }

  if (isPlanUndoCommand(text)) {
    return { intent: 'undo_plan', requiresActiveProposal: false }
  }

  if (isDailyPlanQuery(text)) {
    return { intent: 'daily_plan', requiresActiveProposal: false }
  }

  if (isWeekPlanQuery(text)) {
    return { intent: 'week_plan', requiresActiveProposal: false }
  }

  if (isAdaptivePlanningQuery(text)) {
    return { intent: 'adaptive_plan', requiresActiveProposal: false }
  }

  if (session?.activePlanProposal && /\bwhy\b/.test(text)) {
    return { intent: 'explain_proposal', requiresActiveProposal: true }
  }

  return null
}

export const shouldRoutePlanningMessage = (message = '', session = null) => {
  const intent = resolvePlanningIntent(message, session)
  if (!intent) return false
  if (intent.requiresActiveProposal && !session?.activePlanProposal) {
    return intent.intent !== 'apply_proposal'
  }
  return true
}
