import { useCallback, useEffect, useState } from 'react'

const MOBILE_SHEET_QUERY = '(max-width: 680px)'

export function useAvaSheetViewport({ open, backdropRef, panelRef }) {
  const [keyboardOpen, setKeyboardOpen] = useState(false)

  const applyViewportMetrics = useCallback(() => {
    const backdrop = backdropRef.current
    const panel = panelRef.current
    if (!backdrop || !panel) return

    const mobile =
      typeof window.matchMedia === 'function' &&
      window.matchMedia(MOBILE_SHEET_QUERY).matches
    const viewport = window.visualViewport

    if (!mobile || !viewport) {
      backdrop.style.removeProperty('--ava-vv-offset-top')
      backdrop.style.removeProperty('--ava-vv-height')
      panel.style.removeProperty('--ava-sheet-max-height')
      setKeyboardOpen(false)
      return
    }

    const insetTop = Math.max(0, viewport.offsetTop)
    const visibleHeight = viewport.height
    const keyboard =
      visibleHeight < window.innerHeight * 0.82 &&
      visibleHeight < window.innerHeight - 72

    setKeyboardOpen(keyboard)

    backdrop.style.setProperty('--ava-vv-offset-top', `${insetTop}px`)
    backdrop.style.setProperty('--ava-vv-height', `${visibleHeight}px`)

    const topPad = keyboard ? 6 : Math.max(8, 0)
    const bottomPad = keyboard ? 6 : Math.max(8, 0)
    const available = visibleHeight - insetTop - topPad - bottomPad
    panel.style.setProperty(
      '--ava-sheet-max-height',
      `${Math.max(220, Math.floor(available))}px`,
    )
  }, [backdropRef, panelRef])

  useEffect(() => {
    if (!open) {
      setKeyboardOpen(false)
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

      backdropRef.current?.style.removeProperty('--ava-vv-offset-top')
      backdropRef.current?.style.removeProperty('--ava-vv-height')
      panelRef.current?.style.removeProperty('--ava-sheet-max-height')
    }
  }, [open, applyViewportMetrics, backdropRef, panelRef])

  return { keyboardOpen }
}

export default useAvaSheetViewport
