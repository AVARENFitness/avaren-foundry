import { isPrimaryAvarenCoach } from '../config/coachAccess'

export const COACH_ACTIVE_MODE = {
  COACH: 'coach',
  ATHLETE: 'athlete',
}

const STORAGE_PREFIX = 'avaren:last-mode'

const storageKey = (userId) => `${STORAGE_PREFIX}:${userId}`

export const readLastActiveMode = (userId) => {
  if (!userId || typeof window === 'undefined') return null
  try {
    const value = window.localStorage.getItem(storageKey(userId))
    if (value === COACH_ACTIVE_MODE.COACH || value === COACH_ACTIVE_MODE.ATHLETE) {
      return value
    }
    return null
  } catch {
    return null
  }
}

export const writeLastActiveMode = (userId, mode) => {
  if (!userId || typeof window === 'undefined') return
  if (mode !== COACH_ACTIVE_MODE.COACH && mode !== COACH_ACTIVE_MODE.ATHLETE) return
  try {
    window.localStorage.setItem(storageKey(userId), mode)
  } catch {
    // Ignore quota / private mode failures.
  }
}

export const clearLastActiveMode = (userId) => {
  if (!userId || typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(storageKey(userId))
  } catch {
    // Ignore storage failures.
  }
}

export const resolveDefaultActiveMode = ({
  session = null,
  coachAuthorized = false,
} = {}) => {
  if (isPrimaryAvarenCoach(session) || coachAuthorized) {
    return isPrimaryAvarenCoach(session)
      ? COACH_ACTIVE_MODE.COACH
      : COACH_ACTIVE_MODE.ATHLETE
  }
  return COACH_ACTIVE_MODE.ATHLETE
}

export const shouldRestoreCoachMode = ({
  persistedMode = null,
  defaultMode = COACH_ACTIVE_MODE.ATHLETE,
  coachAuthorized = false,
  hasActiveWorkout = false,
} = {}) => {
  if (hasActiveWorkout) return false
  const targetMode = persistedMode ?? defaultMode
  return targetMode === COACH_ACTIVE_MODE.COACH && coachAuthorized
}
