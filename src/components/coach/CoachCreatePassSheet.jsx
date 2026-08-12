import { useEffect, useId, useRef, useState } from 'react'
import AppUiBackdrop from '../ui/AppUiBackdrop'
import AppUiCloseButton from '../ui/AppUiCloseButton'
import { dateKey } from '../../lib/appointmentScheduling'
import { DEFAULT_COACH_SCHEDULE_TIMEZONE } from '../../lib/sessionTimezone'

export default function CoachCreatePassSheet({
  open = false,
  submitting = false,
  onClose,
  onSubmit,
}) {
  const titleId = useId()
  const panelRef = useRef(null)
  const [name, setName] = useState('Training pass')
  const [sessions, setSessions] = useState('12')
  const [startsAt, setStartsAt] = useState(() =>
    dateKey(new Date(), DEFAULT_COACH_SCHEDULE_TIMEZONE),
  )
  const [expiresAt, setExpiresAt] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open) return undefined

    setName('Training pass')
    setSessions('12')
    setStartsAt(dateKey(new Date(), DEFAULT_COACH_SCHEDULE_TIMEZONE))
    setExpiresAt('')
    setNotes('')

    panelRef.current?.focus()

    return undefined
  }, [open])

  const handleSubmit = () => {
    if (submitting || !startsAt || Number(sessions) <= 0) return

    onSubmit?.({
      name: name.trim() || 'Training pass',
      sessionsPurchased: Number(sessions),
      startsAt,
      expiresAt: expiresAt || null,
      notes: notes.trim(),
    })
  }

  return (
    <AppUiBackdrop
      open={open}
      onClose={submitting ? undefined : onClose}
      className="coach-create-pass-backdrop"
    >
      <section
        ref={panelRef}
        className="coach-create-pass-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="coach-create-pass-sheet"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="coach-create-pass-sheet-header">
          <div>
            <span className="eyebrow">TRAINING PASS</span>
            <h2 id={titleId}>Add pass</h2>
            <p>Create a session pass for this client.</p>
          </div>
          <AppUiCloseButton onClick={onClose} disabled={submitting} />
        </header>

        <div className="coach-create-pass-sheet-body">
          <label className="coach-field coach-field--wide">
            <span>Pass name</span>
            <input
              className="coach-field-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="coach-field coach-field--wide">
            <span>Sessions</span>
            <input
              className="coach-field-input"
              type="number"
              min="1"
              inputMode="numeric"
              value={sessions}
              onChange={(event) => setSessions(event.target.value)}
            />
          </label>
          <label className="coach-field coach-field--wide">
            <span>Start date</span>
            <input
              className="coach-field-input"
              type="date"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </label>
          <label className="coach-field coach-field--wide">
            <span>Expiration (optional)</span>
            <input
              className="coach-field-input"
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
          </label>
          <label className="coach-field coach-field--wide">
            <span>Private note (optional)</span>
            <textarea
              className="coach-field-input"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Coach-only context for this pass"
            />
          </label>
        </div>

        <footer className="coach-create-pass-sheet-footer">
          <button
            type="button"
            className="coach-secondary-button"
            disabled={submitting}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="gold-button machined coach-primary-action"
            disabled={submitting || !startsAt || Number(sessions) <= 0}
            onClick={handleSubmit}
          >
            {submitting ? 'Creating…' : 'Create pass'}
          </button>
        </footer>
      </section>
    </AppUiBackdrop>
  )
}
