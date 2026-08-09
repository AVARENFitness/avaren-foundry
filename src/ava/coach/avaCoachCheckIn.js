import { getCoachWeekRange, isDateInWeek } from '../../lib/weeklyReview'

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

const CHECK_IN_FIELDS = ['sleep', 'energy', 'soreness', 'stress']

export const isValidAthleteCheckInEntry = (entry = null) => {
  if (!entry?.date) return false

  return CHECK_IN_FIELDS.every(
    (field) =>
      entry[field] !== undefined &&
      entry[field] !== null &&
      Number.isFinite(Number(entry[field])),
  )
}

export const findCurrentWeekAthleteCheckInEntry = (
  athleteState = null,
  now = new Date(),
) => {
  const weekRange = getCoachWeekRange(now)
  const entries = athleteState?.readiness?.entries ?? []

  return (
    entries.find(
      (entry) =>
        isValidAthleteCheckInEntry(entry) &&
        isDateInWeek(entry.date, weekRange.weekStart, weekRange.weekEnd),
    ) ?? null
  )
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
  athleteState = null,
  athleteStateLoaded = true,
  now = new Date(),
} = {}) => {
  const weekRange = getCoachWeekRange(now)

  if (!athleteStateLoaded) {
    return {
      athleteCheckInStatus: ATHLETE_CHECK_IN_STATUS.UNKNOWN,
      weekKey: weekRange.weekStart,
      currentWeekCheckInRecord: false,
      athleteSubmitted: false,
    }
  }

  if (!athleteState?.readiness) {
    return {
      athleteCheckInStatus: ATHLETE_CHECK_IN_STATUS.UNKNOWN,
      weekKey: weekRange.weekStart,
      currentWeekCheckInRecord: false,
      athleteSubmitted: false,
    }
  }

  const currentWeekEntry = findCurrentWeekAthleteCheckInEntry(athleteState, now)
  if (currentWeekEntry) {
    return {
      athleteCheckInStatus: ATHLETE_CHECK_IN_STATUS.SUBMITTED,
      weekKey: weekRange.weekStart,
      currentWeekCheckInRecord: true,
      athleteSubmitted: true,
      submittedDate: currentWeekEntry.date,
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
  athleteState = null,
  athleteStateLoaded = true,
  weeklyReview = null,
  now = new Date(),
} = {}) => {
  const athlete = resolveAthleteCheckInStatus({
    athleteState,
    athleteStateLoaded,
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
  athleteStatesById = {},
  weeklyReviewsByAthleteId = {},
  portfolioLoaded = true,
  now = new Date(),
} = {}) => {
  const weekRange = getCoachWeekRange(now)
  const statesMap = athleteStatesById ?? {}

  const records = rosterEntries.map((entry) => {
    const athleteId = entry.client?.athlete_id
    const athleteStateLoaded =
      portfolioLoaded &&
      athleteId &&
      Object.prototype.hasOwnProperty.call(statesMap, athleteId)

    return resolveClientWeeklyCheckInRecord({
      athleteId,
      athleteState: statesMap[athleteId] ?? null,
      athleteStateLoaded,
      weeklyReview: weeklyReviewsByAthleteId?.[athleteId] ?? null,
      now,
    })
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
  athleteState = null,
  now = new Date(),
) =>
  resolveAthleteCheckInStatus({
    athleteState,
    athleteStateLoaded: true,
    now,
  }).athleteCheckInStatus === ATHLETE_CHECK_IN_STATUS.SUBMITTED

export const athleteHasPriorWeekCheckInOnly = (
  athleteState = null,
  now = new Date(),
) => {
  const weekRange = getCoachWeekRange(now)
  const entries = (athleteState?.readiness?.entries ?? []).filter(
    isValidAthleteCheckInEntry,
  )

  const hasCurrentWeek = entries.some((entry) =>
    isDateInWeek(entry.date, weekRange.weekStart, weekRange.weekEnd),
  )
  if (hasCurrentWeek) return false

  return entries.some(
    (entry) => !isDateInWeek(entry.date, weekRange.weekStart, weekRange.weekEnd),
  )
}
