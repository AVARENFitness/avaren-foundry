import { useEffect } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

export function useFocusTrap(containerRef, active) {
  useEffect(() => {
    if (!active || !containerRef.current) return undefined

    const root = containerRef.current
    const focusables = () =>
      Array.from(root.querySelectorAll(FOCUSABLE)).filter(
        (node) => !node.hasAttribute('disabled') && node.tabIndex !== -1,
      )

    const initial = focusables()
    initial[0]?.focus()

    const onKeyDown = (event) => {
      if (event.key === 'Tab') {
        const nodes = focusables()
        if (!nodes.length) return

        const first = nodes[0]
        const last = nodes[nodes.length - 1]

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
        return
      }
    }

    root.addEventListener('keydown', onKeyDown)
    return () => root.removeEventListener('keydown', onKeyDown)
  }, [active, containerRef])
}
