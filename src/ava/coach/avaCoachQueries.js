import { rankClientAttention } from '../../lib/clientIntelligence'
import { getCoachWeekRange, isDateInWeek } from '../../lib/weeklyReview'
import { AVA_ACTION_IDS } from '../actions/avaActionTypes'
import { buildCoachClientLabel } from './avaCoachClientResolver'
import {
  ATTENTION_REASON_LABELS,
  ATTENTION_REASON_PRIORITY,
  ATTENTION_REASON_TYPES,
  rankCoachAttentionItems,
} from './avaCoachAttention'

export const hasWeeklyAthleteCheckIn = (
  athleteState = null,
  now = new Date(),
) => {
  const weekRange = getCoachWeekRange(now)
  const entries = athleteState?.readiness?.entries ?? []
  return entries.some((entry) =>
    isDateInWeek(entry?.date, weekRange.weekStart, weekRange.weekEnd),
  )
}

const rosterEntriesFromContext = (coachContext = {}) =>
  coachContext.portfolio?.rosterEntries ??
  coachContext.rosterEntries ??
  []

const athleteStateForEntry = (coachContext = {}, entry = {}) =>
  coachContext.athleteStatesById?.[entry.client?.athlete_id] ?? null

export const queryClientsMissingCheckIn = (coachContext = {}, now = new Date()) => {
  const entries = rosterEntriesFromContext(coachContext)
  const missing = entries.filter(
    (entry) => !hasWeeklyAthleteCheckIn(athleteStateForEntry(coachContext, entry), now),
  )

  return {
    actionId: AVA_ACTION_IDS.SHOW_CLIENTS_MISSING_CHECKIN,
    items: missing.map((entry) => ({
      athleteId: entry.client.athlete_id,
      clientName: entry.clientName ?? buildCoachClientLabel(entry.client),
      reason: `${entry.clientName ?? buildCoachClientLabel(entry.client)} hasn't checked in this week.`,
      evidence: 'No readiness check-in logged this week.',
      type: ATTENTION_REASON_TYPES.WEEKLY_CHECKIN_MISSING,
      actions: [
        {
          actionId: AVA_ACTION_IDS.OPEN_CLIENT_PROFILE,
          label: `Open ${entry.clientName ?? 'Client'}`,
          meta: { athleteId: entry.client.athlete_id },
        },
        {
          actionId: AVA_ACTION_IDS.OPEN_WEEKLY_REVIEWS,
          label: 'Open Weekly Review',
          meta: { athleteId: entry.client.athlete_id },
        },
      ],
    })),
    emptyMessage: 'Everyone is checked in this week.',
  }
}

