import { Clock3, UserRound } from 'lucide-react'
import AppUiCloseButton from '../ui/AppUiCloseButton'
import AppUiBackdrop from '../ui/AppUiBackdrop'
import { getClientDisplayName } from '../../lib/clientDisplayName'
import { formatScheduleDateLong } from '../../lib/appointmentScheduling'
import { formatScheduledSessionTime } from '../../lib/sessionTimezone'
import { SCHEDULED_SESSION_STATUS } from '../../lib/coachScheduledSessions'
import {
  attendanceStatusLabel,
  formatAppointmentDuration,
  formatAppointmentHeadline,
  locationLabel,
  rsvpStatusLabel,
} from '../../lib/coachingAppointment'
import { rsvpCoachLabel } from '../../lib/sessionRsvp'

const ICON = { size: 18, strokeWidth: 1.75 }

export default function CoachSessionDetailSheet({
  session,
  client,
  assignments = [],
  passSummary,
  open = false,
  onClose,
  rescheduleMode = false,
  rescheduleDraft,
  onRescheduleDraftChange,
  onBeginReschedule,
  onSaveReschedule,
  onViewClient,
  onComplete,
  onCancel,
  onMarkMissed,
  completingSessionId = null,
  passDebitState = { kind: 'not_applicable' },
  onApplyPassDebit,
  passActionBusy = false,
}) {
  if (!session) return null

  const athleteAssignments = assignments.filter(
    (item) => item.athlete_id === session.athleteId,
  )

  return (
    <AppUiBackdrop
      open={open}
      onClose={onClose}
      className="coach-session-detail-backdrop"
    >
      <section
        className="coach-session-detail-sheet"
        role="dialog"
        aria-modal="true"
        data-testid="coach-session-detail-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">IN-PERSON TRAINING</span>
            <h2>
              {formatScheduleDateLong(session.sessionDate)} ·{' '}
              {formatScheduledSessionTime(session)}
            </h2>
            <p className="coach-session-detail-client">
              {getClientDisplayName(client ?? {})}
            </p>
          </div>
          <AppUiCloseButton onClick={onClose} />
        </header>

        {!rescheduleMode ? (
          <>
            <p className="coach-session-detail-meta">
              {formatAppointmentDuration(session)} ·{' '}
              {locationLabel(session) !== 'Default location'
                ? locationLabel(session)
                : 'AVAREN Gym'}
            </p>
                <div className="coach-session-detail-status-grid">
                  <div>
                    <span className="coach-session-detail-status-label">RSVP</span>
                    <strong>
                      {session.status === SCHEDULED_SESSION_STATUS.SCHEDULED
                        ? rsvpStatusLabel(session) ??
                          rsvpCoachLabel(session.rsvpStatus)
                        : '—'}
                    </strong>
                  </div>
                  <div>
                    <span className="coach-session-detail-status-label">Attendance</span>
                    <strong>{attendanceStatusLabel(session)}</strong>
                  </div>
                </div>
                {session.status === SCHEDULED_SESSION_STATUS.COMPLETED ? (
                  <div className="coach-session-detail-pass-effect">
                    <span className="coach-session-detail-status-label">Pass</span>
                    <strong>
                      {passDebitState.kind === 'debited'
                        ? '1 session used'
                        : passDebitState.kind === 'selection_required'
                          ? 'Choose a pass to debit'
                          : passDebitState.kind === 'pending_debit'
                            ? 'Pass debit pending'
                            : 'No eligible training pass'}
                    </strong>
                  </div>
                ) : null}
            {formatAppointmentHeadline(session) ? (
              <p className="coach-session-detail-workout">
                Linked workout: {formatAppointmentHeadline(session)}
              </p>
            ) : null}
          </>
        ) : (
          <div className="coach-session-reschedule-fields">
            <label className="coach-date-field">
              <span>Date</span>
              <input
                type="date"
                className="coach-field-input"
                value={rescheduleDraft.sessionDate}
                onChange={(event) =>
                  onRescheduleDraftChange?.((current) => ({
                    ...current,
                    sessionDate: event.target.value,
                  }))
                }
              />
            </label>
            <label className="coach-date-field">
              <span>Start time</span>
              <input
                type="time"
                className="coach-field-input"
                value={rescheduleDraft.startTime}
                onChange={(event) =>
                  onRescheduleDraftChange?.((current) => ({
                    ...current,
                    startTime: event.target.value,
                  }))
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
                value={rescheduleDraft.durationMinutes}
                onChange={(event) =>
                  onRescheduleDraftChange?.((current) => ({
                    ...current,
                    durationMinutes: event.target.value,
                  }))
                }
              />
            </label>
            {athleteAssignments.length > 0 ? (
              <label className="coach-date-field">
                <span>Linked workout</span>
                <select
                  className="coach-field-input"
                  value={rescheduleDraft.assignmentId ?? ''}
                  onChange={(event) =>
                    onRescheduleDraftChange?.((current) => ({
                      ...current,
                      assignmentId: event.target.value || null,
                    }))
                  }
                >
                  <option value="">No linked workout</option>
                  {athleteAssignments
                    .filter((item) => ['assigned', 'started'].includes(item.status))
                    .map((assignment) => (
                      <option key={assignment.id} value={assignment.id}>
                        {assignment.title}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
            <label className="coach-date-field">
              <span>Location</span>
              <select
                className="coach-field-input"
                value={rescheduleDraft.locationType ?? 'default'}
                onChange={(event) =>
                  onRescheduleDraftChange?.((current) => ({
                    ...current,
                    locationType: event.target.value,
                  }))
                }
              >
                <option value="default">Default location</option>
                <option value="avaren_gym">AVAREN Gym</option>
                <option value="client_gym">Client gym</option>
                <option value="other">Other</option>
              </select>
            </label>
            {rescheduleDraft.locationType === 'other' ? (
              <label className="coach-date-field">
                <span>Location name</span>
                <input
                  type="text"
                  className="coach-field-input"
                  value={rescheduleDraft.locationName}
                  onChange={(event) =>
                    onRescheduleDraftChange?.((current) => ({
                      ...current,
                      locationName: event.target.value,
                    }))
                  }
                />
              </label>
            ) : null}
          </div>
        )}

        <div className="coach-session-detail-balance">
          <Clock3 {...ICON} />
          <div>
            <strong>
              {passSummary.totalBalance > 0
                ? `${passSummary.totalBalance} sessions remaining`
                : 'No active pass on file'}
            </strong>
            <span>
              {passSummary.primaryPass
                ? `${passSummary.primaryPass.name} · ${passSummary.primaryPass.sessionsPurchased} purchased`
                : 'Add a training pass from the client profile if needed.'}
            </span>
          </div>
        </div>

        {session.coachNote && (
          <p className="coach-session-detail-note">{session.coachNote}</p>
        )}

        <div className="coach-session-detail-actions">
          <button
            type="button"
            className="coach-secondary-button"
            onClick={onViewClient}
          >
            <UserRound {...ICON} />
            View client
          </button>
          {session.status === SCHEDULED_SESSION_STATUS.COMPLETED &&
            passDebitState.kind !== 'debited' && (
              <button
                type="button"
                className="gold-button machined coach-primary-action"
                disabled={passActionBusy}
                onClick={() => onApplyPassDebit?.(session)}
              >
                {passDebitState.kind === 'selection_required'
                  ? 'Choose pass'
                  : passDebitState.kind === 'no_eligible_pass'
                    ? 'Review passes'
                    : 'Apply pass debit'}
              </button>
            )}
          {session.status === SCHEDULED_SESSION_STATUS.SCHEDULED && (
            <>
              <button
                type="button"
                className="gold-button machined coach-primary-action"
                disabled={completingSessionId === session.id}
                onClick={() => onComplete?.(session)}
              >
                {completingSessionId === session.id
                  ? 'Completing…'
                  : 'Complete Session'}
              </button>
              {rescheduleMode ? (
                <button
                  type="button"
                  className="coach-secondary-button"
                  onClick={onSaveReschedule}
                >
                  Save changes
                </button>
              ) : (
                <button
                  type="button"
                  className="coach-secondary-button"
                  onClick={() => onBeginReschedule?.(session)}
                >
                  Reschedule
                </button>
              )}
              <button
                type="button"
                className="coach-secondary-button"
                onClick={() => onCancel?.(session)}
              >
                Cancel Session
              </button>
              <button
                type="button"
                className="coach-secondary-button"
                onClick={() => onMarkMissed?.(session)}
              >
                Mark missed
              </button>
            </>
          )}
        </div>
      </section>
    </AppUiBackdrop>
  )
}
