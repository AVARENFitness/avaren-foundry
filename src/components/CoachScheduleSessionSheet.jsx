import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

const ICON = { size: 18, strokeWidth: 1.75 }

export default function CoachScheduleSessionSheet({
  open,
  clients = [],
  draft,
  onDraftChange,
  onClose,
  onSubmit,
  submitting = false,
}) {
  const titleId = useId()
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
    panelRef.current?.scrollTo?.(0, 0)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="app-ui-backdrop coach-schedule-session-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <section
        ref={panelRef}
        className="coach-schedule-session-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="coach-schedule-session-sheet-header">
          <div>
            <span className="eyebrow">SCHEDULE SESSION</span>
            <h2 id={titleId}>Plan an in-person session</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X {...ICON} />
          </button>
        </header>

        <div className="coach-schedule-session-sheet-body">
          <label className="coach-date-field">
            <span>Client</span>
            <select
              className="coach-field-input"
              value={draft.athleteId}
              onChange={(event) =>
                onDraftChange?.({
                  ...draft,
                  athleteId: event.target.value,
                })
              }
            >
              <option value="">Select client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.athlete_id}>
                  {client.athlete_email}
                </option>
              ))}
            </select>
          </label>
          <label className="coach-date-field">
            <span>Date</span>
            <input
              type="date"
              className="coach-field-input"
              value={draft.sessionDate}
              onChange={(event) =>
                onDraftChange?.({
                  ...draft,
                  sessionDate: event.target.value,
                })
              }
            />
          </label>
          <label className="coach-date-field">
            <span>Start time</span>
            <input
              type="time"
              className="coach-field-input"
              value={draft.startTime}
              onChange={(event) =>
                onDraftChange?.({
                  ...draft,
                  startTime: event.target.value,
                })
              }
            />
          </label>
          <label className="coach-date-field">
            <span>Duration (minutes)</span>
            <input
              type="number"
              className="coach-field-input"
              min="15"
              step="15"
              value={draft.durationMinutes}
              onChange={(event) =>
                onDraftChange?.({
                  ...draft,
                  durationMinutes: event.target.value,
                })
              }
            />
          </label>
          <label className="coach-date-field">
            <span>Optional note</span>
            <textarea
              className="coach-field-input coach-profile-notes-input"
              rows={3}
              value={draft.coachNote}
              onChange={(event) =>
                onDraftChange?.({
                  ...draft,
                  coachNote: event.target.value,
                })
              }
            />
          </label>
        </div>

        <footer className="coach-schedule-session-sheet-footer">
          <button
            type="button"
            className="coach-secondary-button"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="gold-button machined coach-primary-action"
            disabled={submitting}
            onClick={onSubmit}
          >
            {submitting ? 'Scheduling…' : 'Schedule Session'}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