export const queryClientsNeedingAttention = (coachContext = {}, now = new Date()) => {
  const entries = rosterEntriesFromContext(coachContext)
  const attentionItems = []

  entries.forEach((entry) => {
    if (
      !hasWeeklyAthleteCheckIn(athleteStateForEntry(coachContext, entry), now)
    ) {
      attentionItems.push({
        athleteId: entry.client.athlete_id,
        clientName: entry.clientName,
        type: ATTENTION_REASON_TYPES.WEEKLY_CHECKIN_MISSING,
        severity: 'watch',
        reason: `${entry.clientName} hasn't checked in this week.`,
        evidence: 'No readiness check-in logged this week.',
        priority:
          ATTENTION_REASON_PRIORITY[ATTENTION_REASON_TYPES.WEEKLY_CHECKIN_MISSING],
      })
    }

    if (entry.weeklyReviewStatus === 'REVIEW DUE') {
      attentionItems.push({
        athleteId: entry.client.athlete_id,
        clientName: entry.clientName,
        type: ATTENTION_REASON_TYPES.WEEKLY_REVIEW_DUE,
        severity: 'watch',
        reason: `${entry.clientName}'s weekly review is still open.`,
        evidence: 'Coach review not completed for this week.',
        priority:
          ATTENTION_REASON_PRIORITY[ATTENTION_REASON_TYPES.WEEKLY_REVIEW_DUE],
      })
    }

    ;(entry.intelligence?.attention ?? [])
      .filter((item) => item.id !== 'all-clear' && item.id !== 'performance-up')
      .forEach((item) => {
        attentionItems.push({
          athleteId: entry.client.athlete_id,
          clientName: entry.clientName,
          type: item.id,
          severity: item.severity ?? 'watch',
          reason:
            ATTENTION_REASON_LABELS[item.id]?.(entry, item) ??
            `${entry.clientName} — ${item.title}`,
          evidence: item.description ?? item.title,
          priority: ATTENTION_REASON_PRIORITY[item.id] ?? 40,
        })
      })
  })

  const ranked = rankCoachAttentionItems(attentionItems, { limit: 8 })
  const display = ranked.slice(0, 3)

  return {
    actionId: AVA_ACTION_IDS.SHOW_CLIENTS_NEEDING_ATTENTION,
    items: display.map((item) => ({
      ...item,
      actions: [
        {
          actionId: AVA_ACTION_IDS.OPEN_CLIENT_PROFILE,
          label: `Open ${item.clientName}`,
          meta: { athleteId: item.athleteId },
        },
      ],
    })),
    totalCount: ranked.length,
    emptyMessage: 'Nothing urgent stands out right now.',
    viewAllAction:
      ranked.length > display.length
        ? {
            actionId: AVA_ACTION_IDS.OPEN_COACH_HUB,
            label: 'View All',
            meta: { focus: 'attention' },
          }
        : null,
  }
}

export const queryRecoveryConcerns = (coachContext = {}) => {
  const entries = rosterEntriesFromContext(coachContext)
  const items = entries
    .filter((entry) => {
      const readiness = entry.intelligence?.readiness
      return (
        readiness?.available &&
        readiness.trend === 'Below recent baseline'
      )
    })
    .map((entry) => ({
      athleteId: entry.client.athlete_id,
      clientName: entry.clientName,
      reason: `${entry.clientName}'s recent recovery is notably lower than their usual range.`,
      evidence: entry.intelligence.readiness.detail ?? readinessFallback(entry),
      type: ATTENTION_REASON_TYPES.READINESS_LOW,
      actions: [
        {
          actionId: AVA_ACTION_IDS.OPEN_CLIENT_PROFILE,
          label: `Open ${entry.clientName}`,
          meta: { athleteId: entry.client.athlete_id },
        },
      ],
    }))

  return {
    actionId: AVA_ACTION_IDS.SHOW_RECOVERY_CONCERNS,
    items,
    emptyMessage: 'No recovery concerns stand out from recent check-ins.',
  }
}

const readinessFallback = (entry) => {
  const readiness = entry.intelligence?.readiness
  if (!readiness?.available) return 'Readiness data not available.'
  if (readiness.score !== null) {
    return `Latest readiness score: ${readiness.score}.`
  }
  return readiness.status ?? 'Recovery signal available.'
}

export const queryTrainingConcerns = (coachContext = {}, now = new Date()) => {
  const entries = rosterEntriesFromContext(coachContext)
  const items = []

  entries.forEach((entry) => {
    const attention = entry.intelligence?.attention ?? []
    const trainingItems = attention.filter((item) =>
      ['inactive', 'frequency-drop', 'overdue-assignment', 'open-assignment'].includes(
        item.id,
      ),
    )

    trainingItems.forEach((item) => {
      items.push({
        athleteId: entry.client.athlete_id,
        clientName: entry.clientName,
        reason: `${entry.clientName} — ${item.title.toLowerCase()}.`,
        evidence: item.description ?? item.title,
        type: item.id,
        actions: [
          {
            actionId: AVA_ACTION_IDS.OPEN_CLIENT_PROFILE,
            label: `Open ${entry.clientName}`,
            meta: { athleteId: entry.client.athlete_id },
          },
        ],
      })
    })
  })

  return {
    actionId: AVA_ACTION_IDS.SHOW_TRAINING_CONCERNS,
    items,
    emptyMessage: 'No training gaps flagged from recent sessions or assignments.',
  }
}

