import { buildCoachClientLabel } from './avaCoachClientResolver'
import {
  ATHLETE_CHECK_IN_STATUS,
  COACH_REVIEW_STATUS,
  hasWeeklyAthleteCheckIn,
  logAvaCheckInDiagnostic,
  resolveCoachReviewStatus,
  summarizeRosterCheckInStatus,
} from './avaCoachCheckIn'

export { hasWeeklyAthleteCheckIn } from './avaCoachCheckIn'

export const ATTENTION_REASON_TYPES = {
  MISSING_WEEKLY_CHECKIN: 'MISSING_WEEKLY_CHECKIN',
  OPEN_COACH_REVIEW: 'OPEN_COACH_REVIEW',
  RECOVERY_CONCERN: 'RECOVERY_CONCERN',
  TRAINING_GAP: 'TRAINING_GAP',
  ASSIGNMENT_CONCERN: 'ASSIGNMENT_CONCERN',
  NUTRITION_CONCERN: 'NUTRITION_CONCERN',
}

/** @deprecated use ATTENTION_REASON_TYPES */
export const ATTENTION_REASON_TYPES_LEGACY = {
  WEEKLY_CHECKIN_MISSING: 'weekly-check-in-missing',
  WEEKLY_REVIEW_DUE: 'weekly-review-due',
  READINESS_LOW: 'readiness-low',
  INACTIVE: 'inactive',
  FREQUENCY_DROP: 'frequency-drop',
  OVERDUE_ASSIGNMENT: 'overdue-assignment',
  OPEN_ASSIGNMENT: 'open-assignment',
  NUTRITION_LIGHT: 'nutrition-light',
}

const LEGACY_ATTENTION_MAP = {
  'readiness-low': ATTENTION_REASON_TYPES.RECOVERY_CONCERN,
  inactive: ATTENTION_REASON_TYPES.TRAINING_GAP,
  'frequency-drop': ATTENTION_REASON_TYPES.TRAINING_GAP,
  'overdue-assignment': ATTENTION_REASON_TYPES.ASSIGNMENT_CONCERN,
  'open-assignment': ATTENTION_REASON_TYPES.ASSIGNMENT_CONCERN,
  'nutrition-light': ATTENTION_REASON_TYPES.NUTRITION_CONCERN,
}

export const REASON_BASE_PRIORITY = {
  [ATTENTION_REASON_TYPES.ASSIGNMENT_CONCERN]: 92,
  [ATTENTION_REASON_TYPES.MISSING_WEEKLY_CHECKIN]: 85,
  [ATTENTION_REASON_TYPES.RECOVERY_CONCERN]: 80,
  [ATTENTION_REASON_TYPES.TRAINING_GAP]: 68,
  [ATTENTION_REASON_TYPES.OPEN_COACH_REVIEW]: 55,
  [ATTENTION_REASON_TYPES.NUTRITION_CONCERN]: 45,
}

export const REASON_SHORT_LABELS = {
  [ATTENTION_REASON_TYPES.MISSING_WEEKLY_CHECKIN]:
    'check-in is still missing',
  [ATTENTION_REASON_TYPES.OPEN_COACH_REVIEW]:
    'your weekly review is still open',
  [ATTENTION_REASON_TYPES.RECOVERY_CONCERN]:
    'recovery has been lower recently',
  [ATTENTION_REASON_TYPES.TRAINING_GAP]:
    'no recent completed session is recorded',
  [ATTENTION_REASON_TYPES.ASSIGNMENT_CONCERN]:
    'assigned work still needs attention',
  [ATTENTION_REASON_TYPES.NUTRITION_CONCERN]:
    'nutrition logging has been light this week',
}

const rosterEntriesFromContext = (coachContext = {}) =>
  coachContext.portfolio?.rosterEntries ??
  coachContext.rosterEntries ??
  []

const severityRank = (severity = 'medium') => {
  if (severity === 'high') return 3
  if (severity === 'medium') return 2
  return 1
}

const buildReason = ({
  type,
  severity = 'medium',
  evidence = '',
  recency = 'current',
} = {}) => ({
  type,
  severity,
  evidence,
  recency,
  label: REASON_SHORT_LABELS[type] ?? evidence,
})

const dedupeReasonsByType = (reasons = []) => {
  const byType = new Map()
  reasons.forEach((reason) => {
    const existing = byType.get(reason.type)
    if (
      !existing ||
      severityRank(reason.severity) > severityRank(existing.severity)
    ) {
      byType.set(reason.type, reason)
    }
  })
  return [...byType.values()]
}

