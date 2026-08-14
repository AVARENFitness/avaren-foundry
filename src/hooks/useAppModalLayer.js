import { useEffect } from 'react'
import { useBodyScrollLock } from '../ava/useBodyScrollLock'

const APP_ROOT_ID = 'root'

export const resetDocumentModalLayer = () => {
  if (typeof document === 'undefined') return

  if (document.querySelector('[data-app-ui-backdrop="open"]')) {
    return
  }

  const root = document.getElementById(APP_ROOT_ID)
  const { body } = document
  const html = document.documentElement

  body.style.removeProperty('overflow')
  body.style.removeProperty('position')
  body.style.removeProperty('top')
  body.style.removeProperty('left')
  body.style.removeProperty('right')
  body.style.removeProperty('width')
  body.style.removeProperty('touch-action')

  html.style.removeProperty('overflow')

  if (root) {
    root.style.removeProperty('overflow')
    root.style.removeProperty('position')
    root.style.removeProperty('top')
    root.style.removeProperty('left')
    root.style.removeProperty('right')
    root.style.removeProperty('width')
    root.style.removeProperty('touch-action')
  }
}

export function useAppModalLayer(active = false) {
  useBodyScrollLock(active)

  useEffect(() => {
    if (!active) return undefined

    return () => {
      resetDocumentModalLayer()
    }
  }, [active])

  useEffect(() => () => resetDocumentModalLayer(), [])
}
