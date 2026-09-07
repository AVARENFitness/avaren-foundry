import { useCallback, useLayoutEffect, useRef } from 'react'
import { scheduleGuidedFlowScrollToTop } from '../lib/guidedFlowScroll'

/**
 * Reset guided-flow scroll only when active item changes after an intentional
 * Next / Previous / progression mark — not on set edits or timer ticks.
 */
export function useGuidedFlowScrollReset(
  activeKey,
  { enabled = true, fromElement = null } = {},
) {
  const previousKeyRef = useRef(activeKey)
  const pendingNavigationRef = useRef(false)
  const fromElementRef = useRef(fromElement)
  fromElementRef.current = fromElement

  const markGuidedFlowNavigation = useCallback(() => {
    pendingNavigationRef.current = true
  }, [])

  useLayoutEffect(() => {
    if (!enabled) {
      previousKeyRef.current = activeKey
      return
    }

    if (previousKeyRef.current === activeKey) return

    previousKeyRef.current = activeKey

    if (!pendingNavigationRef.current) return
    pendingNavigationRef.current = false

    scheduleGuidedFlowScrollToTop({
      fromElement: fromElementRef.current,
    })
  }, [activeKey, enabled])

  return markGuidedFlowNavigation
}
