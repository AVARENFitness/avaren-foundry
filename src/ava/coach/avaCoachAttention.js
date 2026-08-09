import { buildCoachClientLabel } from './avaCoachClientResolver'
import {
  ATHLETE_CHECK_IN_STATUS,
  COACH_REVIEW_STATUS,
  hasWeeklyAthleteCheckIn,
  logAvaCheckInDiagnostic,
  resolveCoachReviewStatus,
  summarizeRosterCheckInStatus,
} from './avaCoachCheckIn'
import {
  WEEKLY_CHECK_IN_PAIN,
  normalizeWeeklyCheckIn,
} from '../../lib/weeklyCheckIn'

export { hasWeeklyAthleteCheckIn } from './avaCoachCheckIn'

export const ATTENTION_REASON_TYPES = {
  MISSING_WEEKLY_CHECKIN: 'MISSING_WEEKLY_CHECKIN',
  LOW_RECOVERY: 'LOW_RECOVERY',
  RECOVERY_DECLINE: 'RECOVERY_DECLINE',
  RECOVERY_CONCERN: 'RECOVERY_CONCERN',
  COACH_FOLLOWUP_NEEDED: 'COACH_FOLLOWUP_NEEDED',
  TRAINING_GAP: 'TRAINING_GAP',
  OPEN_COACH_REVIEW: 'OPEN_COACH_REVIEW',
  ASSIGNMENT_CONCERN: 'ASSIGNMENT_CONCERN',
  NUTRITION_CONCERN: 'NUTRITION_CONCERN',
}

export const ATTENTION_PRIORITY_TIER = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
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

const RECOVERY_REASON_TYPES = new Set([
  ATTENTION_REASON_TYPES.RECOVERY_CONCERN,
  ATTENTION_REASON_TYPES.LOW_RECOVERY,
  ATTENTION_REASON_TYPES.RECOVERY_DECLINE,
])

const LEGACY_ATTENTION_MAP = {
  'readiness-low': ATTENTION_REASON_TYPES.RECOVERY_DECLINE,
  inactive: ATTENTION_REASON_TYPES.TRAINING_GAP,
  'frequency-drop': ATTENTION_REASON_TYPES.TRAINING_GAP,
  'overdue-assignment': ATTENTION_REASON_TYPES.ASSIGNMENT_CONCERN,
  'open-assignment': ATTENTION_REASON_TYPES.ASSIGNMENT_CONCERN,
  'nutrition-light': ATTENTION_REASON_TYPES.NUTRITION_CONCERN,
}

export const REASON_BASE_PRIORITY = {
  [ATTENTION_REASON_TYPES.RECOVERY_DECLINE]: 95,
  [ATTENTION_REASON_TYPES.LOW_RECOVERY]: 92,
  [ATTENTION_REASON_TYPES.RECOVERY_CONCERN]: 90,
  [ATTENTION_REASON_TYPES.COACH_FOLLOWUP_NEEDED]: 88,
  [ATTENTION_REASON_TYPES.ASSIGNMENT_CONCERN]: 82,
  [ATTENTION_REASON_TYPES.TRAINING_GAP]: 72,
  [ATTENTION_REASON_TYPES.MISSING_WEEKLY_CHECKIN]: 58,
  [ATTENTION_REASON_TYPES.OPEN_COACH_REVIEW]: 50,
  [ATTENTION_REASON_TYPES.NUTRITION_CONCERN]: 40,
}

export const REASON_SHORT_LABELS = {
  [ATTENTION_REASON_TYPES.MISSING_WEEKLY_CHECKIN]:
    'weekly check-in missing',
  [ATTENTION_REASON_TYPES.OPEN_COACH_REVIEW]: 'review still open',
  [ATTENTION_REASON_TYPES.RECOVERY_DECLINE]: 'recovery concern',
  [ATTENTION_REASON_TYPES.LOW_RECOVERY]: 'recovery concern',
  [ATTENTION_REASON_TYPES.RECOVERY_CONCERN]: 'recovery concern',
  [ATTENTION_REASON_TYPES.COACH_FOLLOWUP_NEEDED]:
    'flagged something in their weekly check-in',
  [ATTENTION_REASON_TYPES.TRAINING_GAP]:
    'no recent completed session is recorded',
  [ATTENTION_REASON_TYPES.ASSIGNMENT_CONCERN]:
    'assigned work still needs attention',
  [ATTENTION_REASON_TYPES.NUTRITION_CONCERN]:
    'nutrition logging has been light this week',
}

const HUB_SEVERITY = {
  high: 'alert',
  medium: 'watch',
  low: 'info',
}

const WEEKLY_RECOVERY_RATING_LOW = 2

const rosterEntriesFromContext = (coachContext = {}) =>
  coachContext.portfolio?.rosterEntries ??
  coachContext.rosterEntries ??
  []

const severityRank = (severity = 'medium') => {
  if (severity === 'high') return 3
  if (severity === 'medium') return 2
  return 1
}

