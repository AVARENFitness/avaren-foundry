import { AVA_ACTION_IDS } from '../actions/avaActionTypes'
import {
  COACH_PORTFOLIO_DOMAINS,
  COACH_PORTFOLIO_STATUS,
  coachContextHasPortfolioData,
  getRequiredDomainsForQuery,
  portfolioQueryLoadErrorMessage,
} from '../../lib/coachPortfolioService'

export { coachContextHasPortfolioData, getRequiredDomainsForQuery, portfolioQueryLoadErrorMessage }

export const COACH_QUERY_TYPES = {
  ATTENTION: 'attention',
  MISSING_CHECKIN: 'missing_checkin',
  RECOVERY: 'recovery',
  TRAINING: 'training',
  NUTRITION: 'nutrition',
  WEEKLY_REVIEW: 'weekly_review',
  FOLLOWUP: 'followup',
  APPOINTMENT: 'appointment',
}

export const COACH_INTENT_FAMILIES = {
  [COACH_QUERY_TYPES.ATTENTION]: 'coach_attention',
  [COACH_QUERY_TYPES.MISSING_CHECKIN]: 'coach_missing_checkin',
  [COACH_QUERY_TYPES.RECOVERY]: 'coach_recovery',
  [COACH_QUERY_TYPES.TRAINING]: 'coach_training',
  [COACH_QUERY_TYPES.NUTRITION]: 'coach_nutrition',
  [COACH_QUERY_TYPES.WEEKLY_REVIEW]: 'coach_weekly_review',
  [COACH_QUERY_TYPES.FOLLOWUP]: 'coach_followup',
  [COACH_QUERY_TYPES.APPOINTMENT]: 'coach_appointment',
}