export const queryNutritionConcerns = (coachContext = {}) => {
  const entries = rosterEntriesFromContext(coachContext)
  const items = entries
    .filter((entry) => {
      const nutrition = entry.intelligence?.nutrition
      return nutrition?.shared && nutrition?.daysLoggedThisWeek !== undefined &&
        nutrition.daysLoggedThisWeek < 3
    })
    .map((entry) => ({
      athleteId: entry.client.athlete_id,
      clientName: entry.clientName,
      reason: `${entry.clientName} has logged fewer than three nutrition days this week.`,
      evidence:
        entry.intelligence.nutrition.detail ??
        'Fewer than three days were logged this week.',
      type: ATTENTION_REASON_TYPES.NUTRITION_LIGHT,
      actions: [
        {
          actionId: AVA_ACTION_IDS.OPEN_CLIENT_PROFILE,
          label: `Open ${entry.clientName}`,
          meta: { athleteId: entry.client.athlete_id },
        },
      ],
    }))

  const sharedCount = entries.filter(
    (entry) => entry.intelligence?.nutrition?.shared,
  ).length

  return {
    actionId: AVA_ACTION_IDS.SHOW_NUTRITION_CONCERNS,
    items,
    emptyMessage:
      sharedCount === 0
        ? 'Nutrition sharing is not available for your roster yet.'
        : 'No nutrition logging concerns stand out this week.',
  }
}

export const queryWeeklyReviews = (coachContext = {}) => {
  const reviewQueue =
    coachContext.portfolio?.reviewQueue ??
    rankClientAttention(rosterEntriesFromContext(coachContext), { limit: 20 })

  const dueEntries = rosterEntriesFromContext(coachContext).filter(
    (entry) => entry.weeklyReviewStatus === 'REVIEW DUE',
  )

  return {
    actionId: AVA_ACTION_IDS.OPEN_WEEKLY_REVIEWS,
    items: dueEntries.map((entry) => ({
      athleteId: entry.client.athlete_id,
      clientName: entry.clientName,
      reason: `${entry.clientName}'s weekly review is still open.`,
      evidence: 'Coach review not completed for this week.',
      actions: [
        {
          actionId: AVA_ACTION_IDS.OPEN_WEEKLY_REVIEWS,
          label: 'Open Weekly Review',
          meta: { athleteId: entry.client.athlete_id },
        },
        {
          actionId: AVA_ACTION_IDS.OPEN_CLIENT_PROFILE,
          label: `Open ${entry.clientName}`,
          meta: { athleteId: entry.client.athlete_id },
        },
      ],
    })),
    emptyMessage: 'All weekly reviews are complete for this week.',
    reviewQueueCount: dueEntries.length,
  }
}

export const buildClientSummaryFacts = ({
  entry = null,
  coachContext = {},
  now = new Date(),
} = {}) => {
  if (!entry) return null

  const athleteState = athleteStateForEntry(coachContext, entry)
  const intelligence = entry.intelligence ?? {}
  const training = intelligence.training ?? {}
  const readiness = intelligence.readiness ?? {}
  const nutrition = intelligence.nutrition ?? {}
  const missingCheckIn = !hasWeeklyAthleteCheckIn(athleteState, now)

  return {
    clientName: entry.clientName,
    athleteId: entry.client?.athlete_id,
    trainingSessionsThisWeek: training.workoutsThisWeek ?? 0,
    trainingLabel: training.label ?? null,
    missingWeeklyCheckIn: missingCheckIn,
    weeklyReviewStatus: entry.weeklyReviewStatus ?? null,
    readinessAvailable: Boolean(readiness.available),
    readinessTrend: readiness.trend ?? null,
    readinessDetail: readiness.detail ?? null,
    nutritionShared: Boolean(nutrition.shared),
    nutritionDaysLogged: nutrition.daysLoggedThisWeek ?? null,
    assignmentStatus: intelligence.assignment?.active?.title ?? null,
    attentionItems: (intelligence.attention ?? [])
      .filter((item) => item.id !== 'all-clear' && item.id !== 'performance-up')
      .map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
      })),
  }
}

