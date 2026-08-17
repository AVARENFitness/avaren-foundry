import AppUiBackdrop from '../ui/AppUiBackdrop'
import AppUiCloseButton from '../ui/AppUiCloseButton'
import { RECURRENCE_SCOPE } from '../../lib/recurringAppointments'

export default function RecurrenceScopeDialog({
  open = false,
  title = 'Apply changes to',
  description = '',
  confirmLabel = 'Continue',
  onClose,
  onSelect,
}) {
  if (!open) return null

  return (
    <AppUiBackdrop
      open={open}
      onClose={onClose}
      className="recurrence-scope-backdrop"
    >
      <section
        className="recurrence-scope-sheet"
        role="dialog"
        aria-modal="true"
        data-testid="recurrence-scope-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="recurrence-scope-header">
          <div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <AppUiCloseButton onClick={onClose} />
        </header>

        <div className="recurrence-scope-actions">
          <button
            type="button"
            className="coach-secondary-button"
            data-testid="recurrence-scope-this-only"
            onClick={() => onSelect?.(RECURRENCE_SCOPE.THIS_ONLY)}
          >
            This appointment
          </button>
          <button
            type="button"
            className="gold-button machined coach-primary-action"
            data-testid="recurrence-scope-this-and-future"
            onClick={() => onSelect?.(RECURRENCE_SCOPE.THIS_AND_FUTURE)}
          >
            This and future
          </button>
        </div>
      </section>
    </AppUiBackdrop>
  )
}
