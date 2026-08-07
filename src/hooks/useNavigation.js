import { useCallback, useState } from 'react'
import { canAccessCoachHub } from './useCoachAccess'

export function useNavigation({ session, setCoachWorkspace, coachAuthorized = false }) {
  const [screen, setScreen] = useState('home')
  const [coachScreen, setCoachScreen] = useState('clients')
  const [selectedCoachClient, setSelectedCoachClient] = useState(null)
  const [transitioning, setTransitioning] = useState(false)

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

    setCoachWorkspace((current) => ({
      ...current,
      role: 'coach',
      modeEnabled: true,
    }))
    setSelectedCoachClient(null)
    setCoachScreen('clients')
    setScreen('coach-hub')
    window.scrollTo({
      top: 0,
      behavior: 'auto',
    })
  }, [session, coachAuthorized, setCoachWorkspace])

  const exitCoachMode = useCallback(() => {
    setCoachWorkspace((current) => ({
      ...current,
      modeEnabled: false,
    }))
    setScreen('more')
    window.scrollTo({
      top: 0,
      behavior: 'auto',
    })
  }, [setCoachWorkspace])

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
  }
}