export const formatClientSummaryMessage = (facts = {}) => {
  if (!facts?.clientName) {
    return "I couldn't build a summary for that client."
  }

  const parts = []

  if (facts.trainingSessionsThisWeek > 0) {
    parts.push(
      `${facts.clientName} trained ${facts.trainingSessionsThisWeek} time${facts.trainingSessionsThisWeek === 1 ? '' : 's'} this week`,
    )
  } else {
    parts.push(`No completed sessions are recorded for ${facts.clientName} this week`)
  }

  if (facts.missingWeeklyCheckIn) {
    parts.push("hasn't submitted a weekly check-in")
  }

  if (facts.readinessAvailable && facts.readinessTrend === 'Below recent baseline') {
    parts.push('recovery has been lower over recent entries')
  } else if (facts.readinessAvailable && facts.readinessTrend) {
    parts.push(`recovery is ${facts.readinessTrend.toLowerCase()}`)
  }

  if (facts.weeklyReviewStatus === 'REVIEW DUE') {
    parts.push("this week's coach review is still open")
  }

  const lead = parts.join(', ')
  return `${lead.charAt(0).toUpperCase()}${lead.slice(1)}. I'd check in before changing programming.`
}

export const runCoachQuery = (actionId, coachContext = {}, now = new Date()) => {
  switch (actionId) {
    case AVA_ACTION_IDS.SHOW_CLIENTS_NEEDING_ATTENTION:
      return queryClientsNeedingAttention(coachContext, now)
    case AVA_ACTION_IDS.SHOW_CLIENTS_MISSING_CHECKIN:
      return queryClientsMissingCheckIn(coachContext, now)
    case AVA_ACTION_IDS.SHOW_RECOVERY_CONCERNS:
      return queryRecoveryConcerns(coachContext)
    case AVA_ACTION_IDS.SHOW_TRAINING_CONCERNS:
      return queryTrainingConcerns(coachContext, now)
    case AVA_ACTION_IDS.SHOW_NUTRITION_CONCERNS:
      return queryNutritionConcerns(coachContext)
    case AVA_ACTION_IDS.OPEN_WEEKLY_REVIEWS:
      return queryWeeklyReviews(coachContext)
    default:
      return null
  }
}

export const formatCoachQueryMessage = (result = {}) => {
  if (!result?.items?.length) {
    return result.emptyMessage ?? 'Nothing to report right now.'
  }

  if (result.actionId === AVA_ACTION_IDS.SHOW_CLIENTS_NEEDING_ATTENTION) {
    const count = result.totalCount ?? result.items.length
    if (count === 1) {
      return `One client stands out today:\n\n${result.items[0].clientName} — ${result.items[0].reason.replace(/^[^:]+:\s*/, '')}`
    }
    const header = `${Math.min(result.items.length, count)} client${count === 1 ? '' : 's'} stand out today:`
    const lines = result.items.map(
      (item) => `${item.clientName} — ${item.reason.replace(/^[^:]+:\s*/, '')}`,
    )
    return [header, '', ...lines].join('\n')
  }

  if (result.items.length === 1) {
    return result.items[0].reason
  }

  const names = result.items.map((item) => item.clientName)
  if (names.length === 2) {
    return `${names[0]} and ${names[1]} ${result.actionId === AVA_ACTION_IDS.SHOW_CLIENTS_MISSING_CHECKIN ? "haven't checked in this week." : 'need a look.'}`
  }

  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)} ${result.actionId === AVA_ACTION_IDS.SHOW_CLIENTS_MISSING_CHECKIN ? "haven't checked in this week." : 'need a look.'}`
}
