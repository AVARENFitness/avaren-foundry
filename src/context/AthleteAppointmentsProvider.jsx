import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { coachBackend } from '../lib/coachBackend'
import {
  APPOINTMENT_RPC_STATUS,
  createEmptyAppointmentDiagnostics,
  extractSupabaseError,
  userIdSuffix,
} from '../lib/athleteAppointmentDiagnostics'
import {
  classifyAthleteAppointmentFetchError,
  logAppointmentReadDiagnostics,
  nextUpcomingAppointmentFromRpc,
  normalizeAthleteAppointmentsFromRpc,
  parseAthleteScheduledSessionsRpc,
  upcomingAppointmentsFromRpc,
} from '../lib/athleteAppointments'
import {
  installAthleteAppointmentDevTrace,
  logAthleteClientCheckpoint,
  logAthleteRpcCheckpoint,
  resolveAuthenticatedUserId,
} from '../lib/athleteAppointmentTrace'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { AthleteAppointmentsContext } from './athleteAppointmentsContext'

export function AthleteAppointmentsProvider({ userId = null, children }) {
  const [appointments, setAppointments] = useState([])
  const [status, setStatus] = useState(userId ? 'loading' : 'idle')
  const [error, setError] = useState(null)
  const [diagnostics, setDiagnostics] = useState(createEmptyAppointmentDiagnostics())
  const fetchTicket = useRef(0)
  const userIdRef = useRef(userId)

  useEffect(() => {
    userIdRef.current = userId
  }, [userId])

  useEffect(() => {
    installAthleteAppointmentDevTrace()
  }, [])

  useEffect(() => {
    fetchTicket.current += 1
    setAppointments([])
    setError(null)
    setStatus(userId ? 'loading' : 'idle')
    setDiagnostics(createEmptyAppointmentDiagnostics())
  }, [userId])

  const refreshAppointments = useCallback(async ({ force = false } = {}) => {
    const scopedUserId = userIdRef.current
    const ticket = ++fetchTicket.current
    const nowIso = new Date().toISOString()

    if (!scopedUserId) {
      setAppointments([])
      setStatus('idle')
      setError(null)
      setDiagnostics(createEmptyAppointmentDiagnostics())
      return []
    }

    const authUserId = await resolveAuthenticatedUserId()
    if (!authUserId) {
      setAppointments([])
      setStatus('idle')
      setError(null)
      setDiagnostics((current) => ({
        ...current,
        authUserPresent: false,
        userIdSuffix: userIdSuffix(scopedUserId),
        authSynced: false,
        rpcRequested: false,
        rpcStatus: APPOINTMENT_RPC_STATUS.IDLE,
        currentInstant: nowIso,
      }))
      return []
    }

    setStatus('loading')
    setDiagnostics((current) => ({
      ...current,
      authUserPresent: true,
      userIdSuffix: userIdSuffix(scopedUserId),
      authSynced: authUserId === scopedUserId,
      rpcRequested: true,
      rpcStatus: APPOINTMENT_RPC_STATUS.LOADING,
      currentInstant: nowIso,
      lastFetchAt: nowIso,
    }))

    logAthleteClientCheckpoint({
      fetchStarted: true,
      fetchSucceeded: false,
      resultCount: 0,
      nextAppointmentPresent: false,
      stateStatus: 'loading',
      authSynced: null,
    })

    try {
      const rows = await coachBackend.listAthleteScheduledSessions({
        expectedUserId: scopedUserId,
      })

      if (ticket !== fetchTicket.current) return []

      const parsedCount = parseAthleteScheduledSessionsRpc(rows).length
      logAppointmentReadDiagnostics(rows, { source: 'athlete_appointments_provider' })
      const normalized = normalizeAthleteAppointmentsFromRpc(rows)
      const upcoming = upcomingAppointmentsFromRpc(normalized)
      const nextAppointment = nextUpcomingAppointmentFromRpc(normalized)
      const authSynced = authUserId === scopedUserId

      setAppointments(normalized)
      setError(null)
      setStatus('ready')

      setDiagnostics({
        authUserPresent: Boolean(authUserId),
        userIdSuffix: userIdSuffix(scopedUserId),
        rpcRequested: true,
        rpcStatus: APPOINTMENT_RPC_STATUS.SUCCESS,
        rpcResultCount: parsedCount,
        normalizedCount: normalized.length,
        canonicalCount: normalized.length,
        futureFilterCount: upcoming.length,
        nextAppointmentPresent: Boolean(nextAppointment),
        errorCode: null,
        errorCategory: null,
        errorMessage: null,
        authSynced,
        lastFetchAt: nowIso,
        currentInstant: nowIso,
      })

      logAthleteRpcCheckpoint({
        authUserId,
        expectedUserId: scopedUserId,
        rpcOk: true,
        rawData: rows,
        error: null,
      })

      logAthleteClientCheckpoint({
        fetchStarted: true,
        fetchSucceeded: true,
        resultCount: normalized.length,
        nextAppointmentPresent: Boolean(nextAppointment),
        stateStatus: 'ready',
        authSynced: true,
      })

      return normalized
    } catch (err) {
      if (ticket !== fetchTicket.current) return []

      const classified = classifyAthleteAppointmentFetchError(err)
      const supabaseError = extractSupabaseError(err)

      if (import.meta.env.DEV) {
        console.warn('[appointment-read]', {
          source: 'athlete_appointments_provider',
          category: classified.category,
          error: classified.devMessage,
          code: supabaseError.code,
          details: supabaseError.details,
          hint: supabaseError.hint,
        })
      }

      setAppointments([])
      setError(classified)
      setStatus('error')
      setDiagnostics((current) => ({
        ...current,
        rpcRequested: true,
        rpcStatus: APPOINTMENT_RPC_STATUS.ERROR,
        rpcResultCount: 0,
        normalizedCount: 0,
        canonicalCount: 0,
        futureFilterCount: 0,
        nextAppointmentPresent: false,
        errorCode: supabaseError.code ?? classified.category,
        errorCategory: classified.category,
        errorMessage: supabaseError.message ?? classified.devMessage,
        errorDetails: supabaseError.details ?? null,
        errorHint: supabaseError.hint ?? null,
        errorFriendlyMessage: supabaseError.friendlyMessage ?? null,
        currentInstant: nowIso,
        lastFetchAt: nowIso,
      }))

      logAthleteClientCheckpoint({
        fetchStarted: true,
        fetchSucceeded: false,
        resultCount: 0,
        nextAppointmentPresent: false,
        stateStatus: 'error',
        authSynced: null,
      })

      return []
    }
  }, [userId])

  useEffect(() => {
    refreshAppointments()
  }, [refreshAppointments])

  useEffect(() => {
    if (!userId || !isSupabaseConfigured || !supabase) return undefined

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const authUserId = session?.user?.id ?? null
      if (authUserId && authUserId === userIdRef.current) {
        refreshAppointments({ force: true })
      } else if (!authUserId) {
        setAppointments([])
        setStatus('idle')
        setError(null)
        setDiagnostics(createEmptyAppointmentDiagnostics())
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [userId, refreshAppointments])

  useEffect(() => {
    if (!userId) return undefined

    const refetchOnFocus = () => {
      if (document.visibilityState === 'visible') {
        refreshAppointments({ force: true })
      }
    }

    document.addEventListener('visibilitychange', refetchOnFocus)
    window.addEventListener('focus', () => refreshAppointments({ force: true }))

    return () => {
      document.removeEventListener('visibilitychange', refetchOnFocus)
      window.removeEventListener('focus', refreshAppointments)
    }
  }, [userId, refreshAppointments])

  const value = useMemo(() => {
    const upcomingAppointments = upcomingAppointmentsFromRpc(appointments)
    const nextAppointment = nextUpcomingAppointmentFromRpc(appointments)

    return {
      status,
      loading: status === 'loading',
      ready: status === 'ready',
      error,
      appointments,
      upcomingAppointments,
      nextAppointment,
      diagnostics,
      refreshAppointments,
      reload: refreshAppointments,
      userId,
    }
  }, [appointments, diagnostics, error, refreshAppointments, status, userId])

  return (
    <AthleteAppointmentsContext.Provider value={value}>
      {children}
    </AthleteAppointmentsContext.Provider>
  )
}
