import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getWeeklyCheckInStatus,
  resolveCurrentWeeklyCheckInState,
} from '../lib/weeklyCheckIn'
import {
  clearDevWeeklyCheckInDueOverride,
  isDevWeeklyCheckInDueOverrideActive,
} from '../lib/weeklyCheckInDev'
import { getCoachWeekRange } from '../lib/weeklyReview'
import {
  WEEKLY_CHECKIN_CAPABILITY_STATUS,
  getWeeklyCheckInCapability,
  isWeeklyCheckInFeatureEnabled,
  logWeeklyCheckInRuntimeDiagnostic,
  probeWeeklyCheckInCapability,
  resetWeeklyCheckInCapabilityCache,
} from '../lib/weeklyCheckInCapability'
import {
  resetWeeklyCheckInBackendCache,
  weeklyCheckInBackend,
} from '../lib/weeklyCheckInBackend'
import {
  isAthleteWeeklyCheckInRequired,
  resolveAthleteWeeklyCheckInSession,
} from '../lib/weeklyCheckInEligibility'

const applySubmissionState = (
  saved,
  obligationActive = false,
  athleteId = null,
  now = new Date(),
) => {
  const record = saved ?? null
  const weekStart = getCoachWeekRange(now).weekStart
  return {
    record,
    status: getWeeklyCheckInStatus({
      obligationActive,
      submission: record,
      now,
      devForceDue: isDevWeeklyCheckInDueOverrideActive(athleteId, weekStart),
    }),
  }
}

