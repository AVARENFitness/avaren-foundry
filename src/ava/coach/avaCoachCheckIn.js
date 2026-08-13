import { getCoachWeekRange } from '../../lib/weeklyReview'
import {
  isSubmittedWeeklyCheckIn,
  normalizeWeeklyCheckIn,
} from '../../lib/weeklyCheckIn'
import { isWeeklyCheckInObligationActive } from '../../lib/weeklyCheckInEligibility'

export const ATHLETE_CHECK_IN_STATUS = {
  SUBMITTED: 'submitted',
  MISSING: 'missing',
  NOT_REQUIRED: 'not_required',
  UNKNOWN: 'unknown',
}

export const COACH_REVIEW_STATUS = {
  OPEN: 'open',
  REVIEWED: 'reviewed',
  NOT_APPLICABLE: 'not_applicable',
}

export const resolveCoachReviewStatus = ({
  weeklyReview = null,
  now = new Date(),
} = {}) => {
  const weekRange = getCoachWeekRange(now)

  if (!weeklyReview) {
    return {
      coachReviewStatus: COACH_REVIEW_STATUS.OPEN,
      weekKey: weekRange.weekStart,
      coachReviewed: false,
    }
  }

  if (weeklyReview.weekStart === weekRange.weekStart) {
    return {
      coachReviewStatus: COACH_REVIEW_STATUS.REVIEWED,
      weekKey: weekRange.weekStart,
      coachReviewed: true,
    }
  }

  return {
    coachReviewStatus: COACH_REVIEW_STATUS.OPEN,
    weekKey: weekRange.weekStart,
    coachReviewed: false,
  }
}

export const resolveAthleteCheckInStatus = ({
  weeklyCheckIn = null,
  weeklyCheckInLoaded = true,
  now = new Date(),
} = {}) => {
  const weekRange = getCoachWeekRange(now)

  if (!weeklyCheckInLoaded) {
    return {
      athleteCheckInStatus: ATHLETE_CHECK_IN_STATUS.UNKNOWN,
      weekKey: weekRange.weekStart,
      currentWeekCheckInRecord: false,
      athleteSubmitted: false,
    }
  }

  if (isSubmittedWeeklyCheckIn(weeklyCheckIn, now)) {
    const normalized = normalizeWeeklyCheckIn(weeklyCheckIn)
    return {
      athleteCheckInStatus: ATHLETE_CHECK_IN_STATUS.SUBMITTED,
      weekKey: weekRange.weekStart,
      currentWeekCheckInRecord: true,
      athleteSubmitted: true,
      submittedAt: normalized.submittedAt,
    }
  }

  return {
    athleteCheckInStatus: ATHLETE_CHECK_IN_STATUS.MISSING,
    weekKey: weekRange.weekStart,
    currentWeekCheckInRecord: false,
    athleteSubmitted: false,
  }
}

export const resolveClientWeeklyCheckInRecord = ({
  athleteId = null,
  weeklyCheckIn = null,
  weeklyCheckInLoaded = true,
  weeklyReview = null,
  now = new Date(),
} = {}) => {
  const athlete = resolveAthleteCheckInStatus({
    weeklyCheckIn,
    weeklyCheckInLoaded,
    now,
  })
  const coach = resolveCoachReviewStatus({ weeklyReview, now })

  return {
    athleteId,
    weekKey: athlete.weekKey,
    athleteCheckInStatus: athlete.athleteCheckInStatus,
    coachReviewStatus: coach.coachReviewStatus,
    currentWeekCheckInRecord: athlete.currentWeekCheckInRecord,
    athleteSubmitted: athlete.athleteSubmitted,
    coachReviewed: coach.coachReviewed,
    classification: athlete.athleteCheckInStatus,
  }
}

export const summarizeRosterCheckInStatus = ({
  rosterEntries = [],
  weeklyCheckInsByAthleteId = {},
  weeklyReviewsByAthleteId = {},
  portfolioLoaded = true,
  now = new Date(),
} = {}) => {
  const weekRange = getCoachWeekRange(now)
  const checkInsMap = weeklyCheckInsByAthleteId ?? {}

  const records = rosterEntries.map((entry) => {
    const athleteId = entry.client?.athlete_id
    const eligible = isWeeklyCheckInObligationActive(entry.client)

    if (!eligible) {
      return resolveClientWeeklyCheckInRecord({
        athleteId,
        weeklyCheckIn: null,
        weeklyCheckInLoaded: true,
        weeklyReview: weeklyReviewsByAthleteId?.[athleteId] ?? null,
        now,
      })
    }

    const weeklyCheckInLoaded = portfolioLoaded && Boolean(athleteId)

    return resolveClientWeeklyCheckInRecord({
      athleteId,
      weeklyCheckIn: checkInsMap[athleteId] ?? null,
      weeklyCheckInLoaded,
      weeklyReview: weeklyReviewsByAthleteId?.[athleteId] ?? null,
      now,
    })
  }).map((record, index) => {
    const entry = rosterEntries[index]
    if (!isWeeklyCheckInObligationActive(entry?.client)) {
      return {
        ...record,
        athleteCheckInStatus: ATHLETE_CHECK_IN_STATUS.NOT_REQUIRED,
        coachReviewStatus: COACH_REVIEW_STATUS.NOT_APPLICABLE,
      }
    }
    return record
  })

  const submitted = records.filter(
    (record) =>
      record.athleteCheckInStatus === ATHLETE_CHECK_IN_STATUS.SUBMITTED,
  )
  const missing = records.filter(
    (record) => record.athleteCheckInStatus === ATHLETE_CHECK_IN_STATUS.MISSING,
  )
  const unknown = records.filter(
    (record) => record.athleteCheckInStatus === ATHLETE_CHECK_IN_STATUS.UNKNOWN,
  )
  const requiredCount = records.filter(
    (record) =>
      record.athleteCheckInStatus !== ATHLETE_CHECK_IN_STATUS.NOT_REQUIRED,
  ).length

  return {
    weekKey: weekRange.weekStart,
    records,
    submitted,
    missing,
    unknown,
    requiredCount,
    submittedCount: submitted.length,
    missingCount: missing.length,
    unknownCount: unknown.length,
    canClaimAllClear:
      requiredCount > 0 &&
      missing.length === 0 &&
      unknown.length === 0 &&
      submitted.length === requiredCount,
  }
}

export const logAvaCheckInDiagnostic = ({
  weekKey = null,
  requiredCount = 0,
  submittedCount = 0,
  missingCount = 0,
  unknownCount = 0,
  source = 'roster',
} = {}) => {
  if (!import.meta.env?.DEV) return

  console.debug(
    '[ava-checkin]',
    JSON.stringify({
      weekKey,
      requiredCount,
      submittedCount,
      missingCount,
      unknownCount,
      source,
    }),
  )
}

export const hasWeeklyAthleteCheckIn = (
  weeklyCheckIn = null,
  now = new Date(),
) => isSubmittedWeeklyCheckIn(weeklyCheckIn, now)

export const athleteHasPriorWeekCheckInOnly = (
  weeklyCheckIn = null,
  priorWeekCheckIn = null,
  now = new Date(),
) =>
  !isSubmittedWeeklyCheckIn(weeklyCheckIn, now) &&
  Boolean(normalizeWeeklyCheckIn(priorWeekCheckIn))
