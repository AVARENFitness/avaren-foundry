import { invalidateCoachPortfolioCache } from './coachPortfolioService'
import {
  getWeeklyCheckInStatus,
  resolveCurrentWeeklyCheckInState,
} from './weeklyCheckIn'
import { probeWeeklyCheckInCapability } from './weeklyCheckInCapability'
import { getCoachWeekRange } from './weeklyReview'
import {
  resetWeeklyCheckInBackendCache,
  weeklyCheckInBackend,
  DEV_WEEKLY_CHECKIN_RESET_RPC_MISSING_MESSAGE,
} from './weeklyCheckInBackend'

export const DEV_WEEKLY_CHECKIN_RESET_ERROR =
  'This action is only available in development builds.'

export { DEV_WEEKLY_CHECKIN_RESET_RPC_MISSING_MESSAGE }

const devDueOverride = {
  athleteId: null,
  weekStart: null,
}

export const weeklyCheckInNotificationFingerprint = (weekStart) =>
  `weekly-checkin:${weekStart}`

export const restoreWeeklyCheckInNotifications = (
  notificationState = {},
  weekStart,
) => {
  const fingerprint = weeklyCheckInNotificationFingerprint(weekStart)
  return {
    ...notificationState,
    dismissed: (notificationState.dismissed ?? []).filter(
      (entry) => entry !== fingerprint,
    ),
    actedOn: (notificationState.actedOn ?? []).filter(
      (entry) => entry !== fingerprint,
    ),
  }
}

export const activateDevWeeklyCheckInDueOverride = (athleteId, weekStart) => {
  if (!import.meta.env?.DEV || !athleteId || !weekStart) return
  devDueOverride.athleteId = athleteId
  devDueOverride.weekStart = weekStart
}

export const clearDevWeeklyCheckInDueOverride = () => {
  devDueOverride.athleteId = null
  devDueOverride.weekStart = null
}

export const isDevWeeklyCheckInDueOverrideActive = (
  athleteId = null,
  weekStart = null,
) =>
  Boolean(
    import.meta.env?.DEV &&
      athleteId &&
      weekStart &&
      devDueOverride.athleteId === athleteId &&
      devDueOverride.weekStart === weekStart,
  )

export const logWeeklyCheckInResetDiagnostic = ({
  deleteSucceeded = false,
  coachRelationshipExists = false,
  schemaAvailable = false,
  currentWeek = null,
  derivedStatus = null,
  rowExistedBefore = false,
  rowExistsAfter = false,
  rowsAffected = 0,
  deleteBlockedByRls = false,
  rpcAvailable = true,
  devDueOverrideActive = false,
} = {}) => {
  if (!import.meta.env?.DEV) return

  console.debug(
    '[weekly-checkin-reset]',
    JSON.stringify({
      deleteSucceeded,
      coachRelationshipExists,
      schemaAvailable,
      currentWeek,
      derivedStatus,
      rowExistedBefore,
      rowExistsAfter,
      rowsAffected,
      deleteBlockedByRls,
      rpcAvailable,
      devDueOverrideActive,
    }),
  )
}

export async function devResetCurrentWeeklyCheckIn({
  athleteId = null,
  now = new Date(),
} = {}) {
  if (!import.meta.env?.DEV) {
    throw new Error(DEV_WEEKLY_CHECKIN_RESET_ERROR)
  }

  resetWeeklyCheckInBackendCache()
  const capability = await probeWeeklyCheckInCapability({ force: true })
  const result = await weeklyCheckInBackend.resetCurrentWeekWeeklyCheckIn(now)
  invalidateCoachPortfolioCache()

  const weekStart = result.weekStart ?? getCoachWeekRange(now).weekStart
  const hasCoach = await weeklyCheckInBackend.hasCoachRelationship()
  const submission = await weeklyCheckInBackend.getCurrentWeeklyCheckIn(now)
  const derivedStatus = resolveCurrentWeeklyCheckInState({
    capability,
    status: getWeeklyCheckInStatus({
      hasCoach,
      submission,
      now,
      devForceDue: isDevWeeklyCheckInDueOverrideActive(athleteId, weekStart),
    }),
    loading: false,
    now,
    athleteId,
  }).status

  if (
    result.deleted &&
    athleteId &&
    hasCoach &&
    !result.rowExistsAfter
  ) {
    activateDevWeeklyCheckInDueOverride(athleteId, weekStart)
  }

  logWeeklyCheckInResetDiagnostic({
    deleteSucceeded: result.deleted,
    coachRelationshipExists: hasCoach,
    schemaAvailable: capability?.schemaAvailable !== false,
    currentWeek: weekStart,
    derivedStatus,
    rowExistedBefore: result.rowExistedBefore,
    rowExistsAfter: result.rowExistsAfter,
    rowsAffected: result.rowsAffected ?? 0,
    deleteBlockedByRls: result.deleteBlockedByRls ?? false,
    rpcAvailable: result.rpcAvailable !== false,
    devDueOverrideActive: isDevWeeklyCheckInDueOverrideActive(
      athleteId,
      weekStart,
    ),
  })

  return {
    ...result,
    hasCoach,
    derivedStatus,
    devDueOverrideActive: isDevWeeklyCheckInDueOverrideActive(
      athleteId,
      weekStart,
    ),
  }
}

export const currentWeekStart = (now = new Date()) =>
  getCoachWeekRange(now).weekStart
