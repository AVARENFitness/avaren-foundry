import { getClientDisplayName } from './clientDisplayName'
import { getCoachWeekRange } from './weeklyReview'

export const COACH_REVIEW_NAV_SOURCES = {
  CLIENT_PROFILE: 'client_profile',
  AVA: 'ava',
  COACH_HUB: 'coach_hub',
}

export const buildClientReviewNavigationTarget = ({
  client = null,
  weekKey = null,
  athleteCheckIn = null,
  coachReview = null,
  source = COACH_REVIEW_NAV_SOURCES.CLIENT_PROFILE,
} = {}) => {
  const weekRange = getCoachWeekRange()
  const resolvedWeekKey = weekKey ?? weekRange.weekStart

  return {
    athleteId: client?.athlete_id ?? null,
    clientDisplayName: client ? getClientDisplayName(client) : null,
    weekKey: resolvedWeekKey,
    weekEnd: weekRange.weekEnd,
    athleteCheckInId: athleteCheckIn?.id ?? null,
    coachReviewId: coachReview?.id ?? null,
    source,
  }
}

export const openClientReview = ({
  client = null,
  reviewId = null,
  navigationTarget = null,
  openWeeklyReview,
} = {}) => {
  if (!client?.athlete_id || typeof openWeeklyReview !== 'function') {
    return {
      ok: false,
      message: client
        ? "I couldn't open that review right now."
        : "I couldn't find that client review.",
    }
  }

  try {
    openWeeklyReview(client, reviewId ?? navigationTarget?.coachReviewId ?? null)
    return { ok: true, target: navigationTarget ?? buildClientReviewNavigationTarget({ client }) }
  } catch {
    return {
      ok: false,
      message: `I couldn't open ${getClientDisplayName(client)}'s review right now.`,
    }
  }
}
