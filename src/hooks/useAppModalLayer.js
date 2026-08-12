import { useEffect } from 'react'
import { useBodyScrollLock } from '../ava/useBodyScrollLock'

export const resetDocumentModalLayer = () => {
  if (typeof document === 'undefined') return

  const { body } = document
  body.style.removeProperty('overflow')
  body.style.removeProperty('position')
  body.style.removeProperty('top')
  body.style.removeProperty('left')
  body.style.removeProperty('right')
  body.style.removeProperty('width')
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
