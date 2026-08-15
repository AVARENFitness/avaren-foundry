import { useCallback, useRef, useState } from 'react'
import {
  COACH_ACTIVE_MODE,
  writeLastActiveMode,
} from '../lib/coachModePersistence'
import { canAccessCoachHub } from './useCoachAccess'

const COACH_MODE_SCREEN = 'coach-hub'
const DEFAULT_ATHLETE_SCREEN = 'home'
const PRIMARY_ATHLETE_TABS = new Set([
  'home',
  'train',
  'nutrition',
  'schedule',
  'progress',
])

export const normalizeAthleteReturnScreen = (screen) => {
  if (!screen || screen === COACH_MODE_SCREEN) return DEFAULT_ATHLETE_SCREEN
  if (screen === 'in-person-schedule') return 'schedule'
  if (PRIMARY_ATHLETE_TABS.has(screen)) return screen
  if (screen === 'more') return DEFAULT_ATHLETE_SCREEN
  return DEFAULT_ATHLETE_SCREEN
}

export function useNavigation({ session, setCoachWorkspace, coachAuthorized = false }) {
  const [screen, setScreen] = useState('home')
  const [coachScreen, setCoachScreen] = useState('today')
  const [selectedCoachClient, setSelectedCoachClient] = useState(null)
  const [transitioning, setTransitioning] = useState(false)
  const lastAthleteScreenRef = useRef(DEFAULT_ATHLETE_SCREEN)

  const navigate = useCallback((nextScreen, callback) => {
    setTransitioning(true)
    window.setTimeout(() => {
      callback?.()
      setScreen(nextScreen)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      window.setTimeout(() => setTransitioning(false), 260)
    }, 180)
  }, [])

  const enterCoachMode = useCallback(() => {
    if (!canAccessCoachHub(session, coachAuthorized)) {
      return
    }

    if (screen !== COACH_MODE_SCREEN) {
      lastAthleteScreenRef.current = normalizeAthleteReturnScreen(screen)
    }

    setCoachWorkspace((current) => ({
      ...current,
      role: 'coach',
      modeEnabled: true,
    }))
    setSelectedCoachClient(null)
    setCoachScreen('today')
    setScreen(COACH_MODE_SCREEN)
    if (session?.user?.id) {
      writeLastActiveMode(session.user.id, COACH_ACTIVE_MODE.COACH)
    }
    window.scrollTo({
      top: 0,
      behavior: 'auto',
    })
  }, [session, coachAuthorized, setCoachWorkspace, screen])

  const exitCoachMode = useCallback(() => {
    setCoachWorkspace((current) => ({
      ...current,
      modeEnabled: false,
    }))
    if (session?.user?.id) {
      writeLastActiveMode(session.user.id, COACH_ACTIVE_MODE.ATHLETE)
    }
    setScreen(
      lastAthleteScreenRef.current ?? DEFAULT_ATHLETE_SCREEN,
    )
    window.scrollTo({
      top: 0,
      behavior: 'auto',
    })
  }, [session?.user?.id, setCoachWorkspace])

  return {
    screen,
    setScreen,
    coachScreen,
    setCoachScreen,
    selectedCoachClient,
    setSelectedCoachClient,
    transitioning,
    navigate,
    enterCoachMode,
    exitCoachMode,
    lastAthleteScreenBeforeCoach: lastAthleteScreenRef.current,
  }
}
