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

const applySubmissionState = (saved, hasCoach = true, athleteId = null) => {
  const record = saved ?? null
  const weekStart = getCoachWeekRange().weekStart
  return {
    record,
    status: getWeeklyCheckInStatus({
      hasCoach,
      submission: record,
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
  const [loading, setLoading] = useState(false)
  const submittedWeekKeyRef = useRef(null)
  const activeUserIdRef = useRef(userId)

  const reconcileSubmittedRecord = useCallback((saved, hasCoach = true) => {
    const next = applySubmissionState(saved, hasCoach, userId)
    if (next.status?.submitted && next.status?.weekKey) {
      submittedWeekKeyRef.current = next.status.weekKey
      clearDevWeeklyCheckInDueOverride()
    }
    setWeeklyCheckInRecord(next.record)
    setWeeklyCheckInStatus(next.status)
    setLoading(false)
    return next
  }, [userId])

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
    if (!userId || !cloudReady) {
      submittedWeekKeyRef.current = null
      clearDevWeeklyCheckInDueOverride()
      setCapability(getWeeklyCheckInCapability())
      setWeeklyCheckInStatus(null)
      setWeeklyCheckInRecord(null)
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
        force: refreshKey > 0,
        source: 'athlete-home',
      })

      if (!active) return

      setCapability(nextCapability)

      if (!isWeeklyCheckInFeatureEnabled(nextCapability)) {
        setWeeklyCheckInRecord(null)
        setWeeklyCheckInStatus(null)
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
        const hasCoach = await weeklyCheckInBackend.hasCoachRelationship()
        const submission =
          await weeklyCheckInBackend.getCurrentWeeklyCheckIn()

        if (!active) return

        const next = applySubmissionState(submission, hasCoach, userId)
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
  }, [userId, cloudReady, refreshKey])

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
      const hasCoach = await weeklyCheckInBackend.hasCoachRelationship()
      const submission =
        await weeklyCheckInBackend.getCurrentWeeklyCheckIn()
      const next = applySubmissionState(submission, hasCoach, userId)
      submittedWeekKeyRef.current = null
      setWeeklyCheckInRecord(next.record)
      setWeeklyCheckInStatus(next.status)
      setLoading(false)
      return next
    } catch {
      submittedWeekKeyRef.current = null
      const hasCoach = await weeklyCheckInBackend
        .hasCoachRelationship()
        .catch(() => false)
      const next = applySubmissionState(null, hasCoach, userId)
      setWeeklyCheckInRecord(next.record)
      setWeeklyCheckInStatus(next.status)
      setLoading(false)
      return next
    }
  }, [userId])

  return {
    capability,
    weeklyCheckInEnabled: isWeeklyCheckInFeatureEnabled(capability),
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
