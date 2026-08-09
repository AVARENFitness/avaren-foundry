import { AVA_ACTION_IDS } from '../actions/avaActionTypes'
import { buildCoachClientLabel } from './avaCoachClientResolver'
import {
  ATTENTION_REASON_TYPES,
  buildCoachAttentionQueue,
  filterAttentionQueueByReason,
  filterAttentionQueueByRecovery,
  formatAttentionEntryHeadline,
  formatAttentionExplanation,
  formatPartialDataNote,
  getAttentionEntryForAthlete,
  isRecoveryAttentionReason,
} from './avaCoachAttention'
import {
  ATHLETE_CHECK_IN_STATUS,
  resolveAthleteCheckInStatus,
  summarizeRosterCheckInStatus,
} from './avaCoachCheckIn'
import {
  WEEKLY_CHECK_IN_PAIN,
  normalizeWeeklyCheckIn,
} from '../../lib/weeklyCheckIn'

const DEFAULT_ATTENTION_DISPLAY = 5

const rosterEntriesFromContext = (coachContext = {}) =>
  coachContext.portfolio?.rosterEntries ??
  coachContext.rosterEntries ??
  []

const athleteStateForEntry = (coachContext = {}, entry = {}) =>
  coachContext.athleteStatesById?.[entry.client?.athlete_id] ?? null

const buildClientActions = (entry = {}, { primaryReason = null } = {}) => {
  const actions = [
    {
      actionId: AVA_ACTION_IDS.OPEN_CLIENT_PROFILE,
      label: `Open ${entry.displayName ?? entry.clientName ?? 'Client'}`,
      meta: {
        athleteId: entry.athleteId,
        clientName: entry.displayName ?? entry.clientName,
      },
    },
  ]

  const reasonTypes = new Set(
    (entry.reasons ?? []).map((reason) => reason.type),
  )
  if (
    primaryReason === ATTENTION_REASON_TYPES.OPEN_COACH_REVIEW ||
    reasonTypes.has(ATTENTION_REASON_TYPES.OPEN_COACH_REVIEW)
  ) {
    actions.push({
      actionId: AVA_ACTION_IDS.OPEN_WEEKLY_REVIEWS,
      label: 'Open Review',
      meta: {
        athleteId: entry.athleteId,
        clientName: entry.displayName ?? entry.clientName,
      },
    })
  }

  if (
    primaryReason === ATTENTION_REASON_TYPES.RECOVERY_CONCERN ||
    primaryReason === ATTENTION_REASON_TYPES.RECOVERY_DECLINE ||
    primaryReason === ATTENTION_REASON_TYPES.LOW_RECOVERY ||
    reasonTypes.has(ATTENTION_REASON_TYPES.RECOVERY_CONCERN) ||
    reasonTypes.has(ATTENTION_REASON_TYPES.RECOVERY_DECLINE) ||
    reasonTypes.has(ATTENTION_REASON_TYPES.LOW_RECOVERY)
  ) {
    actions.push({
      actionId: AVA_ACTION_IDS.OPEN_CLIENT_INTELLIGENCE,
      label: 'Open Intelligence',
      meta: {
        athleteId: entry.athleteId,
        clientName: entry.displayName ?? entry.clientName,
      },
    })
  }

  return actions
}

const mapQueueEntryToResultItem = (entry = {}, { primaryReason = null } = {}) => {
  const reason =
    entry.reasons?.find((item) =>
      primaryReason ? item.type === primaryReason : true,
    ) ?? entry.reasons?.[0]

  const displayReason =
    reason?.type === ATTENTION_REASON_TYPES.MISSING_WEEKLY_CHECKIN ||
    primaryReason === ATTENTION_REASON_TYPES.MISSING_WEEKLY_CHECKIN
      ? "hasn't submitted this week's check-in"
      : reason?.type === ATTENTION_REASON_TYPES.OPEN_COACH_REVIEW ||
        primaryReason === ATTENTION_REASON_TYPES.OPEN_COACH_REVIEW
      ? 'review still open'
      : reason?.type === ATTENTION_REASON_TYPES.COACH_FOLLOWUP_NEEDED ||
        primaryReason === ATTENTION_REASON_TYPES.COACH_FOLLOWUP_NEEDED
      ? 'flagged something in their weekly check-in'
      : isRecoveryAttentionReason(primaryReason) ||
        isRecoveryAttentionReason(reason?.type)
      ? 'recovery concern'
      : reason?.type === ATTENTION_REASON_TYPES.TRAINING_GAP ||
        primaryReason === ATTENTION_REASON_TYPES.TRAINING_GAP
      ? reason?.evidence ?? reason?.label ?? 'training gap'
      : reason?.label ?? 'Needs follow-up.'

  return {
    athleteId: entry.athleteId,
    clientName: entry.displayName,
    reason: displayReason,
    evidence: reason?.evidence ?? '',
    type: reason?.type ?? null,
    severity: reason?.severity ?? 'medium',
    priority: entry.priorityScore,
    actions: buildClientActions(entry, { primaryReason }),
  }
}

