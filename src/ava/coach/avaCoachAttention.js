export const ATTENTION_REASON_TYPES = {
  WEEKLY_CHECKIN_MISSING: 'weekly-check-in-missing',
  WEEKLY_REVIEW_DUE: 'weekly-review-due',
  READINESS_LOW: 'readiness-low',
  INACTIVE: 'inactive',
  FREQUENCY_DROP: 'frequency-drop',
  OVERDUE_ASSIGNMENT: 'overdue-assignment',
  OPEN_ASSIGNMENT: 'open-assignment',
  NUTRITION_LIGHT: 'nutrition-light',
}

export const ATTENTION_REASON_PRIORITY = {
  [ATTENTION_REASON_TYPES.WEEKLY_CHECKIN_MISSING]: 85,
  inactive: 100,
  'overdue-assignment': 90,
  [ATTENTION_REASON_TYPES.READINESS_LOW]: 80,
  'readiness-low': 80,
  'open-assignment': 70,
  'frequency-drop': 60,
  [ATTENTION_REASON_TYPES.NUTRITION_LIGHT]: 50,
  'nutrition-light': 50,
  [ATTENTION_REASON_TYPES.WEEKLY_REVIEW_DUE]: 30,
  'weekly-review-due': 30,
}

export const ATTENTION_REASON_LABELS = {
  'readiness-low': (entry) =>
    `${entry.clientName}'s recovery has been down recently.`,
  inactive: (entry, item) =>
    `${entry.clientName} — ${item.description ?? 'training gap detected'}.`,
  'frequency-drop': (entry) =>
    `${entry.clientName}'s training frequency has softened.`,
  'overdue-assignment': (entry, item) =>
    `${entry.clientName} — ${item.title.toLowerCase()}.`,
  'open-assignment': (entry, item) =>
    `${entry.clientName} — ${item.title.toLowerCase()}.`,
  'nutrition-light': (entry) =>
    `${entry.clientName} has inconsistent nutrition logging this week.`,
  'weekly-review-due': (entry) =>
    `${entry.clientName}'s weekly review is still open.`,
}

export const rankCoachAttentionItems = (items = [], { limit = 5 } = {}) =>
  [...items]
    .sort(
      (first, second) =>
        (second.priority ?? 0) - (first.priority ?? 0) ||
        String(first.clientName ?? '').localeCompare(String(second.clientName ?? '')),
    )
    .slice(0, limit)

export const dedupeAttentionByClient = (items = []) => {
  const seen = new Set()
  return items.filter((item) => {
    const key = `${item.athleteId}:${item.type}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
