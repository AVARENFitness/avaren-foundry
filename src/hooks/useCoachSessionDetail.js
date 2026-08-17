import { useCallback, useEffect, useMemo, useState } from 'react'
import { appUi } from '../lib/appUi'
import { coachBackend } from '../lib/coachBackend'
import { addDaysKey } from '../lib/appointmentScheduling'
import {
  cancelScheduledSession,
  markScheduledSessionMissed,
  normalizeScheduledSession,
  SCHEDULED_SESSION_STATUS,
} from '../lib/coachScheduledSessions'
import {
  emptySessionPackage,
  normalizeSessionPackage,
} from '../lib/sessionPackages'
import {
  indexLedgerBySessionId,
  normalizePassBalanceViewRow,
  normalizePassLedgerEntry,
  normalizePassSelectionCandidates,
  passUsageResultUserMessage,
  resolvePassCandidateId,
  resolveSessionPassDebitState,
  summarizeClientPasses,
} from '../lib/coachPass'
import {
  buildPassCompletionForensics,
  buildPassSelectionForensics,
  logPassCompletionForensics,
  logPassSelectionForensics,
} from '../lib/coachPassForensics'
import { buildSessionLinkageForensics } from '../lib/coachBusinessClientLinkage'
import {
  mapAppointmentOverlapError,
  mapRecurrenceConflictError,
} from '../lib/coachingAppointment'
import {
  RECURRENCE_SCOPE,
  buildThisAndFutureSchedulePatch,
  canApplyThisAndFutureScheduleChange,
  isRecurringSession,
} from '../lib/recurringAppointments'

const UPCOMING_HORIZON_DAYS = 56

const defaultRescheduleDraft = {
  sessionDate: '',
  startTime: '',
  durationMinutes: '60',
  assignmentId: null,
  locationType: 'default',
  locationName: '',
}

