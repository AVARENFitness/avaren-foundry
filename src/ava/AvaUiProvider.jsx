import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildAvaContextPacket } from '../lib/avaContext'
import { createAvaSession } from '../lib/avaConversation'
import { createNutritionState } from '../lib/nutrition'
import { coachBackend } from '../lib/coachBackend'
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
}) {
  const [open, setOpen] = useState(false)
  const [assignments, setAssignments] = useState([])
  const sessionRef = useRef(createAvaSession())

  useEffect(() => {
    coachBackend
      .listAthleteAssignments()
      .then(setAssignments)
      .catch(() => {})
  }, [])

  const packet = useMemo(() => {
    if (!appState) return null

    return buildAvaContextPacket(
      {
        ...appState,
        nutrition: nutrition ?? appState.nutrition,
      },
      {
        userName,
        assignments,
        now: new Date(),
      },
    )
  }, [appState, nutrition, userName, assignments, open])

  const openAva = useCallback(() => {
    if (!enabled) return
    setOpen(true)
  }, [enabled])

  const closeAva = useCallback(() => {
    setOpen(false)
    sessionRef.current = createAvaSession()
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
