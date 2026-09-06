import { useEffect, useRef, useState } from 'react'
import {
  chooseNewestState,
  loadCloudState,
  saveCloudState,
} from '../lib/cloudSync'
import {
  flushDurableWorkoutQueue,
  loadMergedAthleteWorkoutHistory,
} from '../lib/athleteWorkoutSessionsBackend'
import { loadState, normalizeAppState, saveState } from '../lib/storage'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

export function useAuthSession({
  state,
  setState,
  createInitialState,
  onAuthenticated,
  onSignedOut,
  onAccountHydrated,
}) {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [cloudReady, setCloudReady] = useState(false)
  const [cloudStatus, setCloudStatus] = useState(
    navigator.onLine ? 'ready' : 'offline',
  )

  const hydratedUserId = useRef(null)
  const cloudSaveTimer = useRef(null)
  const latestStateRef = useRef(state)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error('Unable to restore session:', error)
      setSession(data?.session ?? null)
      setAuthLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession)
        setAuthLoading(false)

        if (nextSession) {
          onAuthenticated?.()
        }

        if (!nextSession) {
          hydratedUserId.current = null
          setCloudReady(false)
          onSignedOut?.()
          setCloudStatus(navigator.onLine ? 'ready' : 'offline')
        }
      },
    )

    return () => listener.subscription.unsubscribe()
  }, [onAuthenticated, onSignedOut])

  useEffect(() => {
    latestStateRef.current = state
  }, [state])

  useEffect(() => {
    const userId = session?.user?.id
    if (!userId || !cloudReady) return
    saveState(state, userId)
  }, [state, session?.user?.id, cloudReady])

  useEffect(() => {
    const userId = session?.user?.id
    if (!userId || hydratedUserId.current === userId) return

    let cancelled = false
    setCloudReady(false)
    setCloudStatus(navigator.onLine ? 'syncing' : 'offline')

    const hydrateAccount = async () => {
      try {
        const localAccountState = loadState(createInitialState(userId), userId)
        const cloudRecord = await loadCloudState(userId)
        if (cancelled) return

        const decision = chooseNewestState(localAccountState, cloudRecord)
        const baseState = createInitialState(userId)
        const normalizedState = normalizeAppState(
          decision.state,
          baseState,
          userId,
        )

        if (navigator.onLine) {
          await flushDurableWorkoutQueue(userId).catch((error) => {
            console.error('Durable workout queue flush failed:', error)
          })
        }

        const durableHistory = await loadMergedAthleteWorkoutHistory(
          userId,
          normalizedState.history ?? [],
        ).catch(() => normalizedState.history ?? [])

        if (cancelled) return

        const historyMergedState = {
          ...normalizedState,
          history: durableHistory,
        }

        const hasExistingUsage =
          (historyMergedState?.history?.length ?? 0) > 0 ||
          (historyMergedState?.achievements?.length ?? 0) > 0 ||
          (historyMergedState?.mobility?.completed?.length ?? 0) > 0 ||
          Boolean(historyMergedState?.activeWorkout)

        const hydratedState = {
          ...baseState,
          ...historyMergedState,
          ownerUserId: userId,
          activeWorkout:
            historyMergedState?.activeWorkout ?? null,
          onboarding:
            historyMergedState?.onboarding ?? {
              completed: hasExistingUsage,
              completedAt:
                hasExistingUsage
                  ? new Date().toISOString()
                  : null,
            },
        }

        setState(hydratedState)
        onAccountHydrated?.(hydratedState, decision)

        if (decision.uploadLocal && navigator.onLine) {
          await saveCloudState(userId, historyMergedState)
        }

        hydratedUserId.current = userId
        setCloudReady(true)
        setCloudStatus(navigator.onLine ? 'synced' : 'offline')
      } catch (error) {
        console.error('Foundry cloud hydration failed:', error)
        if (cancelled) return

        // Local fallback so the athlete can keep training.
        // Cloud writes remain merge-safe (empty shell cannot wipe history).
        const localOnly = normalizeAppState(
          loadState(createInitialState(userId), userId),
          createInitialState(userId),
          userId,
        )
        setState({
          ...localOnly,
          ownerUserId: userId,
        })
        hydratedUserId.current = userId
        setCloudReady(true)
        setCloudStatus(navigator.onLine ? 'error' : 'offline')
      }
    }

    hydrateAccount()

    return () => {
      cancelled = true
    }
  }, [session?.user?.id, createInitialState, setState, onAccountHydrated])

  useEffect(() => {
    const userId = session?.user?.id
    if (!userId || !cloudReady) return

    window.clearTimeout(cloudSaveTimer.current)

    cloudSaveTimer.current = window.setTimeout(async () => {
      if (!navigator.onLine) {
        setCloudStatus('offline')
        return
      }

      try {
        setCloudStatus('syncing')
        await saveCloudState(userId, latestStateRef.current)
        setCloudStatus('synced')
      } catch (error) {
        console.error('Foundry cloud save failed:', error)
        setCloudStatus(navigator.onLine ? 'error' : 'offline')
      }
    }, 1200)

    return () => window.clearTimeout(cloudSaveTimer.current)
  }, [state, session?.user?.id, cloudReady])

  useEffect(() => {
    const handleOffline = () => setCloudStatus('offline')

    const handleOnline = async () => {
      const userId = session?.user?.id

      if (!userId || !cloudReady) {
        setCloudStatus('ready')
        return
      }

      try {
        setCloudStatus('syncing')
        await flushDurableWorkoutQueue(userId)
        const mergedHistory = await loadMergedAthleteWorkoutHistory(
          userId,
          latestStateRef.current?.history ?? [],
        )
        if (
          mergedHistory.length !==
          (latestStateRef.current?.history?.length ?? 0)
        ) {
          setState((current) => ({
            ...current,
            history: mergedHistory,
          }))
        }
        await saveCloudState(userId, {
          ...latestStateRef.current,
          history: mergedHistory,
        })
        setCloudStatus('synced')
      } catch (error) {
        console.error('Foundry reconnect sync failed:', error)
        setCloudStatus('error')
      }
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)

    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [session?.user?.id, cloudReady, setState])

  return {
    session,
    authLoading,
    cloudReady,
    cloudStatus,
    isSupabaseConfigured,
  }
}
