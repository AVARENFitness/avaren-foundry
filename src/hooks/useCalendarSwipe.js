import { useRef } from 'react'

// Touch-only horizontal navigation. Vertical scrolling and tiny movements remain native.
export function useCalendarSwipe(onPrevious, onNext) {
  const start = useRef(null)
  return {
    onTouchStart(event) {
      if (event.touches.length !== 1) { start.current = null; return }
      const target = event.target
      if (target?.closest?.('button, a, input, textarea, select, [role="dialog"]')) {
        start.current = null
        return
      }
      start.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }
    },
    onTouchEnd(event) {
      const origin = start.current
      start.current = null
      if (!origin || event.changedTouches.length !== 1) return
      const dx = event.changedTouches[0].clientX - origin.x
      const dy = event.changedTouches[0].clientY - origin.y
      if (Math.abs(dx) < 65 || Math.abs(dx) < Math.abs(dy) * 1.5) return
      if (dx > 0) onPrevious()
      else onNext()
    },
    onTouchCancel() { start.current = null },
  }
}