export const computeAttentionPriorityScore = (reasons = []) => {
  if (!reasons.length) return 0

  let score = Math.max(
    ...reasons.map((reason) => REASON_BASE_PRIORITY[reason.type] ?? 40),
  )

  const types = new Set(reasons.map((reason) => reason.type))
  if (
    types.has(ATTENTION_REASON_TYPES.MISSING_WEEKLY_CHECKIN) &&
    types.has(ATTENTION_REASON_TYPES.RECOVERY_CONCERN)
  ) {
    score += 15
  }

  if (reasons.some((reason) => reason.severity === 'high')) {
    score += 8
  }

  if (
    types.has(ATTENTION_REASON_TYPES.MISSING_WEEKLY_CHECKIN) &&
    types.has(ATTENTION_REASON_TYPES.OPEN_COACH_REVIEW)
  ) {
    score += 6
  }

  return score
}

const mapLegacyAttentionItem = (item = {}) => {
  const type = LEGACY_ATTENTION_MAP[item.id]
  if (!type) return null

  const severity =
    item.severity === 'alert'
      ? 'high'
      : item.severity === 'watch'
      ? 'medium'
      : 'low'

  return buildReason({
    type,
    severity,
    evidence: item.description ?? item.title ?? '',
    recency: 'recent',
  })
}

export const buildCoachAttentionQueue = (coachContext = {}, now = new Date()) => {
  const entries = rosterEntriesFromContext(coachContext)
  const athleteStatesById = coachContext.athleteStatesById ?? {}
  const weeklyReviewsByAthleteId = coachContext.weeklyReviewsByAthleteId ?? {}
  const portfolioLoaded = Boolean(
    coachContext.portfolioStatus === 'ready' ||
      coachContext.portfolioStatus === 'partial' ||
      coachContext.portfolioLoadedAt ||
      Object.keys(athleteStatesById).length > 0,
  )
  const checkInSummary = summarizeRosterCheckInStatus({
    rosterEntries: entries,
    athleteStatesById,
    weeklyReviewsByAthleteId,
    portfolioLoaded,
    now,
  })

  logAvaCheckInDiagnostic({
    weekKey: checkInSummary.weekKey,
    requiredCount: checkInSummary.requiredCount,
    submittedCount: checkInSummary.submittedCount,
    missingCount: checkInSummary.missingCount,
    unknownCount: checkInSummary.unknownCount,
    source: portfolioLoaded ? 'portfolio' : 'unloaded',
  })

  const checkInByAthleteId = new Map(
    checkInSummary.records.map((record) => [String(record.athleteId), record]),
  )

  let clientsMissingRecoveryData = 0

  const queue = entries
    .map((entry) => {
      const athleteId = entry.client?.athlete_id ?? null
      if (!athleteId) return null

      const displayName =
        buildCoachClientLabel(entry.client) ?? entry.clientName ?? 'Client'
      const intelligence = entry.intelligence ?? {}
      const readiness = intelligence.readiness ?? {}
      const reasons = []
      const checkInRecord = checkInByAthleteId.get(String(athleteId))

      if (
        checkInRecord?.athleteCheckInStatus ===
        ATHLETE_CHECK_IN_STATUS.MISSING
      ) {
        reasons.push(
          buildReason({
            type: ATTENTION_REASON_TYPES.MISSING_WEEKLY_CHECKIN,
            severity: 'high',
            evidence: 'No current-week athlete check-in on record.',
          }),
        )
      }

      const reviewsLoaded = Object.keys(weeklyReviewsByAthleteId).length > 0
      const coachReviewOpen = reviewsLoaded
        ? resolveCoachReviewStatus({
            weeklyReview: weeklyReviewsByAthleteId[athleteId] ?? null,
            now,
          }).coachReviewStatus === COACH_REVIEW_STATUS.OPEN
        : entry.weeklyReviewStatus === 'REVIEW DUE'

      if (coachReviewOpen) {
        reasons.push(
          buildReason({
            type: ATTENTION_REASON_TYPES.OPEN_COACH_REVIEW,
            severity: 'medium',
            evidence: 'Coach review not completed for this week.',
          }),
        )
      }

      if (readiness.available) {
        if (readiness.trend === 'Below recent baseline') {
          reasons.push(
            buildReason({
              type: ATTENTION_REASON_TYPES.RECOVERY_CONCERN,
              severity: 'medium',
              evidence:
                readiness.detail ??
                (readiness.score !== null && readiness.score !== undefined
                  ? `Latest readiness score: ${readiness.score}.`
                  : 'Recent recovery is below their usual range.'),
            }),
          )
        }
      } else {
        clientsMissingRecoveryData += 1
      }

      ;(intelligence.attention ?? []).forEach((item) => {
        if (item.id === 'all-clear' || item.id === 'performance-up') return

        const mapped = mapLegacyAttentionItem(item)
        if (!mapped) return

        if (
          mapped.type === ATTENTION_REASON_TYPES.RECOVERY_CONCERN &&
          reasons.some(
            (reason) => reason.type === ATTENTION_REASON_TYPES.RECOVERY_CONCERN,
          )
        ) {
          return
        }

        if (mapped.type === ATTENTION_REASON_TYPES.TRAINING_GAP) {
          mapped.evidence = item.description ?? mapped.evidence
          if (item.id === 'inactive') {
            mapped.label = item.description
              ? item.description.toLowerCase()
              : REASON_SHORT_LABELS[ATTENTION_REASON_TYPES.TRAINING_GAP]
          }
          if (item.id === 'frequency-drop') {
            mapped.label = 'training frequency has softened recently'
          }
        }

        if (mapped.type === ATTENTION_REASON_TYPES.ASSIGNMENT_CONCERN) {
          mapped.label = item.title
            ? item.title.toLowerCase()
            : REASON_SHORT_LABELS[ATTENTION_REASON_TYPES.ASSIGNMENT_CONCERN]
          mapped.evidence = item.description ?? mapped.evidence
          if (item.id === 'overdue-assignment') {
            mapped.severity = 'high'
          }
        }

        if (mapped.type === ATTENTION_REASON_TYPES.NUTRITION_CONCERN) {
          const nutrition = intelligence.nutrition ?? {}
          if (!nutrition.shared) return
        }

        reasons.push(mapped)
      })

      const deduped = dedupeReasonsByType(reasons)
      if (!deduped.length) return null

      return {
        athleteId,
        displayName,
        client: entry.client,
        entry,
        reasons: deduped,
        priorityScore: computeAttentionPriorityScore(deduped),
      }
    })
    .filter(Boolean)
    .sort(
      (first, second) =>
        second.priorityScore - first.priorityScore ||
        first.displayName.localeCompare(second.displayName),
    )

  return {
    queue,
    meta: {
      authorizedClientCount: entries.length,
      clientsMissingRecoveryData,
      checkInSummary,
    },
  }
}