export const resolvePriorityTier = (score = 0) => {
  if (score >= 90) return ATTENTION_PRIORITY_TIER.CRITICAL
  if (score >= 75) return ATTENTION_PRIORITY_TIER.HIGH
  if (score >= 55) return ATTENTION_PRIORITY_TIER.MEDIUM
  return ATTENTION_PRIORITY_TIER.LOW
}

export const isRecoveryAttentionReason = (type = null) =>
  RECOVERY_REASON_TYPES.has(type)

export const logAvaCoachAttentionDiagnostic = ({
  authorizedClientCount = 0,
  candidateCount = 0,
  returnedCount = 0,
  topReasonCodes = [],
  dataStatus = 'ready',
} = {}) => {
  if (!import.meta.env?.DEV) return

  console.debug(
    '[ava-coach-attention]',
    JSON.stringify({
      authorizedClientCount,
      candidateCount,
      returnedCount,
      topReasonCodes,
      dataStatus,
    }),
  )
}

const buildReason = ({
  type,
  severity = 'medium',
  evidence = '',
  recency = 'current',
  weekContext = null,
} = {}) => ({
  type,
  severity,
  evidence,
  recency,
  weekContext,
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
    [...types].some((type) => isRecoveryAttentionReason(type))
  ) {
    score += 10
  }

  if (reasons.some((reason) => reason.severity === 'high')) {
    score += 5
  }

  return score
}

const weeklyCheckInSupportingContext = (checkIn = null) => {
  const normalized = normalizeWeeklyCheckIn(checkIn)
  if (!normalized) return null
  if (normalized.recoveryRating <= WEEKLY_RECOVERY_RATING_LOW) {
    return `reported low recovery (${normalized.recoveryRating}/5) in this week's check-in`
  }
  return null
}

const coachFollowupFromCheckIn = (checkIn = null) => {
  const normalized = normalizeWeeklyCheckIn(checkIn)
  if (!normalized) return null
  if (normalized.painOrIssue !== WEEKLY_CHECK_IN_PAIN.COACH_SHOULD_KNOW) {
    return null
  }
  return {
    evidence: normalized.painNote
      ? 'Flagged an issue in this week\'s check-in.'
      : 'Flagged something for you in this week\'s weekly check-in.',
  }
}

