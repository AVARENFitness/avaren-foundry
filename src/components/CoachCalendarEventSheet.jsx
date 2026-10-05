import AppUiBackdrop from './ui/AppUiBackdrop'
import AppUiCloseButton from './ui/AppUiCloseButton'
import {
  COACH_CALENDAR_EVENT_CATEGORY,
  COACH_CALENDAR_EVENT_CATEGORY_LABEL,
} from '../lib/coachCalendarEvents'
import {
  buildScheduleTimeOptions,
  resolveDurationPresetOptions,
} from '../lib/appointmentScheduling'

const CATEGORY_OPTIONS = Object.values(COACH_CALENDAR_EVENT_CATEGORY)
const TIME_OPTIONS = buildScheduleTimeOptions({ startHour: 5, endHour: 23 })

export default function CoachCalendarEventSheet({
  open = false,
  draft,
  submitting = false,
  onDraftChange,
  onClose,
  onSubmit,
}) {
  if (!open) return null

  const set = (patch) => onDraftChange?.({ ...draft, ...patch })
  const durationOptions = resolveDurationPresetOptions(draft.durationMinutes)

  return (
    <AppUiBackdrop
      open={open}
      onClose={submitting ? undefined : onClose}
      className="coach-schedule-session-backdrop"
    >
      <section
        className="coach-session-composer coach-calendar-event-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="coach-calendar-event-title"
        data-testid="coach-calendar-event-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">PRIVATE CALENDAR</span>
            <h2 id="coach-calendar-event-title">Add to your schedule</h2>
            <p>Only you can see this event. It blocks the time from client scheduling.</p>
          </div>
          <AppUiCloseButton onClick={onClose} disabled={submitting} />
        </header>

        <label className="coach-field coach-field--wide">
          <span>Title *</span>
          <input
            className="coach-field-input"
            value={draft.title}
            onChange={(event) => set({ title: event.target.value })}
            placeholder="Admin work, appointment, lunch…"
            autoFocus
          />
        </label>

        <div className="coach-calendar-event-grid">
          <label className="coach-field">
            <span>Date</span>
            <input
              className="coach-field-input"
              type="date"
              value={draft.eventDate}
              onChange={(event) => set({ eventDate: event.target.value })}
            />
          </label>

          <label className="coach-field">
            <span>Starts</span>
            <select
              className="coach-field-input"
              value={draft.startTime}
              onChange={(event) => set({ startTime: event.target.value })}
            >
              {TIME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="coach-calendar-event-grid">
          <label className="coach-field">
            <span>Duration</span>
            <select
              className="coach-field-input"
              value={String(draft.durationMinutes)}
              onChange={(event) => set({ durationMinutes: event.target.value })}
            >
              {durationOptions.map((minutes) => (
                <option key={minutes} value={String(minutes)}>
                  {minutes} min
                </option>
              ))}
            </select>
          </label>

          <label className="coach-field">
            <span>Type</span>
            <select
              className="coach-field-input"
              value={draft.category}
              onChange={(event) => set({ category: event.target.value })}
            >
              {CATEGORY_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {COACH_CALENDAR_EVENT_CATEGORY_LABEL[value]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="coach-field coach-field--wide">
          <span>Location</span>
          <input
            className="coach-field-input"
            value={draft.locationName}
            onChange={(event) => set({ locationName: event.target.value })}
            placeholder="Optional"
          />
        </label>

        <label className="coach-field coach-field--wide">
          <span>Notes</span>
          <textarea
            className="coach-field-input"
            rows={3}
            value={draft.notes}
            onChange={(event) => set({ notes: event.target.value })}
            placeholder="Private details…"
          />
        </label>

        <footer className="coach-calendar-event-actions">
          <button
            type="button"
            className="coach-secondary-button"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="gold-button machined coach-primary-action"
            onClick={onSubmit}
            disabled={submitting || !draft.title.trim()}
          >
            {submitting ? 'Saving…' : 'Add to calendar'}
          </button>
        </footer>
      </section>
    </AppUiBackdrop>
  )
}
