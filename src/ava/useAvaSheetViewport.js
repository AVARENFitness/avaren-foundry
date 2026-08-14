import { useCallback, useLayoutEffect, useState } from 'react'

export const MOBILE_SHEET_QUERY = '(max-width: 680px)'

export function useAvaSheetViewport({ open, panelRef }) {
  const [keyboardOpen, setKeyboardOpen] = useState(false)

  const applyViewportMetrics = useCallback(() => {
    const panel = panelRef.current
    if (!panel) return

    const mobile =
      typeof window.matchMedia === 'function' &&
      window.matchMedia(MOBILE_SHEET_QUERY).matches
    const viewport = window.visualViewport

    if (!mobile || !viewport) {
      panel.style.removeProperty('--ava-sheet-max-height')
      setKeyboardOpen((current) => (current ? false : current))
      return
    }

    const visibleHeight = viewport.height
    const keyboard =
      visibleHeight < window.innerHeight * 0.82 &&
      visibleHeight < window.innerHeight - 72

    setKeyboardOpen((current) => (current === keyboard ? current : keyboard))

    const topPad = keyboard ? 6 : 12
    const bottomPad = keyboard ? 6 : 12
    const available = visibleHeight - topPad - bottomPad
    panel.style.setProperty(
      '--ava-sheet-max-height',
      `${Math.max(220, Math.floor(available))}px`,
    )
  }, [panelRef])

  useLayoutEffect(() => {
    if (!open) {
      setKeyboardOpen(false)
      panelRef.current?.style.removeProperty('--ava-sheet-max-height')
      return undefined
    }

    applyViewportMetrics()

    const viewport = window.visualViewport
    viewport?.addEventListener('resize', applyViewportMetrics)
    viewport?.addEventListener('scroll', applyViewportMetrics)
    window.addEventListener('resize', applyViewportMetrics)
    window.addEventListener('orientationchange', applyViewportMetrics)

    return () => {
      viewport?.removeEventListener('resize', applyViewportMetrics)
      viewport?.removeEventListener('scroll', applyViewportMetrics)
      window.removeEventListener('resize', applyViewportMetrics)
      window.removeEventListener('orientationchange', applyViewportMetrics)
      panelRef.current?.style.removeProperty('--ava-sheet-max-height')
    }
  }, [open, applyViewportMetrics, panelRef])

  return { keyboardOpen }
}

export default useAvaSheetViewport
