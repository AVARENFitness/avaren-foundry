import { useCallback, useLayoutEffect, useRef } from 'react'

export const MOBILE_SHEET_QUERY = '(max-width: 680px)'

export function useAvaSheetViewport({ open, panelRef }) {
  const metricsRef = useRef({
    maxHeight: '',
    keyboardOpen: false,
  })

  const applyViewportMetrics = useCallback(() => {
    const panel = panelRef.current
    if (!panel) return

    const mobile =
      typeof window.matchMedia === 'function' &&
      window.matchMedia(MOBILE_SHEET_QUERY).matches
    const viewport = window.visualViewport

    if (!mobile || !viewport) {
      panel.style.removeProperty('--ava-sheet-max-height')
      metricsRef.current = { maxHeight: '', keyboardOpen: false }
      return
    }

    const visibleHeight = viewport.height
    const innerHeight = window.innerHeight
    const previousKeyboard = metricsRef.current.keyboardOpen
    const keyboard = previousKeyboard
      ? visibleHeight < innerHeight * 0.88
      : visibleHeight < innerHeight * 0.82 && visibleHeight < innerHeight - 72

    const topPad = keyboard ? 6 : 12
    const bottomPad = keyboard ? 6 : 12
    const available = visibleHeight - topPad - bottomPad
    const maxHeight = `${Math.max(220, Math.floor(available))}px`
    const currentMaxHeight = panel.style.getPropertyValue('--ava-sheet-max-height')

    if (currentMaxHeight !== maxHeight) {
      panel.style.setProperty('--ava-sheet-max-height', maxHeight)
    }

    metricsRef.current = {
      maxHeight,
      keyboardOpen: keyboard,
    }

    panel.dataset.avaKeyboardOpen = keyboard ? 'true' : 'false'
  }, [panelRef])

  useLayoutEffect(() => {
    if (!open) {
      panelRef.current?.style.removeProperty('--ava-sheet-max-height')
      panelRef.current?.removeAttribute('data-ava-keyboard-open')
      metricsRef.current = { maxHeight: '', keyboardOpen: false }
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
      panelRef.current?.removeAttribute('data-ava-keyboard-open')
      metricsRef.current = { maxHeight: '', keyboardOpen: false }
    }
  }, [open, applyViewportMetrics, panelRef])

  return { keyboardOpen: false }
}

export default useAvaSheetViewport
