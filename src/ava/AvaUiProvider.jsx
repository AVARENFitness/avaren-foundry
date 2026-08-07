import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { createNutritionState } from '../lib/nutrition'
import AvaEntryButton from './AvaEntryButton'
import AvaSheet from './AvaSheet'

const AvaUiContext = createContext(null)

export function AvaUiProvider({
  children,
  enabled = true,
  showFloatingEntry = true,
  nutrition = createNutritionState(),
  onNutritionChange,
}) {
  const [open, setOpen] = useState(false)
  const [undoSnapshot, setUndoSnapshot] = useState(null)

  const openAva = useCallback(() => {
    if (!enabled) return
    setOpen(true)
  }, [enabled])

  const closeAva = useCallback(() => {
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
      isOpen: open && enabled,
      undoSnapshot,
    }),
    [closeAva, enabled, open, openAva, undoSnapshot],
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
        nutrition={nutrition}
        onNutritionChange={handleNutritionChange}
        undoSnapshot={undoSnapshot}
        onUndoSnapshotChange={setUndoSnapshot}
      />
    </AvaUiContext.Provider>
  )
}

export function useAvaUi() {
  const context = useContext(AvaUiContext)

  if (!context) {
    throw new Error('useAvaUi must be used within an AvaUiProvider')
  }

  return context
}