const CONTRACTION_REPLACEMENTS = [
  [/\bwho's\b/g, 'who is'],
  [/\bwhos\b/g, 'who is'],
  [/\bwho've\b/g, 'who have'],
  [/\bwhove\b/g, 'who have'],
  [/\bwhat's\b/g, 'what is'],
  [/\bwhats\b/g, 'what is'],
  [/\bhasn't\b/g, 'has not'],
  [/\bhasnt\b/g, 'has not'],
  [/\bhaven't\b/g, 'have not'],
  [/\bhavent\b/g, 'have not'],
  [/\bdoesn't\b/g, 'does not'],
  [/\bdoesnt\b/g, 'does not'],
  [/\bdon't\b/g, 'do not'],
  [/\bdont\b/g, 'do not'],
  [/\bisn't\b/g, 'is not'],
  [/\bisnt\b/g, 'is not'],
  [/\bi'm\b/g, 'i am'],
  [/\bim\b/g, 'i am'],
]

export const normalizeCoachQueryText = (value = '') => {
  let text = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019\u2032]/g, "'")

  for (const [pattern, replacement] of CONTRACTION_REPLACEMENTS) {
    text = text.replace(pattern, replacement)
  }

  return text
    .replace(/[^\w\s'-]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\bcheck ins\b/g, 'check in')
    .replace(/\bcheckins\b/g, 'check in')
    .replace(/\bcheckin\b/g, 'check in')
    .replace(/\bfollow ups\b/g, 'follow up')
    .replace(/\bfollowups\b/g, 'follow up')
    .replace(/\s+/g, ' ')
    .trim()
}

export const isSelfReferentialCoachPhrase = (normalizedText = '') => {
  const text = normalizeCoachQueryText(normalizedText)
  if (!text) return false

  if (/^(i|my|me)\b/.test(text)) return true
  if (/\bmy recovery\b/.test(text)) return true
  if (/\bi am having recovery issues\b/.test(text)) return true

  return false
}

export const isCoachRosterTargetingPhrase = (normalizedText = '') => {
  const text = normalizeCoachQueryText(normalizedText)
  if (!text) return false

  return (
    /^(who|anyone|anybody|what clients|what do i need|show|any)\b/.test(text) ||
    /\b(clients|concerns|reviews|check in|missing check|follow up)\b/.test(text) ||
    /\bwho (is|has|still|should|needs|do)\b/.test(text)
  )
}

const matchesMissingCheckInIntent = (text = '') =>
  /\bwho has not checked in\b/.test(text) ||
  /\bwho still needs to check in\b/.test(text) ||
  /\bwho still owes me a check in\b/.test(text) ||
  /\bshow missing check in\b/.test(text) ||
  /\banyone missing their check in\b/.test(text) ||
  (/\bwho\b/.test(text) && /\bcheck in\b/.test(text) && /\b(missing|has not|not checked)\b/.test(text))

const matchesRecoveryIntent = (text = '') =>
  /\bwho is having recovery issues\b/.test(text) ||
  /\bwho has recovery issues\b/.test(text) ||
  /\bwho is struggling with recovery\b/.test(text) ||
  /\bwho has low recovery\b/.test(text) ||
  /\bany recovery concerns\b/.test(text) ||
  /\bshow me recovery concerns\b/.test(text) ||
  /\bshow recovery concerns\b/.test(text) ||
  /\banyone struggling with recovery\b/.test(text) ||
  (/\brecovery concerns\b/.test(text) && /\b(show|any)\b/.test(text))

const matchesFollowUpIntent = (text = '') =>
  /\bany client follow up\b/.test(text) ||
  /\bclient follow ups\b/.test(text) ||
  /\bopen follow ups\b/.test(text) ||
  /\bany follow ups\b/.test(text) ||
  (/\bfollow up\b/.test(text) && /\b(any|client|show|open)\b/.test(text))

const matchesAppointmentIntent = (text = '') =>
  /\bwho am i training today\b/.test(text) ||
  /\bwhat'?s my next session\b/.test(text) ||
  /\bwhat is my next session\b/.test(text) ||
  /\bshow me today'?s appointments\b/.test(text) ||
  /\btoday'?s appointments\b/.test(text) ||
  /\bdo i have anyone tomorrow\b/.test(text) ||
  (/\bwhen do i have\b/.test(text) && /\b(train|session|appointment)\b/.test(text))

const matchesAttentionIntent = (text = '') =>
  /\bwho needs my attention\b/.test(text) ||
  /\bwho needs attention\b/.test(text) ||
  /\bwho should i follow up with\b/.test(text) ||
  /\bwho should i check on\b/.test(text) ||
  /\bwhat do i need to handle today\b/.test(text) ||
  /\banyone i need to check on\b/.test(text) ||
  /\bwhat clients need me today\b/.test(text) ||
  /\bshow clients needing attention\b/.test(text) ||
  /\bshow me clients i need to follow up with\b/.test(text)

const matchesWeeklyReviewIntent = (text = '') =>
  /\bopen weekly reviews\b/.test(text) ||
  /\bshow unfinished reviews\b/.test(text) ||
  /\bwho do i still need to review\b/.test(text) ||
  /\bwho do i need to review\b/.test(text) ||
  /\bwho still needs reviewed\b/.test(text) ||
  /\bwhat reviews are open\b/.test(text) ||
  /\bany reviews left\b/.test(text)

const matchesTrainingIntent = (text = '') =>
  /\bwho has not trained\b/.test(text) ||
  /\bwho is behind on training\b/.test(text) ||
  /\bany training concerns\b/.test(text) ||
  /\bwho missed training\b/.test(text) ||
  /\bshow training concerns\b/.test(text)

const matchesNutritionIntent = (text = '') =>
  /\bwho has not logged nutrition\b/.test(text) ||
  /\bwho is behind on protein\b/.test(text) ||
  /\bshow nutrition concerns\b/.test(text)

const INTENT_MATCHERS = [
  {
    queryType: COACH_QUERY_TYPES.MISSING_CHECKIN,
    actionId: AVA_ACTION_IDS.SHOW_CLIENTS_MISSING_CHECKIN,
    match: matchesMissingCheckInIntent,
  },
  {
    queryType: COACH_QUERY_TYPES.RECOVERY,
    actionId: AVA_ACTION_IDS.SHOW_RECOVERY_CONCERNS,
    match: matchesRecoveryIntent,
  },
  {
    queryType: COACH_QUERY_TYPES.APPOINTMENT,
    actionId: AVA_ACTION_IDS.SHOW_TODAY_APPOINTMENTS,
    match: matchesAppointmentIntent,
  },
  {
    queryType: COACH_QUERY_TYPES.FOLLOWUP,
    actionId: AVA_ACTION_IDS.SHOW_CLIENT_FOLLOWUPS,
    match: matchesFollowUpIntent,
  },
  {
    queryType: COACH_QUERY_TYPES.ATTENTION,
    actionId: AVA_ACTION_IDS.SHOW_CLIENTS_NEEDING_ATTENTION,
    match: matchesAttentionIntent,
  },
  {
    queryType: COACH_QUERY_TYPES.WEEKLY_REVIEW,
    actionId: AVA_ACTION_IDS.OPEN_WEEKLY_REVIEWS,
    match: matchesWeeklyReviewIntent,
  },
  {
    queryType: COACH_QUERY_TYPES.TRAINING,
    actionId: AVA_ACTION_IDS.SHOW_TRAINING_CONCERNS,
    match: matchesTrainingIntent,
  },
  {
    queryType: COACH_QUERY_TYPES.NUTRITION,
    actionId: AVA_ACTION_IDS.SHOW_NUTRITION_CONCERNS,
    match: matchesNutritionIntent,
  },
]

export const logAvaIntentDiagnostic = ({
  role = 'athlete',
  normalizedIntentFamily = null,
  matched = false,
  route = matched ? 'deterministic' : 'model',
} = {}) => {
  if (!import.meta.env?.DEV) return

  console.debug(
    '[ava-intent]',
    JSON.stringify({
      role,
      normalizedIntentFamily,
      matched,
      route,
    }),
  )
}

export const matchCoachOperationalQuery = (message = '') => {
  const normalizedMessage = normalizeCoachQueryText(message)
  if (!normalizedMessage) return null

  if (isSelfReferentialCoachPhrase(normalizedMessage)) {
    logAvaIntentDiagnostic({
      role: 'coach',
      normalizedIntentFamily: null,
      matched: false,
      route: 'model',
    })
    return null
  }

  if (!isCoachRosterTargetingPhrase(normalizedMessage)) {
    return null
  }

  for (const entry of INTENT_MATCHERS) {
    if (entry.match(normalizedMessage)) {
      logAvaIntentDiagnostic({
        role: 'coach',
        normalizedIntentFamily: COACH_INTENT_FAMILIES[entry.queryType],
        matched: true,
        route: 'deterministic',
      })
      return {
        queryType: entry.queryType,
        actionId: entry.actionId,
        normalizedMessage,
        intentFamily: COACH_INTENT_FAMILIES[entry.queryType],
      }
    }
  }

  return null
}

export const isCoachOperationalQuery = (message = '') =>
  Boolean(matchCoachOperationalQuery(message))

export const logAvaCoachQueryDiagnostic = ({
  role = 'athlete',
  queryType = null,
  matched = false,
  recognized = matched,
  source = 'model',
  dataStatus = null,
  portfolioStatus = dataStatus,
  authorizedClientCount = 0,
  resultCount = 0,
  route = source === 'deterministic' ? 'deterministic' : 'model',
} = {}) => {
  if (!import.meta.env?.DEV) return

  console.debug(
    '[ava-coach-query]',
    JSON.stringify({
      role,
      queryType,
      matched,
      recognized,
      source,
      dataStatus,
      portfolioStatus,
      authorizedClientCount,
      resultCount,
      route,
    }),
  )
}

export const coachContextAuthorizedClientCount = (coachContext = {}) =>
  coachContext.clients?.length ??
  coachContext.portfolio?.rosterEntries?.length ??
  coachContext.rosterEntries?.length ??
  0

export { COACH_PORTFOLIO_DOMAINS, COACH_PORTFOLIO_STATUS }