export function useWeeklyCheckInSession({
  userId = null,
  cloudReady = false,
  refreshKey = 0,
} = {}) {
  const [capability, setCapability] = useState(() =>
    getWeeklyCheckInCapability(),
  )
  const [weeklyCheckInStatus, setWeeklyCheckInStatus] = useState(null)
  const [weeklyCheckInRecord, setWeeklyCheckInRecord] = useState(null)
  const [weeklyCheckInRequired, setWeeklyCheckInRequired] = useState(false)
  const [loading, setLoading] = useState(false)
  const [visibilityRefresh, setVisibilityRefresh] = useState(0)
  const submittedWeekKeyRef = useRef(null)
  const activeUserIdRef = useRef(userId)

  const reconcileSubmittedRecord = useCallback(
    (saved, obligationActive = weeklyCheckInRequired) => {
      const next = applySubmissionState(saved, obligationActive, userId)
      if (next.status?.submitted && next.status?.weekKey) {
        submittedWeekKeyRef.current = next.status.weekKey
        clearDevWeeklyCheckInDueOverride()
      }
      setWeeklyCheckInRecord(next.record)
      setWeeklyCheckInStatus(next.status)
      setLoading(false)
      return next
    },
    [userId, weeklyCheckInRequired],
  )

  useEffect(() => {
    if (activeUserIdRef.current !== userId) {
      activeUserIdRef.current = userId
      submittedWeekKeyRef.current = null
      resetWeeklyCheckInBackendCache()
      resetWeeklyCheckInCapabilityCache()
      clearDevWeeklyCheckInDueOverride()
      setWeeklyCheckInStatus(null)
      setWeeklyCheckInRecord(null)
    }
  }, [userId])

  useEffect(() => {
    if (!userId || !cloudReady) return undefined

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setVisibilityRefresh((current) => current + 1)
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [userId, cloudReady])

  useEffect(() => {
    if (!userId || !cloudReady) {
      submittedWeekKeyRef.current = null
      clearDevWeeklyCheckInDueOverride()
      setCapability(getWeeklyCheckInCapability())
      setWeeklyCheckInStatus(null)
      setWeeklyCheckInRecord(null)
      setWeeklyCheckInRequired(false)
      setLoading(false)
      logWeeklyCheckInRuntimeDiagnostic({
        stage: 'idle',
        status: WEEKLY_CHECKIN_CAPABILITY_STATUS.UNKNOWN,
      })
      return undefined
    }

    let active = true
    setLoading(true)

    const load = async () => {
      logWeeklyCheckInRuntimeDiagnostic({
        stage: 'capability-probe',
        status: WEEKLY_CHECKIN_CAPABILITY_STATUS.CHECKING,
      })

      const nextCapability = await probeWeeklyCheckInCapability({
        force: refreshKey > 0 || visibilityRefresh > 0,
        source: 'athlete-home',
      })

      if (!active) return

      setCapability(nextCapability)

      if (!isWeeklyCheckInFeatureEnabled(nextCapability)) {
        setWeeklyCheckInRecord(null)
        setWeeklyCheckInStatus(null)
        setWeeklyCheckInRequired(false)
        setLoading(false)
        logWeeklyCheckInRuntimeDiagnostic({
          stage: 'feature-unavailable',
          status: nextCapability.status,
        })
        return
      }

      logWeeklyCheckInRuntimeDiagnostic({
        stage: 'status-load',
        status: nextCapability.status,
      })

      try {
        const requirements =
          await weeklyCheckInBackend.getAthleteCoachingRequirements()
        const checkInRequired = isAthleteWeeklyCheckInRequired(requirements)
        setWeeklyCheckInRequired(checkInRequired)

        const submission =
          await weeklyCheckInBackend.getCurrentWeeklyCheckIn()

        if (!active) return

        const { status: nextStatus } = resolveAthleteWeeklyCheckInSession({
          requirements,
          submission,
        })
        const next = {
          record: submission ?? null,
          status: nextStatus,
        }
        const pinnedWeekKey = submittedWeekKeyRef.current

        if (
          pinnedWeekKey &&
          next.status?.weekKey === pinnedWeekKey &&
          !next.status?.submitted &&
          !isDevWeeklyCheckInDueOverrideActive(userId, next.status?.weekKey)
        ) {
          setLoading(false)
          logWeeklyCheckInRuntimeDiagnostic({
            stage: 'preserve-submitted',
            status: nextCapability.status,
          })
          return
        }

        if (next.status?.submitted && next.status?.weekKey) {
          submittedWeekKeyRef.current = next.status.weekKey
        } else if (!next.status?.submitted) {
          submittedWeekKeyRef.current = null
        }

        setWeeklyCheckInRecord(next.record)
        setWeeklyCheckInStatus(next.status)
        setLoading(false)
        logWeeklyCheckInRuntimeDiagnostic({
          stage: 'ready',
          status: nextCapability.status,
          requirement: checkInRequired ? 'required' : 'not_required',
          checkInStatus: next.status?.status ?? null,
        })
      } catch {
        if (!active) return
        if (submittedWeekKeyRef.current) {
          setLoading(false)
          logWeeklyCheckInRuntimeDiagnostic({
            stage: 'preserve-submitted-after-error',
            status: nextCapability.status,
          })
          return
        }
        setWeeklyCheckInRecord(null)
        setWeeklyCheckInStatus(null)
        setWeeklyCheckInRequired(false)
        setLoading(false)
        logWeeklyCheckInRuntimeDiagnostic({
          stage: 'status-error',
          status: nextCapability.status,
        })
      }
    }

    load()

    return () => {
      active = false
    }
  }, [userId, cloudReady, refreshKey, visibilityRefresh])

  const currentWeeklyCheckInState = useMemo(
    () =>
      resolveCurrentWeeklyCheckInState({
        capability,
        status: weeklyCheckInStatus,
        loading: loading && Boolean(userId && cloudReady),
      }),
    [capability, weeklyCheckInStatus, loading, userId, cloudReady],
  )

  const saveWeeklyCheckIn = async (draft) => {
    const saved = await weeklyCheckInBackend.submitWeeklyCheckIn(draft)
    return reconcileSubmittedRecord(saved, true).record
  }

  const invalidateWeeklyCheckIn = useCallback(() => {
    submittedWeekKeyRef.current = null
    resetWeeklyCheckInBackendCache()
  }, [])

  const reconcileWeeklyCheckInAfterReset = useCallback(async () => {
    submittedWeekKeyRef.current = null
    resetWeeklyCheckInBackendCache()

    try {
      const requirements =
        await weeklyCheckInBackend.getAthleteCoachingRequirements()
      const checkInRequired = isAthleteWeeklyCheckInRequired(requirements)
      setWeeklyCheckInRequired(checkInRequired)

      const submission =
        await weeklyCheckInBackend.getCurrentWeeklyCheckIn()
      const { status } = resolveAthleteWeeklyCheckInSession({
        requirements,
        submission,
      })
      submittedWeekKeyRef.current = null
      setWeeklyCheckInRecord(submission ?? null)
      setWeeklyCheckInStatus(status)
      setLoading(false)
      return {
        record: submission ?? null,
        status,
        hasCoach: checkInRequired,
        weekStart: status?.weekKey ?? getCoachWeekRange().weekStart,
      }
    } catch {
      submittedWeekKeyRef.current = null
      const requirements =
        await weeklyCheckInBackend
          .getAthleteCoachingRequirements()
          .catch(() => null)
      const checkInRequired = isAthleteWeeklyCheckInRequired(requirements)
      setWeeklyCheckInRequired(checkInRequired)
      const next = applySubmissionState(null, checkInRequired, userId)
      setWeeklyCheckInRecord(next.record)
      setWeeklyCheckInStatus(next.status)
      setLoading(false)
      return {
        ...next,
        hasCoach: checkInRequired,
        weekStart: next.status?.weekKey ?? getCoachWeekRange().weekStart,
      }
    }
  }, [userId])

  return {
    capability,
    weeklyCheckInEnabled: isWeeklyCheckInFeatureEnabled(capability),
    weeklyCheckInRequired,
    weeklyCheckInStatus,
    weeklyCheckInRecord,
    currentWeeklyCheckInState,
    weeklyCheckInLoading: currentWeeklyCheckInState.loading,
    saveWeeklyCheckIn,
    reconcileSubmittedRecord,
    invalidateWeeklyCheckIn,
    reconcileWeeklyCheckInAfterReset,
  }
}