const mapLegacyAttentionItem = (item = {}, readiness = {}) => {
  let type = LEGACY_ATTENTION_MAP[item.id]
  if (!type) return null

  if (item.id === 'readiness-low') {
    type =
      readiness.trend === 'Below recent baseline'
        ? ATTENTION_REASON_TYPES.RECOVERY_DECLINE
        : ATTENTION_REASON_TYPES.LOW_RECOVERY
  }

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

export const mapAttentionQueueToHubItems = (queue = []) =>
  queue.map((entry) => {
    const primary = entry.reasons?.[0]
    const isReview =
      primary?.type === ATTENTION_REASON_TYPES.OPEN_COACH_REVIEW

    return {
      client: entry.client,
      clientName: entry.displayName,
      item: {
        id: primary?.type?.toLowerCase().replace(/_/g, '-') ?? 'attention',
        title: primary?.label ?? 'Needs attention',
        description: primary?.evidence ?? primary?.label ?? '',
        severity: HUB_SEVERITY[primary?.severity] ?? 'watch',
      },
      priority: entry.priorityScore,
      priorityTier: entry.priorityTier,
      actionLabel: isReview ? 'Review Client' : 'View Client',
    }
  })

export const buildCoachAttentionQueue = (coachContext = {}, now = new Date()) => {
  const entries = rosterEntriesFromContext(coachContext)
  const athleteStatesById = coachContext.athleteStatesById ?? {}
  const weeklyReviewsByAthleteId = coachContext.weeklyReviewsByAthleteId ?? {}
  const weeklyCheckInsByAthleteId = coachContext.weeklyCheckInsByAthleteId ?? {}
  const portfolioLoaded = Boolean(
    coachContext.portfolioStatus === 'ready' ||
      coachContext.portfolioStatus === 'partial' ||
      coachContext.portfolioLoadedAt ||
      Object.keys(athleteStatesById).length > 0,
  )
  const checkInSummary = summarizeRosterCheckInStatus({
    rosterEntries: entries,
    weeklyCheckInsByAthleteId,
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
      const weeklyCheckIn = weeklyCheckInsByAthleteId[athleteId] ?? null
      const weekContext = checkInSummary.weekKey ?? null

      if (
        checkInRecord?.athleteCheckInStatus ===
        ATHLETE_CHECK_IN_STATUS.MISSING
      ) {
        reasons.push(
          buildReason({
            type: ATTENTION_REASON_TYPES.MISSING_WEEKLY_CHECKIN,
            severity: 'high',
            evidence: 'No current-week weekly check-in submission on record.',
            weekContext,
          }),
        )
      }

      const followup = coachFollowupFromCheckIn(weeklyCheckIn)
      if (followup) {
        reasons.push(
          buildReason({
            type: ATTENTION_REASON_TYPES.COACH_FOLLOWUP_NEEDED,
            severity: 'high',
            evidence: followup.evidence,
            weekContext,
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
            weekContext,
          }),
        )
      }

      if (readiness.available) {
        const supporting = weeklyCheckInSupportingContext(weeklyCheckIn)
        if (readiness.trend === 'Below recent baseline') {
          const baseEvidence =
            readiness.detail ??
            (readiness.score !== null && readiness.score !== undefined
              ? `Latest readiness score: ${readiness.score}.`
              : 'Recent recovery is below their usual range.')
          reasons.push(
            buildReason({
              type: ATTENTION_REASON_TYPES.RECOVERY_DECLINE,
              severity: 'high',
              evidence: supporting
                ? `${baseEvidence} They also ${supporting}.`
                : baseEvidence,
              weekContext,
            }),
          )
        }
      } else {
        clientsMissingRecoveryData += 1
      }

      ;(intelligence.attention ?? []).forEach((item) => {
        if (item.id === 'all-clear' || item.id === 'performance-up') return

        const mapped = mapLegacyAttentionItem(item, readiness)
        if (!mapped) return

        if (
          isRecoveryAttentionReason(mapped.type) &&
          reasons.some((reason) => isRecoveryAttentionReason(reason.type))
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

      const priorityScore = computeAttentionPriorityScore(deduped)

      return {
        athleteId,
        displayName,
        client: entry.client,
        entry,
        reasons: deduped.sort(
          (first, second) =>
            (REASON_BASE_PRIORITY[second.type] ?? 0) -
            (REASON_BASE_PRIORITY[first.type] ?? 0),
        ),
        priorityScore,
        priorityTier: resolvePriorityTier(priorityScore),
      }
    })
    .filter(Boolean)
    .sort(
      (first, second) =>
        second.priorityScore - first.priorityScore ||
        first.displayName.localeCompare(second.displayName),
    )

  const dataStatus = portfolioLoaded
    ? clientsMissingRecoveryData > 0
      ? 'partial'
      : 'ready'
    : 'unloaded'

  logAvaCoachAttentionDiagnostic({
    authorizedClientCount: entries.length,
    candidateCount: queue.length,
    returnedCount: queue.length,
    topReasonCodes: queue
      .slice(0, 5)
      .flatMap((entry) => entry.reasons.slice(0, 1).map((reason) => reason.type)),
    dataStatus,
  })

  return {
    queue,
    meta: {
      authorizedClientCount: entries.length,
      clientsMissingRecoveryData,
      checkInSummary,
      dataStatus,
    },
  }
}

export const filterAttentionQueueByReason = (queue = [], reasonType = null) =>
  queue.filter((entry) =>
    entry.reasons.some((reason) => reason.type === reasonType),
  )

export const filterAttentionQueueByRecovery = (queue = []) =>
  queue.filter((entry) =>
    entry.reasons.some((reason) => isRecoveryAttentionReason(reason.type)),
  )

export const getAttentionEntryForAthlete = (queue = [], athleteId = null) =>
  queue.find((entry) => String(entry.athleteId) === String(athleteId)) ?? null

export const formatAttentionEntryHeadline = (entry = {}) => {
  const primary = entry.reasons?.[0]
  if (!primary) return entry.displayName ?? 'Client'
  return `${entry.displayName} — ${primary.label}`
}

const possessive = (name = 'They') => {
  if (!name || name === 'Client') return 'Their'
  return name.endsWith('s') ? `${name}'` : `${name}'s`
}

export const formatAttentionExplanation = (entry = {}) => {
  if (!entry?.reasons?.length) {
    return `Nothing urgent stands out for ${entry?.displayName ?? 'that client'} right now.`
  }

  const name = entry.displayName ?? 'that client'
  const poss = possessive(name)
  const types = new Set(entry.reasons.map((reason) => reason.type))

  const hasRecoveryDecline =
    types.has(ATTENTION_REASON_TYPES.RECOVERY_DECLINE) ||
    types.has(ATTENTION_REASON_TYPES.LOW_RECOVERY) ||
    types.has(ATTENTION_REASON_TYPES.RECOVERY_CONCERN)
  const hasCoachFollowup = types.has(ATTENTION_REASON_TYPES.COACH_FOLLOWUP_NEEDED)
  const hasMissingCheckIn = types.has(
    ATTENTION_REASON_TYPES.MISSING_WEEKLY_CHECKIN,
  )
  const hasOpenReview = types.has(ATTENTION_REASON_TYPES.OPEN_COACH_REVIEW)

  if (hasRecoveryDecline && hasCoachFollowup) {
    return `${poss} readiness is lower than their recent baseline and they flagged an issue in this week's check-in.`
  }

  if (hasRecoveryDecline) {
    const recoveryReason = entry.reasons.find((reason) =>
      isRecoveryAttentionReason(reason.type),
    )
    if (recoveryReason?.evidence) {
      return `${name}: ${recoveryReason.evidence}`
    }
    return `${poss} readiness is lower than their recent baseline.`
  }

  if (hasCoachFollowup) {
    return `${name} flagged something for you in this week's check-in.`
  }

  if (hasMissingCheckIn && hasOpenReview) {
    return `${poss} weekly check-in is still missing and your weekly review is still open.`
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
    return `${poss} ${parts[0]}.`
  }

  const last = parts.pop()
  return `${poss} ${parts.join(', ')}, and ${last}.`
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