export function useCoachSessionDetail({
  clients = [],
  assignments = [],
  onOpenClientProfile,
  onMutated,
  sessions: controlledSessions,
  setSessions: controlledSetSessions,
  onLoadSessions,
} = {}) {
  const [internalSessions, setInternalSessions] = useState([])
  const isControlled = typeof controlledSetSessions === 'function'
  const sessions = isControlled ? (controlledSessions ?? []) : internalSessions
  const setSessions = isControlled ? controlledSetSessions : setInternalSessions

  const [activeSession, setActiveSession] = useState(null)
  const [passSelection, setPassSelection] = useState(null)
  const [missedChargeSession, setMissedChargeSession] = useState(null)
  const [passActionBusy, setPassActionBusy] = useState(false)
  const [rescheduleMode, setRescheduleMode] = useState(false)
  const [rescheduleDraft, setRescheduleDraft] = useState(defaultRescheduleDraft)
  const [completingSessionId, setCompletingSessionId] = useState(null)
  const [passSummaries, setPassSummaries] = useState({})
  const [packages, setPackages] = useState({})
  const [ledgerBySessionId, setLedgerBySessionId] = useState({})
  const [recurrenceScopePrompt, setRecurrenceScopePrompt] = useState(null)

  const clientByAthleteId = useMemo(
    () => Object.fromEntries(clients.map((client) => [client.athlete_id, client])),
    [clients],
  )

  const loadPassSummaries = useCallback(async () => {
    const entries = await Promise.all(
      clients.map(async (client) => {
        const businessClientId =
          client.business_client_id ?? client.businessClientId
        if (!businessClientId) {
          return [client.athlete_id, summarizeClientPasses([])]
        }

        try {
          const rows = await coachBackend.listClientPassBalances(businessClientId)
          const passes = (rows ?? [])
            .map(normalizePassBalanceViewRow)
            .filter(Boolean)
          return [client.athlete_id, summarizeClientPasses(passes)]
        } catch {
          return [client.athlete_id, summarizeClientPasses([])]
        }
      }),
    )
    setPassSummaries(Object.fromEntries(entries))
  }, [clients])

  const loadPackages = useCallback(async () => {
    const entries = await Promise.all(
      clients.map(async (client) => {
        try {
          const row = await coachBackend.getSessionPackage(client.athlete_id)
          return [client.athlete_id, normalizeSessionPackage(row)]
        } catch {
          return [client.athlete_id, emptySessionPackage()]
        }
      }),
    )
    setPackages(Object.fromEntries(entries))
  }, [clients])

  const loadSessionsInternal = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10)
    try {
      const rows = await coachBackend.listScheduledSessions({
        startDate: today,
        endDate: addDaysKey(today, UPCOMING_HORIZON_DAYS),
      })
      setInternalSessions(rows.map(normalizeScheduledSession).filter(Boolean))
    } catch {
      setInternalSessions([])
    }
  }, [])

  const loadSessions = onLoadSessions ?? loadSessionsInternal

  useEffect(() => {
    loadPassSummaries()
    loadPackages()
  }, [loadPassSummaries, loadPackages])

  useEffect(() => {
    if (!isControlled) {
      loadSessionsInternal()
    }
  }, [isControlled, loadSessionsInternal])

  useEffect(() => {
    if (!activeSession) return
    const fresh = sessions.find((item) => item.id === activeSession.id)
    if (!fresh) return

    const changed =
      fresh.status !== activeSession.status ||
      fresh.rsvpStatus !== activeSession.rsvpStatus ||
      fresh.sessionDate !== activeSession.sessionDate ||
      fresh.startTime !== activeSession.startTime ||
      fresh.completedAt !== activeSession.completedAt

    if (changed) setActiveSession(fresh)
  }, [sessions, activeSession])

  useEffect(() => {
    if (!activeSession || import.meta.env?.DEV !== true) return

    const client = clientByAthleteId[activeSession.athleteId]
    const linkage = buildSessionLinkageForensics({
      ...activeSession,
      businessClientId:
        activeSession.businessClientId ??
        client?.business_client_id ??
        client?.businessClientId ??
        null,
    })

    if (
      activeSession.status === SCHEDULED_SESSION_STATUS.COMPLETED &&
      !linkage.businessClientIdPresent
    ) {
      console.debug('[coach-appointment-linkage]', linkage)
    }
  }, [activeSession, clientByAthleteId])

  useEffect(() => {
    const client = activeSession
      ? clientByAthleteId[activeSession.athleteId]
      : null
    const businessClientId =
      activeSession?.businessClientId ??
      client?.business_client_id ??
      client?.businessClientId ??
      null

    if (!businessClientId || activeSession?.status !== SCHEDULED_SESSION_STATUS.COMPLETED) {
      if (!activeSession) setLedgerBySessionId({})
      return undefined
    }

    let active = true
    coachBackend
      .listClientPassLedger(businessClientId, 200)
      .then((rows) => {
        if (!active) return
        setLedgerBySessionId(
          indexLedgerBySessionId(
            (rows ?? []).map(normalizePassLedgerEntry).filter(Boolean),
          ),
        )
      })
      .catch(() => {
        if (active) setLedgerBySessionId({})
      })

    return () => {
      active = false
    }
  }, [
    activeSession?.id,
    activeSession?.status,
    activeSession?.athleteId,
    activeSession?.businessClientId,
    clientByAthleteId,
  ])

  const passSummaryFor = useCallback(
    (athleteId) => passSummaries[athleteId] ?? summarizeClientPasses([]),
    [passSummaries],
  )

  const packageFor = useCallback(
    (athleteId) => packages[athleteId] ?? emptySessionPackage(),
    [packages],
  )

  const closeDetail = useCallback(() => {
    setActiveSession(null)
    setRescheduleMode(false)
  }, [])

  const openSession = useCallback((session) => {
    setActiveSession(session)
    setRescheduleMode(false)
  }, [])

  const reloadLedgerForAthlete = useCallback(
    async (athleteId) => {
      const client = clientByAthleteId[athleteId]
      const businessClientId =
        client?.business_client_id ?? client?.businessClientId ?? null
      if (!businessClientId) {
        setLedgerBySessionId({})
        return
      }

      try {
        const rows = await coachBackend.listClientPassLedger(businessClientId, 200)
        setLedgerBySessionId(
          indexLedgerBySessionId(
            (rows ?? []).map(normalizePassLedgerEntry).filter(Boolean),
          ),
        )
      } catch {
        setLedgerBySessionId({})
      }
    },
    [clientByAthleteId],
  )

  const refreshAfterPassAction = useCallback(
    async (athleteId) => {
      await Promise.all([
        loadSessions(),
        loadPassSummaries(),
        loadPackages(),
        reloadLedgerForAthlete(athleteId),
      ])
      if (athleteId && import.meta.env?.DEV) {
        console.debug('[coach-pass-complete]', {
          athleteId,
          summary: passSummaryFor(athleteId),
        })
      }
    },
    [loadSessions, loadPassSummaries, loadPackages, reloadLedgerForAthlete, passSummaryFor],
  )

  const notifyMutated = useCallback(async () => {
    await loadSessions()
    onMutated?.()
  }, [loadSessions, onMutated])

  const reportPassUsage = useCallback(
    ({ session, passResult, passUsageError, refreshCalled = false }) => {
      const summary = passSummaryFor(session?.athleteId)
      logPassCompletionForensics(
        buildPassCompletionForensics({
          session,
          passResult,
          passUsageError,
          attendanceUpdateCalled: true,
          attendanceUpdateSucceeded: session?.status === SCHEDULED_SESSION_STATUS.COMPLETED,
          passUsageCalled: true,
          passUsageRpcCalled: true,
          refreshCalled,
          activePassCount: summary.activeCount,
          eligiblePassCount: passResult?.candidates?.length ?? null,
        }),
      )
    },
    [passSummaryFor],
  )

  const applyPassUsageResult = useCallback(
    async (session, passResult, { afterComplete = false } = {}) => {
      if (passResult.passSelectionRequired) {
        setPassSelection({
          session,
          candidates: normalizePassSelectionCandidates(passResult.candidates ?? []),
          mode: 'complete',
        })
        appUi.toast(
          afterComplete
            ? 'Session completed. Choose a pass to debit.'
            : 'Choose a pass to debit.',
          'info',
        )
        await refreshAfterPassAction(session.athleteId)
        return { handled: true }
      }

      if (!passResult.ok && passResult.error) {
        appUi.toast(
          afterComplete
            ? 'Session completed. Pass debit needs attention.'
            : passUsageResultUserMessage(passResult),
          afterComplete ? 'info' : 'error',
        )
        await refreshAfterPassAction(session.athleteId)
        return { handled: true }
      }

      if (passResult.noPass) {
        appUi.toast(
          afterComplete
            ? 'Session completed. No eligible training pass for this date.'
            : 'No eligible training pass for this session date.',
          'info',
        )
      } else if (passResult.unchanged) {
        appUi.toast('Pass already applied.', 'info')
      } else if (afterComplete) {
        appUi.toast('Session completed.', 'success')
      } else {
        appUi.toast('1 session applied', 'success')
      }

      await refreshAfterPassAction(session.athleteId)
      await notifyMutated()
      return { handled: true }
    },
    [refreshAfterPassAction, notifyMutated],
  )

  const handlePassSelection = useCallback(
    async (passIdOrCandidate) => {
      const session = passSelection?.session
      if (!session?.id) return

      const selectedPassId = resolvePassCandidateId(passIdOrCandidate)
      const matchingCandidate = (passSelection.candidates ?? []).find(
        (candidate) => resolvePassCandidateId(candidate) === selectedPassId,
      )

      if (!selectedPassId) {
        logPassSelectionForensics(
          buildPassSelectionForensics({
            session,
            passId: selectedPassId,
            candidate: matchingCandidate ?? passIdOrCandidate,
            passResult: { ok: false, error: 'pass_id_required' },
          }),
        )
        appUi.toast('Select a training pass to continue.', 'error')
        return
      }

      setPassActionBusy(true)
      try {
        const sessionId = session.id
        logPassSelectionForensics(
          buildPassSelectionForensics({
            session,
            passId: selectedPassId,
            candidate: matchingCandidate ?? passIdOrCandidate,
          }),
        )

        const result =
          passSelection.mode === 'missed'
            ? await coachBackend.recordMissedSessionPassCharge(sessionId, selectedPassId)
            : await coachBackend.recordCompletedSessionPassUsage(sessionId, selectedPassId)

        logPassSelectionForensics(
          buildPassSelectionForensics({
            session,
            passId: selectedPassId,
            candidate: matchingCandidate ?? passIdOrCandidate,
            passResult: result,
          }),
        )

        if (result.passSelectionRequired) {
          setPassSelection((current) => ({
            ...current,
            session,
            candidates: normalizePassSelectionCandidates(
              result.candidates ?? current?.candidates ?? [],
            ),
            mode: current?.mode ?? 'complete',
          }))
          appUi.toast(passUsageResultUserMessage(result), 'info')
          return
        }

        if (!result.ok) {
          appUi.toast(passUsageResultUserMessage(result), 'error')
          reportPassUsage({
            session,
            passResult: result,
            passUsageError: result.error ?? result.message,
          })
          return
        }

        setPassSelection(null)
        reportPassUsage({
          session,
          passResult: result,
          refreshCalled: true,
        })
        await refreshAfterPassAction(session.athleteId)

        if (result.unchanged) {
          appUi.toast('Pass already applied.', 'info')
        } else {
          appUi.toast(
            passSelection.mode === 'missed'
              ? 'Missed session charged.'
              : '1 session applied',
            'success',
          )
        }
        await notifyMutated()
      } catch (error) {
        logPassSelectionForensics(
          buildPassSelectionForensics({
            session,
            passId: selectedPassId,
            candidate: matchingCandidate ?? passIdOrCandidate,
            rpcError: error,
            passResult: { ok: false, error: 'pass_action_failed', devMessage: error.message },
          }),
        )
        appUi.toast(
          passUsageResultUserMessage({
            error: 'pass_action_failed',
            devMessage: error.message,
          }),
          'error',
        )
      } finally {
        setPassActionBusy(false)
      }
    },
    [passSelection, refreshAfterPassAction, notifyMutated, reportPassUsage],
  )

  const handleApplyPassDebit = useCallback(
    async (session) => {
      if (!session?.id || session.status !== SCHEDULED_SESSION_STATUS.COMPLETED) {
        return
      }

      setPassActionBusy(true)
      try {
        const passResult = await coachBackend.recordCompletedSessionPassUsage(
          session.id,
          null,
        )
        reportPassUsage({ session, passResult })
        await applyPassUsageResult(session, passResult)
      } catch (error) {
        reportPassUsage({
          session,
          passResult: null,
          passUsageError: error.message,
        })
        appUi.toast(
          passUsageResultUserMessage({
            error: 'pass_action_failed',
            devMessage: error.message,
          }),
          'error',
        )
      } finally {
        setPassActionBusy(false)
      }
    },
    [applyPassUsageResult, reportPassUsage],
  )

  const handleComplete = useCallback(
    async (session, passId = null) => {
      if (
        completingSessionId === session.id ||
        session.status !== SCHEDULED_SESSION_STATUS.SCHEDULED
      ) {
        return
      }

      setCompletingSessionId(session.id)

      try {
        const { session: savedRow, passResult } =
          await coachBackend.completeInPersonAppointment(session.id, { passId })

        const savedSession = normalizeScheduledSession(savedRow)
        setSessions((current) =>
          current.map((item) => (item.id === session.id ? savedSession : item)),
        )
        setActiveSession(savedSession)

        reportPassUsage({ session: savedSession, passResult })

        if (passResult.passSelectionRequired) {
          await applyPassUsageResult(savedSession, passResult, { afterComplete: true })
          return
        }

        if (!passResult.ok && passResult.error) {
          await applyPassUsageResult(savedSession, passResult, { afterComplete: true })
          return
        }

        if (passResult.noPass) {
          appUi.toast(
            'Session completed. No eligible training pass for this date.',
            'info',
          )
        } else if (passResult.unchanged) {
          appUi.toast('Session already recorded.', 'info')
        } else {
          appUi.toast('Session completed.', 'success')
        }

        reportPassUsage({
          session: savedSession,
          passResult,
          refreshCalled: true,
        })
        await refreshAfterPassAction(session.athleteId)
        await notifyMutated()
      } catch (error) {
        appUi.toast(error.message ?? 'Could not complete session.', 'error')
      } finally {
        setCompletingSessionId(null)
      }
    },
    [completingSessionId, setSessions, refreshAfterPassAction, notifyMutated, reportPassUsage, applyPassUsageResult],
  )

  const handleMarkMissed = useCallback(
    async (session) => {
      const result = markScheduledSessionMissed(session)
      if (!result.ok) return

      try {
        const saved = normalizeScheduledSession(
          await coachBackend.markInPersonAppointmentMissed(session.id),
        )
        setSessions((current) =>
          current.map((item) => (item.id === session.id ? saved : item)),
        )
        setActiveSession(saved)
        setMissedChargeSession(saved)
        await notifyMutated()
      } catch (error) {
        appUi.toast(error.message ?? 'Could not mark session missed.', 'error')
      }
    },
    [setSessions, notifyMutated],
  )

  const handleMissedNoCharge = useCallback(async () => {
    if (!missedChargeSession?.id) return
    setPassActionBusy(true)
    try {
      await coachBackend.setMissedSessionChargeDecision(
        missedChargeSession.id,
        'no_charge',
      )
      setMissedChargeSession(null)
      appUi.toast('Missed session recorded. No charge applied.', 'success')
      await refreshAfterPassAction(missedChargeSession.athleteId)
      await notifyMutated()
    } catch (error) {
      appUi.toast(error.message ?? 'Could not save missed decision.', 'error')
    } finally {
      setPassActionBusy(false)
    }
  }, [missedChargeSession, refreshAfterPassAction, notifyMutated])

  const handleMissedCharge = useCallback(async () => {
    if (!missedChargeSession?.id) return
    setPassActionBusy(true)
    try {
      const result = await coachBackend.setMissedSessionChargeDecision(
        missedChargeSession.id,
        'charge',
      )

      if (result.passSelectionRequired) {
        setPassSelection({
          session: missedChargeSession,
          candidates: normalizePassSelectionCandidates(result.candidates ?? []),
          mode: 'missed',
        })
        setMissedChargeSession(null)
        return
      }

      if (result.noPass || result.requiresCoachResolution) {
        appUi.toast('Missed recorded. No pass available to charge.', 'info')
        setMissedChargeSession(null)
        await notifyMutated()
        return
      }

      if (!result.ok) {
        appUi.toast(result.message ?? 'Could not charge missed session.', 'error')
        return
      }

      setMissedChargeSession(null)
      appUi.toast('Missed session charged.', 'success')
      await refreshAfterPassAction(missedChargeSession.athleteId)
      await notifyMutated()
    } catch (error) {
      appUi.toast(error.message ?? 'Could not charge missed session.', 'error')
    } finally {
      setPassActionBusy(false)
    }
  }, [missedChargeSession, refreshAfterPassAction, notifyMutated])

  const handleCancel = useCallback(
    async (session) => {
      if (isRecurringSession(session)) {
        setRecurrenceScopePrompt({ action: 'cancel', session })
        return
      }

      const result = cancelScheduledSession(session)
      if (!result.ok) return

      try {
        const saved = normalizeScheduledSession(
          await coachBackend.updateScheduledSession(session.id, {
            status: SCHEDULED_SESSION_STATUS.CANCELLED,
          }),
        )
        setSessions((current) =>
          current.map((item) => (item.id === session.id ? saved : item)),
        )
        closeDetail()
        appUi.toast('Session cancelled.', 'success')
        await notifyMutated()
      } catch (error) {
        appUi.toast(error.message ?? 'Could not cancel session.', 'error')
      }
    },
    [setSessions, closeDetail, notifyMutated],
  )

  const applyRecurrenceScope = useCallback(
    async (scope) => {
      const prompt = recurrenceScopePrompt
      if (!prompt?.session) return

      try {
        if (prompt.action === 'cancel') {
          if (scope === RECURRENCE_SCOPE.THIS_AND_FUTURE) {
            await coachBackend.cancelRecurringAppointmentSeriesFuture(prompt.session.id)
            await onLoadSessions?.()
          } else {
            const saved = normalizeScheduledSession(
              await coachBackend.cancelRecurringAppointmentOccurrence(
                prompt.session.id,
              ),
            )
            setSessions((current) =>
              current.map((item) => (item.id === saved.id ? saved : item)),
            )
          }

          closeDetail()
          appUi.toast('Session cancelled.', 'success')
          await notifyMutated()
        }

        if (prompt.action === 'reschedule' && prompt.patch) {
          if (
            scope === RECURRENCE_SCOPE.THIS_AND_FUTURE &&
            !canApplyThisAndFutureScheduleChange({
              originalSessionDate: prompt.session.sessionDate,
              nextSessionDate: prompt.patch.sessionDate,
            })
          ) {
            appUi.toast(
              'Changing the date for all future sessions is not supported. Use This appointment, or change time and duration only.',
              'error',
            )
            return
          }

          const futurePatch =
            scope === RECURRENCE_SCOPE.THIS_AND_FUTURE
              ? buildThisAndFutureSchedulePatch({
                  originalSessionDate: prompt.session.sessionDate,
                  startTime: prompt.patch.startTime,
                  durationMinutes: prompt.patch.durationMinutes,
                })
              : prompt.patch

          const saved =
            scope === RECURRENCE_SCOPE.THIS_AND_FUTURE
              ? await coachBackend.updateRecurringAppointmentSeriesFuture(
                  prompt.session.id,
                  futurePatch,
                )
              : normalizeScheduledSession(
                  await coachBackend.updateRecurringAppointmentOccurrence(
                    prompt.session.id,
                    prompt.patch,
                  ),
                )

          if (scope === RECURRENCE_SCOPE.THIS_ONLY && saved?.id) {
            setSessions((current) =>
              current.map((item) => (item.id === saved.id ? saved : item)),
            )
            setActiveSession(saved)
          } else {
            await onLoadSessions?.()
          }

          setRescheduleMode(false)
          appUi.toast('Session rescheduled.', 'success')
          await notifyMutated()
        }
      } catch (error) {
        const recurrenceConflict = mapRecurrenceConflictError(error)
        const overlap = mapAppointmentOverlapError(error)
        appUi.toast(
          recurrenceConflict?.message ??
            overlap?.message ??
            error.message ??
            'Could not update session.',
          'error',
        )
      } finally {
        setRecurrenceScopePrompt(null)
      }
    },
    [
      recurrenceScopePrompt,
      setSessions,
      closeDetail,
      notifyMutated,
      onLoadSessions,
    ],
  )

  const handleReschedule = useCallback(
    async (session, patch) => {
      try {
        const saved = normalizeScheduledSession(
          await coachBackend.updateScheduledSession(
            session.id,
            {
              ...patch,
              scheduleTimezone: session.scheduleTimezone,
            },
            { existingSessions: sessions },
          ),
        )
        setSessions((current) =>
          current.map((item) => (item.id === session.id ? saved : item)),
        )
        setActiveSession(saved)
        setRescheduleMode(false)
        appUi.toast('Session rescheduled.', 'success')
        await notifyMutated()
      } catch (error) {
        const overlap = mapAppointmentOverlapError(error)
        appUi.toast(
          overlap?.message ?? error.message ?? 'Could not reschedule session.',
          'error',
        )
      }
    },
    [sessions, setSessions, notifyMutated],
  )

  const beginReschedule = useCallback((session) => {
    setRescheduleDraft({
      sessionDate: session.sessionDate,
      startTime: session.startTime,
      durationMinutes: String(session.durationMinutes ?? 60),
      assignmentId: session.assignmentId ?? null,
      locationType: session.locationType ?? 'default',
      locationName: session.locationName ?? '',
    })
    setRescheduleMode(true)
  }, [])

  const saveReschedule = useCallback(() => {
    if (!activeSession) return

    const patch = {
      sessionDate: rescheduleDraft.sessionDate,
      startTime: rescheduleDraft.startTime,
      durationMinutes: Number(rescheduleDraft.durationMinutes) || 60,
      assignmentId: rescheduleDraft.assignmentId,
      locationType: rescheduleDraft.locationType,
      locationName: rescheduleDraft.locationName,
    }

    if (isRecurringSession(activeSession)) {
      setRecurrenceScopePrompt({
        action: 'reschedule',
        session: activeSession,
        patch,
      })
      return
    }

    handleReschedule(activeSession, patch)
  }, [activeSession, rescheduleDraft, handleReschedule])

  const handleViewClient = useCallback(() => {
    const client = activeSession
      ? clientByAthleteId[activeSession.athleteId]
      : null
    onOpenClientProfile?.(client)
    closeDetail()
  }, [activeSession, clientByAthleteId, onOpenClientProfile, closeDetail])

  const activeClient = activeSession
    ? clientByAthleteId[activeSession.athleteId]
    : null
  const activePassSummary = activeSession
    ? passSummaryFor(activeSession.athleteId)
    : summarizeClientPasses([])

  const passDebitState = useMemo(
    () =>
      resolveSessionPassDebitState({
        session: activeSession,
        ledgerBySessionId,
        passSummary: activePassSummary,
      }),
    [activeSession, ledgerBySessionId, activePassSummary],
  )

  const closePassSelection = useCallback(() => {
    if (passSelection?.mode === 'complete') {
      appUi.toast('Pass debit pending. Choose a pass when ready.', 'info')
    }
    setPassSelection(null)
  }, [passSelection?.mode])

  return {
    activeSession,
    setActiveSession,
    openSession,
    closeDetail,
    activeClient,
    activePassSummary,
    rescheduleMode,
    rescheduleDraft,
    setRescheduleDraft,
    completingSessionId,
    assignments,
    beginReschedule,
    saveReschedule,
    handleViewClient,
    handleComplete,
    handleApplyPassDebit,
    handleCancel,
    handleMarkMissed,
    passDebitState,
    ledgerBySessionId,
    recurrenceScopePrompt,
    setRecurrenceScopePrompt,
    applyRecurrenceScope,
    passSelection,
    setPassSelection,
    closePassSelection,
    passActionBusy,
    handlePassSelection,
    missedChargeSession,
    setMissedChargeSession,
    handleMissedNoCharge,
    handleMissedCharge,
    passSummaryFor,
    packageFor,
  }
}
