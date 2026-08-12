import { useId, useRef } from 'react'
import AppUiBackdrop from './ui/AppUiBackdrop'
import { X } from 'lucide-react'

export default function TodaysFocusWhySheet({ open, focus, onClose }) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef(null)

  if (!open || !focus) return null

  return (
    <AppUiBackdrop open={open} onClose={onClose} className="todays-focus-why-backdrop">
      <section
        ref={panelRef}
        className="todays-focus-why-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="todays-focus-why-header">
          <div>
            <span className="eyebrow">WHY THIS FOCUS</span>
            <h2 id={titleId}>{focus.title}</h2>
          </div>
          <button
            type="button"
            className="todays-focus-why-close"
            onClick={onClose}
            aria-label="Close explanation"
          >
            <X size={18} />
          </button>
        </header>

        <p id={descriptionId} className="todays-focus-why-lead">
          {focus.explanation}
        </p>

        {focus.reasons?.length > 0 && (
          <ul className="todays-focus-why-list">
            {focus.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}

        <p className="todays-focus-why-note">
          This is general fitness guidance based on your logged activity and
          check-ins — not medical advice.
        </p>
      </section>
    </AppUiBackdrop>
  )
}
