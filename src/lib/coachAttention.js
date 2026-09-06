import { buildCoachClientLabel } from '../ava/coach/avaCoachClientResolver'
import {
  ATTENTION_PRIORITY_TIER,
  ATTENTION_REASON_TYPES,
  buildCoachAttentionQueue,
  computeAttentionPriorityScore,
  mapAttentionQueueToHubItems,
  rankCoachAttentionItems,
  resolvePriorityTier,
} from '../ava/coach/avaCoachAttention'
import {
  isActiveBusinessClient,
  isArchivedBusinessClient,
  resolveRecordBusinessClientId,
} from './coachBusinessClient'
import { FOLLOWUP_REASON_TYPE, isOpenFollowUp } from './coachFollowUp'
import { LOW_PASS_ATTENTION_THRESHOLD } from './coachPassAttention'
import { SCHEDULED_SESSION_STATUS } from './coachScheduledSessions'
import { toNextBestActionFromAttention } from './coachNextBestAction'
import {
  ATTENTION_CATEGORY_ACTION,
  ATTENTION_CATEGORY_LABEL,
  ATTENTION_CATEGORY_PRIORITY,
  COACH_ATTENTION_CATEGORY,
} from './coachAttentionTypes'

export {
  ATTENTION_CATEGORY_ACTION,
  ATTENTION_CATEGORY_LABEL,
  ATTENTION_CATEGORY_PRIORITY,
  COACH_ATTENTION_CATEGORY,
} from './coachAttentionTypes'

const LEGACY_REASON_TO_CATEGORY = {
  [ATTENTION_REASON_TYPES.MISSING_WEEKLY_CHECKIN]:
    COACH_ATTENTION_CATEGORY.CHECK_IN_CONCERN,
  [ATTENTION_REASON_TYPES.LOW_RECOVERY]: COACH_ATTENTION_CATEGORY.RECOVERY_CONCERN,
  [ATTENTION_REASON_TYPES.RECOVERY_DECLINE]:
    COACH_ATTENTION_CATEGORY.RECOVERY_CONCERN,
  [ATTENTION_REASON_TYPES.RECOVERY_CONCERN]:
    COACH_ATTENTION_CATEGORY.RECOVERY_CONCERN,
  [ATTENTION_REASON_TYPES.COACH_FOLLOWUP_NEEDED]:
    COACH_ATTENTION_CATEGORY.ATHLETE_QUESTION,
  [ATTENTION_REASON_TYPES.TRAINING_GAP]: COACH_ATTENTION_CATEGORY.MISSED_TRAINING,
  [ATTENTION_REASON_TYPES.ASSIGNMENT_CONCERN]:
    COACH_ATTENTION_CATEGORY.MISSED_TRAINING,
}

const FOLLOWUP_TO_CATEGORY = {
  [FOLLOWUP_REASON_TYPE.PAIN_OR_DISCOMFORT]:
    COACH_ATTENTION_CATEGORY.PAIN_OR_DISCOMFORT,
  [FOLLOWUP_REASON_TYPE.PROGRAM_CHANGE_REQUEST]:
    COACH_ATTENTION_CATEGORY.PROGRAM_CHANGE_REQUEST,
  [FOLLOWUP_REASON_TYPE.RECOVERY_CONCERN]:
    COACH_ATTENTION_CATEGORY.RECOVERY_CONCERN,
  [FOLLOWUP_REASON_TYPE.MISSED_TRAINING]:
    COACH_ATTENTION_CATEGORY.MISSED_TRAINING,
  [FOLLOWUP_REASON_TYPE.ATHLETE_QUESTION]:
    COACH_ATTENTION_CATEGORY.ATHLETE_QUESTION,
}

const HUB_SEVERITY = {
  high: 'alert',
  medium: 'watch',
  low: 'info',
}

const DEFAULT_ATTENTION_LIMIT = 5

const severityRank = (severity = 'medium') => {
  if (severity === 'high') return 3
  if (severity === 'medium') return 2
  return 1
}

export const mapCategoryToSeverity = (category) => {
  if (
    category === COACH_ATTENTION_CATEGORY.PAIN_OR_DISCOMFORT ||
    category === COACH_ATTENTION_CATEGORY.MISSED_APPOINTMENT
  ) {
    return 'high'
  }
  if (
    category === COACH_ATTENTION_CATEGORY.LOW_SESSION_BALANCE ||
    category === COACH_ATTENTION_CATEGORY.NO_NEXT_APPOINTMENT ||
    category === COACH_ATTENTION_CATEGORY.RECOVERY_CONCERN
  ) {
    return 'medium'
  }
  return 'low'
}

