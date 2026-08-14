import { useEffect } from 'react'

const APP_ROOT_ID = 'root'

/**
 * Scroll lock for portaled modals.
 * Locks #root (not body) so iOS Safari keeps body-fixed portal layers interactive.
 */
export function useBodyScrollLock(active = false) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return undefined

    const root = document.getElementById(APP_ROOT_ID)
    const html = document.documentElement
    if (!root) return undefined

    const scrollY = window.scrollY
    const previous = {
      rootPosition: root.style.position,
      rootTop: root.style.top,
      rootLeft: root.style.left,
      rootRight: root.style.right,
      rootWidth: root.style.width,
      rootOverflow: root.style.overflow,
      rootTouchAction: root.style.touchAction,
      htmlOverflow: html.style.overflow,
      bodyOverflow: document.body.style.overflow,
      bodyPosition: document.body.style.position,
      bodyTop: document.body.style.top,
      bodyLeft: document.body.style.left,
      bodyRight: document.body.style.right,
      bodyWidth: document.body.style.width,
    }

    root.style.position = 'fixed'
    root.style.top = `-${scrollY}px`
    root.style.left = '0'
    root.style.right = '0'
    root.style.width = '100%'
    root.style.overflow = 'hidden'
    html.style.overflow = 'hidden'

    return () => {
      root.style.position = previous.rootPosition
      root.style.top = previous.rootTop
      root.style.left = previous.rootLeft
      root.style.right = previous.rootRight
      root.style.width = previous.rootWidth
      root.style.overflow = previous.rootOverflow
      root.style.touchAction = previous.rootTouchAction
      html.style.overflow = previous.htmlOverflow
      document.body.style.overflow = previous.bodyOverflow
      document.body.style.position = previous.bodyPosition
      document.body.style.top = previous.bodyTop
      document.body.style.left = previous.bodyLeft
      document.body.style.right = previous.bodyRight
      document.body.style.width = previous.bodyWidth

      if (typeof window.scrollTo === 'function') {
        window.scrollTo(0, scrollY)
      }
    }
  }, [active])
}

export default useBodyScrollLock
