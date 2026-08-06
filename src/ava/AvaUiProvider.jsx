import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import AvaEntryButton from './AvaEntryButton'
import AvaSheet from './AvaSheet'

const AvaUiContext = createContext(null)

export function AvaUiProvider({ children, enabled = true }) {
  const [open, setOpen] = useState(false)

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

  const value = useMemo(
    () => ({
      openAva,
      closeAva,
      isOpen: open && enabled,
    }),
    [closeAva, enabled, open, openAva],
  )

  return (
    <AvaUiContext.Provider value={value}>
      {children}
      {enabled && <AvaEntryButton onOpen={openAva} />}
      <AvaSheet open={open && enabled} onClose={closeAva} />
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