const buildAttentionItem = ({
  client,
  category,
  description,
  severity = null,
  priorityScore = null,
  businessClientId = null,
  athleteId = null,
} = {}) => {
  const resolvedSeverity = severity ?? mapCategoryToSeverity(category)
  const score =
    priorityScore ??
    ATTENTION_CATEGORY_PRIORITY[category] ??
    50

  return {
    client,
    clientName: buildCoachClientLabel(client) || 'Client',
    businessClientId:
      businessClientId ?? resolveRecordBusinessClientId(client),
    athleteId: athleteId ?? client?.athlete_id ?? null,
    category,
    type: category,
    description,
    item: {
      id: category.toLowerCase(),
      title: ATTENTION_CATEGORY_LABEL[category] ?? category,
      description,
      severity: HUB_SEVERITY[resolvedSeverity] ?? 'watch',
    },
    priority: score,
    priorityScore: score,
    priorityTier: resolvePriorityTier(score),
    actionLabel: ATTENTION_CATEGORY_ACTION[category] ?? 'Open client',
    nextBestAction: toNextBestActionFromAttention({
      category,
      businessClientId:
        businessClientId ?? resolveRecordBusinessClientId(client),
      athleteId: athleteId ?? client?.athlete_id ?? null,
      priorityTier: resolvePriorityTier(score),
    }),
  }
}

const PAIN_DEDUPE_PATTERN = /pain|discomfort|shoulder|knee|hip|back/i

const resolveAttentionDedupeGroup = (item = {}) => {
  const clientKey = item.businessClientId ?? item.athleteId ?? 'unknown'
  const description = String(item.description ?? '')

  if (
    item.category === COACH_ATTENTION_CATEGORY.PAIN_OR_DISCOMFORT ||
    (item.category === COACH_ATTENTION_CATEGORY.CHECK_IN_CONCERN &&
      PAIN_DEDUPE_PATTERN.test(description)) ||
    (item.category === COACH_ATTENTION_CATEGORY.ATHLETE_QUESTION &&
      PAIN_DEDUPE_PATTERN.test(description))
  ) {
    return `pain:${clientKey}`
  }

  if (
    item.category === COACH_ATTENTION_CATEGORY.NO_NEXT_APPOINTMENT ||
    item.category === COACH_ATTENTION_CATEGORY.MISSED_TRAINING
  ) {
    return `schedule-gap:${clientKey}`
  }

  return `${item.category}:${clientKey}`
}

const dedupeAttentionItems = (items = []) => {
  const byDedupeGroup = new Map()

  items.forEach((item) => {
    const key = resolveAttentionDedupeGroup(item)
    const existing = byDedupeGroup.get(key)
    if (
      !existing ||
      (item.priorityScore ?? 0) > (existing.priorityScore ?? 0) ||
      severityRank(item.item?.severity) > severityRank(existing.item?.severity)
    ) {
      byDedupeGroup.set(key, item)
    }
  })

  return [...byDedupeGroup.values()]
}

const mapLegacyQueueEntry = (entry = {}) => {
  const primary = entry.reasons?.[0]
  if (!primary) return null

  const category =
    LEGACY_REASON_TO_CATEGORY[primary.type] ??
    COACH_ATTENTION_CATEGORY.ATHLETE_QUESTION

  return buildAttentionItem({
    client: entry.client,
    category,
    description: primary.evidence ?? primary.label ?? '',
    severity: primary.severity,
    priorityScore: entry.priorityScore,
    athleteId: entry.athleteId,
  })
}

