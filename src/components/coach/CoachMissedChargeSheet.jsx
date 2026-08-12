import { useEffect, useId, useRef } from 'react'
import AppUiBackdrop from '../ui/AppUiBackdrop'
import AppUiCloseButton from '../ui/AppUiCloseButton'

export default function CoachMissedChargeSheet({
  open = false,
  submitting = false,
  onClose,
  onNoCharge,
  onCharge,
}) {
  const titleId = useId()
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    panelRef.current?.focus()
  }, [open])

  return (
    <AppUiBackdrop
      open={open}
      onClose={submitting ? undefined : onClose}
      className="coach-missed-charge-backdrop"
    >
      <section
        ref={panelRef}
        className="coach-missed-charge-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="coach-missed-charge-sheet-header">
          <div>
            <span className="eyebrow">MISSED SESSION</span>
            <h2 id={titleId}>Charge a session?</h2>
            <p>Choose whether to debit a training pass for this missed appointment.</p>
          </div>
          <AppUiCloseButton onClick={onClose} disabled={submitting} />
        </header>

        <footer className="coach-missed-charge-sheet-footer">
          <button
            type="button"
            className="coach-secondary-button"
            disabled={submitting}
            onClick={onNoCharge}
          >
            Do not charge
          </button>
          <button
            type="button"
            className="gold-button machined coach-primary-action"
            disabled={submitting}
            onClick={onCharge}
          >
            {submitting ? 'Processing…' : 'Charge session'}
          </button>
        </footer>
      </section>
    </AppUiBackdrop>
  )
}
