import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildAvaContextPacket } from '../lib/avaContext'
import { createAvaSession } from '../lib/avaConversation'
import {
  preserveCoachSessionContext,
  restoreCoachSessionContext,
} from './avaRuntimeContext'
import { createNutritionState } from '../lib/nutrition'
import { coachBackend } from '../lib/coachBackend'
import { useAthleteAppointmentsContext } from '../context/athleteAppointmentsContext'
import AvaEntryButton from './AvaEntryButton'
import AvaSheet from './AvaSheet'
import { AvaUiContext } from './avaUiReactContext'

export function AvaUiProvider({
  children,
  enabled = true,
  showFloatingEntry = true,
  appState = null,
  userName = '',
  onAvaAction,
  actionRuntime = null,
  nutrition = createNutritionState(),
  onNutritionChange,
  coachContext = null,
  role = 'athlete',
  weeklyCheckInRequired = false,
  weeklyCheckInState = null,
}) {
  const [open, setOpen] = useState(false)
  const [assignments, setAssignments] = useState([])
  const sessionRef = useRef(createAvaSession())
  const appointmentContext = useAthleteAppointmentsContext()

  useEffect(() => {
    coachBackend
      .listAthleteAssignments()
      .then(setAssignments)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (open && role !== 'coach') {
      appointmentContext?.refreshAppointments?.()
    }
  }, [appointmentContext, open, role])

  useEffect(() => {
    if (!open || !appState?.sessionExecutionPlan) return
    sessionRef.current.sessionExecutionPlan = appState.sessionExecutionPlan
  }, [open, appState?.sessionExecutionPlan])

  const packet = useMemo(() => {
    if (!appState) return null

    try {
      return {
        ...buildAvaContextPacket(
          {
            ...appState,
            nutrition: nutrition ?? appState.nutrition,
          },
          {
            userName,
            assignments,
            now: new Date(),
            weeklyCheckInRequired,
            weeklyCheckInState,
          },
        ),
        athleteAppointments: appointmentContext?.appointments ?? [],
        athleteAppointmentsReady: appointmentContext?.ready ?? false,
        athleteAppointmentsLoading: appointmentContext?.loading ?? false,
      }
    } catch (error) {
      console.error('[ava-context] Failed to build athlete AVA packet:', error)
      return null
    }
  }, [
    appState,
    nutrition,
    userName,
    assignments,
    open,
    appointmentContext?.appointments,
    appointmentContext?.ready,
    appointmentContext?.loading,
    appointmentContext?.userId,
    weeklyCheckInRequired,
    weeklyCheckInState,
  ])

  const openAva = useCallback(() => {
    if (!enabled) return
    setOpen(true)
  }, [enabled])

  const closeAva = useCallback(() => {
    setOpen(false)
    const preservedCoachContext = preserveCoachSessionContext(sessionRef.current)
    const nextSession = createAvaSession()
    restoreCoachSessionContext(nextSession, preservedCoachContext)
    sessionRef.current = nextSession
  }, [])

  const dismissAvaSheet = useCallback(() => {
    setOpen(false)
  }, [])

  useEffect(() => {
    if (!enabled) {
      setOpen(false)
    }
  }, [enabled])

  const handleNutritionChange = useCallback(
    (nextNutrition) => {
      onNutritionChange?.(nextNutrition)
    },
    [onNutritionChange],
  )

  const value = useMemo(
    () => ({
      openAva,
      closeAva,
      dismissAvaSheet,
      isOpen: open && enabled,
      packet,
    }),
    [closeAva, dismissAvaSheet, enabled, open, openAva, packet],
  )

  return (
    <AvaUiContext.Provider value={value}>
      {children}
      {enabled && showFloatingEntry && (
        <AvaEntryButton onOpen={openAva} />
      )}
      <AvaSheet
        open={open && enabled}
        onClose={closeAva}
        onDismissAfterNavigation={dismissAvaSheet}
        nutrition={nutrition}
        onNutritionChange={handleNutritionChange}
        packet={packet}
        session={sessionRef.current}
        appHistory={appState?.history ?? []}
        onAvaAction={onAvaAction}
        actionRuntime={actionRuntime}
        coachContext={coachContext}
        role={role}
      />
    </AvaUiContext.Provider>
  )
}
