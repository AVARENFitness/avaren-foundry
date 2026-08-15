export const COACH_SCREENS = {
  TODAY: 'today',
  CLIENTS: 'clients',
  BUILD: 'build',
  CALENDAR: 'calendar',
  MORE: 'more',
}

const LEGACY_SCREEN_MAP = {
  assignments: COACH_SCREENS.BUILD,
  programs: COACH_SCREENS.BUILD,
  settings: COACH_SCREENS.MORE,
}

export const normalizeCoachScreen = (screen) =>
  LEGACY_SCREEN_MAP[screen] ?? screen ?? COACH_SCREENS.TODAY

export const isLegacyCoachScreen = (screen) =>
  Object.prototype.hasOwnProperty.call(LEGACY_SCREEN_MAP, screen)

export const buildViewForLegacyScreen = (screen) => {
  if (screen === 'assignments') return 'workouts'
  if (screen === 'programs') return 'programs'
  return 'home'
}
