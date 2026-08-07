import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export default function AvaWhySheet({ open, briefing, onClose }) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose?.()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open || !briefing) return null

  const evidenceByCategory = (briefing.evidence ?? []).reduce(
    (groups, item) => {
      groups[item.category] ??= []
      groups[item.category].push(item)
      return groups
    },
    {},
  )

  return createPortal(
    <div
      className="app-ui-backdrop ava-why-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <section
        ref={panelRef}
        className="ava-why-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="ava-why-header">
          <div>
            <span className="eyebrow">WHY AVA SAYS</span>
            <h2 id={titleId}>{briefing.headline}</h2>
          </div>
          <button
            type="button"
            className="ava-why-close"
            onClick={onClose}
            aria-label="Close explanation"
          >
            <X size={18} />
          </button>
        </header>

        <p id={descriptionId} className="ava-why-lead">
          {briefing.summary}
        </p>

        {Object.entries(evidenceByCategory).map(([category, items]) => (
          <section key={category} className="ava-why-group">
            <h3>{category}</h3>
            <ul>
              {items.map((item) => (
                <li key={`${category}-${item.label}`}>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {briefing.recommendation?.label && (
          <p className="ava-why-recommendation">
            <strong>Recommendation</strong>
            <span>{briefing.recommendation.label}</span>
          </p>
        )}

        <p className="ava-why-note">
          AVA uses your logged training, readiness, and recovery data — not
          medical diagnosis. This is general fitness guidance.
        </p>
      </section>
    </div>,
    document.body,
  )
}