export const filterAttentionQueueByReason = (queue = [], reasonType = null) =>
  queue.filter((entry) =>
    entry.reasons.some((reason) => reason.type === reasonType),
  )

export const getAttentionEntryForAthlete = (queue = [], athleteId = null) =>
  queue.find((entry) => String(entry.athleteId) === String(athleteId)) ?? null

export const formatAttentionEntryHeadline = (entry = {}) => {
  const primary = entry.reasons?.[0]
  if (!primary) return entry.displayName ?? 'Client'
  return `${entry.displayName} — ${primary.label}`
}

export const formatAttentionExplanation = (entry = {}) => {
  if (!entry?.reasons?.length) {
    return `Nothing urgent stands out for ${entry?.displayName ?? 'that client'} right now.`
  }

  const parts = entry.reasons.map((reason) => {
    if (reason.type === ATTENTION_REASON_TYPES.OPEN_COACH_REVIEW) {
      return 'your weekly review is still open'
    }
    if (reason.type === ATTENTION_REASON_TYPES.MISSING_WEEKLY_CHECKIN) {
      return 'their weekly check-in is still missing'
    }
    return reason.label
  })

  if (parts.length === 1) {
    return `${entry.displayName}'s ${parts[0]}.`
  }

  const last = parts.pop()
  return `${entry.displayName}'s ${parts.join(', ')}, and ${last}.`
}

export const formatPartialDataNote = (meta = {}) => {
  const count = meta.clientsMissingRecoveryData ?? 0
  if (count <= 0) return ''
  const noun = count === 1 ? 'client' : 'clients'
  return `Recovery data isn't available for ${count} ${noun}.`
}

export const rankCoachAttentionItems = (items = [], { limit = 5 } = {}) =>
  [...items]
    .sort(
      (first, second) =>
        (second.priority ?? second.priorityScore ?? 0) -
          (first.priority ?? first.priorityScore ?? 0) ||
        String(first.clientName ?? first.displayName ?? '').localeCompare(
          String(second.clientName ?? second.displayName ?? ''),
        ),
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