export { hasWeeklyAthleteCheckIn } from './avaCoachCheckIn'

export const explainClientAttention = (
  athleteId = null,
  coachContext = {},
  now = new Date(),
) => {
  const { queue } = buildCoachAttentionQueue(coachContext, now)
  const entry = getAttentionEntryForAthlete(queue, athleteId)
  if (!entry) {
    const client = (coachContext.clients ?? []).find(
      (item) => String(item.athlete_id) === String(athleteId),
    )
    const name = buildCoachClientLabel(client ?? {})
    return `Nothing urgent stands out for ${name || 'that client'} right now.`
  }
  return formatAttentionExplanation(entry)
}

const buildUnknownCheckInItems = (checkInSummary = {}, coachContext = {}) => {
  const entries = rosterEntriesFromContext(coachContext)
  const entryByAthleteId = new Map(
    entries.map((entry) => [String(entry.client?.athlete_id), entry]),
  )

  return (checkInSummary.unknown ?? []).map((record) => {
    const entry = entryByAthleteId.get(String(record.athleteId)) ?? {}
    const displayName =
      buildCoachClientLabel(entry.client) ?? entry.clientName ?? 'Client'

    return {
      athleteId: record.athleteId,
      clientName: displayName,
      reason: "current-week check-in couldn't be verified yet",
      type: 'CHECKIN_UNKNOWN',
      severity: 'medium',
      actions: buildClientActions(
        {
          athleteId: record.athleteId,
          displayName,
          client: entry.client,
          reasons: [],
        },
        {},
      ),
    }
  })
}

const formatUnknownCheckInNote = (unknownItems = []) => {
  if (!unknownItems.length) return ''

  if (unknownItems.length === 1) {
    return `I can't verify the current-week check-in for ${unknownItems[0].clientName} yet.`
  }

  const names = unknownItems.map((item) => item.clientName)
  if (names.length === 2) {
    return `I can't verify the current-week check-in for ${names[0]} or ${names[1]} yet.`
  }

  return `I can't verify the current-week check-in for ${names.slice(0, -1).join(', ')}, or ${names.at(-1)} yet.`
}

export const queryClientsMissingCheckIn = (coachContext = {}, now = new Date()) => {
  const entries = rosterEntriesFromContext(coachContext)
  const checkInSummary = summarizeRosterCheckInStatus({
    rosterEntries: entries,
    weeklyCheckInsByAthleteId: coachContext.weeklyCheckInsByAthleteId ?? {},
    weeklyReviewsByAthleteId: coachContext.weeklyReviewsByAthleteId ?? {},
    portfolioLoaded: Boolean(
      coachContext.portfolioStatus === 'ready' ||
        coachContext.portfolioStatus === 'partial' ||
        coachContext.portfolioLoadedAt ||
        Object.keys(coachContext.weeklyCheckInsByAthleteId ?? {}).length > 0,
    ),
    now,
  })

  if (!entries.length) {
    return {
      actionId: AVA_ACTION_IDS.SHOW_CLIENTS_MISSING_CHECKIN,
      items: [],
      unknownItems: [],
      confirmedItems: [],
      canClaimAllClear: false,
      emptyMessage:
        "I don't have your client roster loaded yet, so I can't verify check-ins.",
      partialDataNote: '',
    }
  }

  const { queue } = buildCoachAttentionQueue(coachContext, now)
  const missing = filterAttentionQueueByReason(
    queue,
    ATTENTION_REASON_TYPES.MISSING_WEEKLY_CHECKIN,
  )
  const unknownItems = buildUnknownCheckInItems(checkInSummary, coachContext)
  const confirmedItems = (checkInSummary.submitted ?? []).map((record) => {
    const entry = entries.find(
      (item) => String(item.client?.athlete_id) === String(record.athleteId),
    )
    return {
      athleteId: record.athleteId,
      clientName: buildCoachClientLabel(entry?.client) ?? entry?.clientName ?? 'Client',
    }
  })

  const canClaimAllClear = checkInSummary.canClaimAllClear

  return {
    actionId: AVA_ACTION_IDS.SHOW_CLIENTS_MISSING_CHECKIN,
    items: missing.map((entry) => {
      const item = mapQueueEntryToResultItem(entry, {
        primaryReason: ATTENTION_REASON_TYPES.MISSING_WEEKLY_CHECKIN,
      })
      item.actions.push({
        actionId: AVA_ACTION_IDS.OPEN_WEEKLY_REVIEWS,
        label: 'View Reviews',
        meta: {
          athleteId: entry.athleteId,
          clientName: entry.displayName,
        },
      })
      return item
    }),
    unknownItems,
    confirmedItems,
    canClaimAllClear,
    checkInSummary,
    emptyMessage: canClaimAllClear
      ? 'Everyone is checked in this week.'
      : unknownItems.length && !missing.length
      ? formatUnknownCheckInNote(unknownItems)
      : unknownItems.length
      ? formatUnknownCheckInNote(unknownItems)
      : 'Everyone is checked in this week.',
    partialDataNote: formatUnknownCheckInNote(unknownItems),
    viewAllAction:
      missing.length > 1
        ? {
            actionId: AVA_ACTION_IDS.OPEN_COACH_HUB,
            label: 'View Reviews',
            meta: { focus: 'attention', destination: 'coach-clients' },
          }
        : null,
  }
}