const buildBusinessAttentionItems = ({
  rosterEntries = [],
  upcomingByBusinessClientId = {},
  passSummaryByBusinessClientId = {},
  recentMissedByBusinessClientId = {},
  coachFollowUpsByAthleteId = {},
  now = new Date(),
} = {}) => {
  const items = []
  const todayKey = now.toISOString().slice(0, 10)
  const fourteenDaysAgo = new Date(now)
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

  rosterEntries.forEach((entry) => {
    const client = entry.client
    if (!client || isArchivedBusinessClient(client)) return
    if (!isActiveBusinessClient(client)) return

    const businessClientId = resolveRecordBusinessClientId(client)
    if (!businessClientId) return

    const passSummary = passSummaryByBusinessClientId[businessClientId] ?? null
    const totalBalance = Number(passSummary?.totalBalance ?? 0)
    const activePassCount = Number(passSummary?.activeCount ?? 0)

    if (
      activePassCount > 0 &&
      totalBalance <= LOW_PASS_ATTENTION_THRESHOLD
    ) {
      items.push(
        buildAttentionItem({
          client,
          category: COACH_ATTENTION_CATEGORY.LOW_SESSION_BALANCE,
          description:
            totalBalance <= 0
              ? 'No sessions remaining'
              : `${totalBalance} session${totalBalance === 1 ? '' : 's'} remaining`,
        }),
      )
    }

    const upcoming = upcomingByBusinessClientId[businessClientId] ?? null
    if (!upcoming) {
      items.push(
        buildAttentionItem({
          client,
          category: COACH_ATTENTION_CATEGORY.NO_NEXT_APPOINTMENT,
          description: 'No next session scheduled',
        }),
      )
    }

    const missed = recentMissedByBusinessClientId[businessClientId] ?? null
    if (missed) {
      const missedDate = missed.sessionDate ?? missed.startsAt?.slice(0, 10)
      const missedRecent =
        missedDate &&
        new Date(`${missedDate}T12:00:00`).getTime() >= fourteenDaysAgo.getTime()
      if (missedRecent && missedDate <= todayKey) {
        items.push(
          buildAttentionItem({
            client,
            category: COACH_ATTENTION_CATEGORY.MISSED_APPOINTMENT,
            description: 'Recent missed appointment',
          }),
        )
      }
    }

    const athleteId = client.athlete_id ?? null
    if (athleteId) {
      const openFollowUp = (coachFollowUpsByAthleteId[athleteId] ?? []).find(
        isOpenFollowUp,
      )
      if (openFollowUp?.summary) {
        items.push(
          buildAttentionItem({
            client,
            category:
              FOLLOWUP_TO_CATEGORY[openFollowUp.reasonType] ??
              COACH_ATTENTION_CATEGORY.ATHLETE_QUESTION,
            description: openFollowUp.summary,
            athleteId,
          }),
        )
      }
    }
  })

  return items
}

export const rankCoachAttentionItemsByPriority = (
  items = [],
  { limit = DEFAULT_ATTENTION_LIMIT } = {},
) =>
  rankCoachAttentionItems(items, { limit })

export const getCoachAttentionItems = (
  coachContext = {},
  now = new Date(),
  { limit = DEFAULT_ATTENTION_LIMIT } = {},
) => {
  const rosterEntries =
    coachContext.portfolio?.rosterEntries ??
    coachContext.rosterEntries ??
    []

  const legacyQueue = buildCoachAttentionQueue(coachContext, now)
  const legacyItems = legacyQueue.queue
    .map(mapLegacyQueueEntry)
    .filter(Boolean)

  const businessItems = buildBusinessAttentionItems({
    rosterEntries,
    upcomingByBusinessClientId:
      coachContext.upcomingByBusinessClientId ?? {},
    passSummaryByBusinessClientId:
      coachContext.passSummaryByBusinessClientId ?? {},
    recentMissedByBusinessClientId:
      coachContext.recentMissedByBusinessClientId ?? {},
    coachFollowUpsByAthleteId:
      coachContext.coachFollowUpsByAthleteId ?? {},
    now,
  })

  const ranked = rankCoachAttentionItemsByPriority(
    dedupeAttentionItems([...legacyItems, ...businessItems]),
    { limit },
  )

  return {
    items: ranked,
    hubItems: mapAttentionQueueToHubItems(
      ranked.map((item) => ({
        client: item.client,
        displayName: item.clientName,
        reasons: [
          {
            type: item.category,
            label: item.item.title,
            evidence: item.description,
            severity:
              item.item.severity === 'alert'
                ? 'high'
                : item.item.severity === 'watch'
                  ? 'medium'
                  : 'low',
          },
        ],
        priorityScore: item.priorityScore,
        priorityTier: item.priorityTier,
      })),
    ).slice(0, limit),
    nextBestActions: ranked
      .map((item) => item.nextBestAction)
      .filter(Boolean),
    meta: {
      totalCandidates: legacyItems.length + businessItems.length,
      returnedCount: ranked.length,
      legacyMeta: legacyQueue.meta,
    },
  }
}

export const buildRecentMissedByBusinessClientId = (sessions = []) => {
  const map = {}

  sessions.forEach((session) => {
    if (!session || session.status !== SCHEDULED_SESSION_STATUS.MISSED) return
    const businessClientId =
      session.businessClientId ?? session.business_client_id ?? null
    if (!businessClientId) return

    const current = map[businessClientId]
    const sessionDate =
      session.sessionDate ?? session.startsAt?.slice(0, 10) ?? ''
    const currentDate =
      current?.sessionDate ?? current?.startsAt?.slice(0, 10) ?? ''

    if (!current || String(sessionDate).localeCompare(String(currentDate)) > 0) {
      map[businessClientId] = session
    }
  })

  return map
}

export const buildPassSummaryByBusinessClientId = (
  passAvaContextByBusinessClientId = {},
) =>
  Object.fromEntries(
    Object.entries(passAvaContextByBusinessClientId).map(([id, context]) => [
      id,
      context?.passSummary ?? {
        totalBalance: Number(context?.sessionsRemaining ?? 0),
        activeCount: Number(context?.passSummary?.activeCount ?? 0),
      },
    ]),
  )