export const queryClientsNeedingAttention = (coachContext = {}, now = new Date()) => {
  const { queue, meta } = buildCoachAttentionQueue(coachContext, now)
  const display = queue.slice(0, DEFAULT_ATTENTION_DISPLAY)

  return {
    actionId: AVA_ACTION_IDS.SHOW_CLIENTS_NEEDING_ATTENTION,
    items: display.map((entry) => mapQueueEntryToResultItem(entry)),
    totalCount: queue.length,
    emptyMessage: 'Nothing urgent stands out right now.',
    partialDataNote: formatPartialDataNote(meta),
    viewAllAction:
      queue.length > display.length
        ? {
            actionId: AVA_ACTION_IDS.OPEN_COACH_HUB,
            label: 'View All',
            meta: { focus: 'attention', destination: 'coach-clients' },
          }
        : null,
  }
}

export const queryRecoveryConcerns = (coachContext = {}, now = new Date()) => {
  const { queue, meta } = buildCoachAttentionQueue(coachContext, now)
  const items = filterAttentionQueueByRecovery(queue).map((entry) => {
    const primaryReason =
      entry.reasons.find((reason) => isRecoveryAttentionReason(reason.type))
        ?.type ?? ATTENTION_REASON_TYPES.RECOVERY_DECLINE
    return mapQueueEntryToResultItem(entry, { primaryReason })
  })

  return {
    actionId: AVA_ACTION_IDS.SHOW_RECOVERY_CONCERNS,
    items,
    emptyMessage: 'Nothing concerning stands out in recovery right now.',
    partialDataNote: formatPartialDataNote(meta),
  }
}

export const queryTrainingConcerns = (coachContext = {}, now = new Date()) => {
  const { queue } = buildCoachAttentionQueue(coachContext, now)
  const items = queue
    .filter((entry) =>
      entry.reasons.some((reason) =>
        [
          ATTENTION_REASON_TYPES.TRAINING_GAP,
          ATTENTION_REASON_TYPES.ASSIGNMENT_CONCERN,
        ].includes(reason.type),
      ),
    )
    .map((entry) => {
      const primaryReason = entry.reasons.find((reason) =>
        [
          ATTENTION_REASON_TYPES.TRAINING_GAP,
          ATTENTION_REASON_TYPES.ASSIGNMENT_CONCERN,
        ].includes(reason.type),
      )?.type
      return mapQueueEntryToResultItem(entry, { primaryReason })
    })

  return {
    actionId: AVA_ACTION_IDS.SHOW_TRAINING_CONCERNS,
    items,
    emptyMessage:
      'No training gaps flagged from recent sessions or assignments.',
  }
}

export const queryNutritionConcerns = (coachContext = {}, now = new Date()) => {
  const { queue } = buildCoachAttentionQueue(coachContext, now)
  const entries = rosterEntriesFromContext(coachContext)
  const sharedCount = entries.filter(
    (entry) => entry.intelligence?.nutrition?.shared,
  ).length

  const items = filterAttentionQueueByReason(
    queue,
    ATTENTION_REASON_TYPES.NUTRITION_CONCERN,
  ).map((entry) =>
    mapQueueEntryToResultItem(entry, {
      primaryReason: ATTENTION_REASON_TYPES.NUTRITION_CONCERN,
    }),
  )

  return {
    actionId: AVA_ACTION_IDS.SHOW_NUTRITION_CONCERNS,
    items,
    emptyMessage:
      sharedCount === 0
        ? 'Nutrition sharing is not available for your roster yet.'
        : 'No nutrition logging concerns stand out this week.',
  }
}

export const queryWeeklyReviews = (coachContext = {}, now = new Date()) => {
  const { queue } = buildCoachAttentionQueue(coachContext, now)
  const dueEntries = filterAttentionQueueByReason(
    queue,
    ATTENTION_REASON_TYPES.OPEN_COACH_REVIEW,
  )

  return {
    actionId: AVA_ACTION_IDS.OPEN_WEEKLY_REVIEWS,
    items: dueEntries.map((entry) =>
      mapQueueEntryToResultItem(entry, {
        primaryReason: ATTENTION_REASON_TYPES.OPEN_COACH_REVIEW,
      }),
    ),
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
  const weeklyCheckIn =
    coachContext.weeklyCheckInsByAthleteId?.[entry.client?.athlete_id] ?? null
  const normalizedCheckIn = normalizeWeeklyCheckIn(weeklyCheckIn)
  const missingCheckIn =
    resolveAthleteCheckInStatus({
      weeklyCheckIn,
      weeklyCheckInLoaded: Boolean(
        coachContext.portfolioStatus === 'ready' ||
          coachContext.portfolioStatus === 'partial' ||
          coachContext.portfolioLoadedAt ||
          Object.prototype.hasOwnProperty.call(
            coachContext.weeklyCheckInsByAthleteId ?? {},
            entry.client?.athlete_id,
          ),
      ),
      now,
    }).athleteCheckInStatus === ATHLETE_CHECK_IN_STATUS.MISSING
  const { queue } = buildCoachAttentionQueue(coachContext, now)
  const attentionEntry = getAttentionEntryForAthlete(
    queue,
    entry.client?.athlete_id,
  )

  return {
    clientName: buildCoachClientLabel(entry.client) ?? entry.clientName,
    athleteId: entry.client?.athlete_id,
    trainingSessionsThisWeek: training.workoutsThisWeek ?? 0,
    trainingLabel: training.label ?? null,
    missingWeeklyCheckIn: missingCheckIn,
    weeklyCheckInSubmitted: Boolean(normalizedCheckIn),
    coachFollowupNeeded:
      normalizedCheckIn?.painOrIssue === WEEKLY_CHECK_IN_PAIN.COACH_SHOULD_KNOW,
    weeklyRecoveryRating: normalizedCheckIn?.recoveryRating ?? null,
    weeklyReviewStatus: entry.weeklyReviewStatus ?? null,
    readinessAvailable: Boolean(readiness.available),
    readinessTrend: readiness.trend ?? null,
    readinessDetail: readiness.detail ?? null,
    nutritionShared: Boolean(nutrition.shared),
    nutritionDaysLogged: nutrition.daysLoggedThisWeek ?? null,
    assignmentStatus: intelligence.assignment?.active?.title ?? null,
    attentionReasons: attentionEntry?.reasons ?? [],
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

  const bullets = []

  if (facts.trainingSessionsThisWeek > 0) {
    bullets.push(
      `Trained ${facts.trainingSessionsThisWeek} time${facts.trainingSessionsThisWeek === 1 ? '' : 's'} this week`,
    )
  } else if (facts.trainingLabel) {
    bullets.push(facts.trainingLabel)
  } else {
    bullets.push('No completed sessions recorded this week')
  }

  if (facts.missingWeeklyCheckIn) {
    bullets.push("Weekly check-in not submitted yet")
  } else if (facts.weeklyCheckInSubmitted) {
    bullets.push('Weekly check-in submitted')
    if (facts.coachFollowupNeeded) {
      bullets.push('Flagged something for you in their check-in')
    }
  }

  if (facts.readinessAvailable && facts.readinessTrend === 'Below recent baseline') {
    bullets.push('Recovery below recent baseline')
  } else if (facts.readinessAvailable && facts.readinessTrend) {
    bullets.push(`Recovery: ${facts.readinessTrend}`)
  }

  if (facts.weeklyReviewStatus === 'REVIEW DUE') {
    bullets.push('Weekly coach review still open')
  }

  if (!bullets.length) {
    return `Nothing notable to report for ${facts.clientName} right now.`
  }

  return bullets.map((line) => `• ${line}`).join('\n')
}

export const runCoachQuery = (actionId, coachContext = {}, now = new Date()) => {
  switch (actionId) {
    case AVA_ACTION_IDS.SHOW_CLIENTS_NEEDING_ATTENTION:
      return queryClientsNeedingAttention(coachContext, now)
    case AVA_ACTION_IDS.SHOW_CLIENTS_MISSING_CHECKIN:
      return queryClientsMissingCheckIn(coachContext, now)
    case AVA_ACTION_IDS.SHOW_RECOVERY_CONCERNS:
      return queryRecoveryConcerns(coachContext, now)
    case AVA_ACTION_IDS.SHOW_TRAINING_CONCERNS:
      return queryTrainingConcerns(coachContext, now)
    case AVA_ACTION_IDS.SHOW_NUTRITION_CONCERNS:
      return queryNutritionConcerns(coachContext, now)
    case AVA_ACTION_IDS.OPEN_WEEKLY_REVIEWS:
      return queryWeeklyReviews(coachContext, now)
    default:
      return null
  }
}

export const formatCoachQueryMessage = (result = {}) => {
  if (result.actionId === AVA_ACTION_IDS.SHOW_CLIENTS_MISSING_CHECKIN) {
    const partialNote = result.partialDataNote
      ? `\n\n${result.partialDataNote}`
      : ''

    if (result.items?.length === 1) {
      const unknownNote =
        result.unknownItems?.length && result.partialDataNote
          ? `\n\n${result.partialDataNote}`
          : result.unknownItems?.length
          ? `\n\n${formatUnknownCheckInNote(result.unknownItems)}`
          : ''
      return `${result.items[0].clientName} hasn't submitted this week's check-in.${unknownNote}`
    }

    if (result.items?.length > 1) {
      const header = `${result.items.length} clients haven't checked in this week:`
      const lines = result.items.map((item) => item.clientName)
      return [header, '', ...lines].join('\n') + partialNote
    }

    if (result.canClaimAllClear) {
      return result.emptyMessage ?? 'Everyone is checked in this week.'
    }

    if (result.unknownItems?.length) {
      if (result.confirmedItems?.length === 1 && result.unknownItems.length) {
        return `I can confirm ${result.confirmedItems[0].clientName} checked in. ${formatUnknownCheckInNote(result.unknownItems)}`
      }
      return formatUnknownCheckInNote(result.unknownItems)
    }

    return result.emptyMessage ?? "I can't verify check-ins for your roster yet."
  }

  if (!result?.items?.length) {
    return result.emptyMessage ?? 'Nothing to report right now.'
  }

  const partialNote = result.partialDataNote
    ? `\n\n${result.partialDataNote}`
    : ''

  if (result.actionId === AVA_ACTION_IDS.SHOW_CLIENTS_NEEDING_ATTENTION) {
    const count = result.totalCount ?? result.items.length
    if (count === 1) {
      return `${result.items[0].clientName} — ${result.items[0].reason}${partialNote}`
    }

    const header = `${count} client${count === 1 ? '' : 's'} stand out today:`
    const lines = result.items.map(
      (item) => `${item.clientName} — ${item.reason}`,
    )
    return [header, '', ...lines].join('\n') + partialNote
  }

  if (result.actionId === AVA_ACTION_IDS.SHOW_RECOVERY_CONCERNS) {
    if (result.items.length === 1) {
      return `${result.items[0].clientName} stands out on recovery today.${partialNote}`
    }
  }

  if (result.actionId === AVA_ACTION_IDS.OPEN_WEEKLY_REVIEWS) {
    if (result.items.length === 1) {
      return `${result.items[0].clientName}'s weekly review is still open.${partialNote}`
    }
    const names = result.items.map((item) => item.clientName)
    return `${names.join(', ')} still need weekly reviews.${partialNote}`
  }

  if (result.items.length === 1) {
    return formatAttentionEntryHeadline({
      displayName: result.items[0].clientName,
      reasons: [{ label: result.items[0].reason }],
    }) + partialNote
  }

  const names = result.items.map((item) => item.clientName)
  if (names.length === 2) {
    return `${names[0]} and ${names[1]} need a look.${partialNote}`
  }

  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)} need a look.${partialNote}`
}
