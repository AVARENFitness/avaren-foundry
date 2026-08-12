import { Check, ChevronRight, XCircle } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { appUi } from '../lib/appUi'
import { coachBackend } from '../lib/coachBackend'
import { normalizeAthleteScheduledSession } from '../lib/coachScheduledSessions'
import {
  APPOINTMENT_STATUS,
  appointmentTypeLabel,
  formatAppointmentDayTime,
  formatAppointmentDuration,
  linkedWorkoutTitle,
  locationLabel,
} from '../lib/coachingAppointment'
import { canAthleteUpdateRsvp, RSVP_STATUS, rsvpAthleteLabel } from '../lib/sessionRsvp'
import AppUiCloseButton from './ui/AppUiCloseButton'

export default function AthleteAppointmentDetailSheet({
  appointment = null,
  open = false,
  onClose,
  onUpdated,
}) {
  const titleId = useId()
  const panelRef = useRef(null)
  const [session, setSession] = useState(appointment)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    setSession(appointment)
  }, [appointment])

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

  if (!open || !session) return null

  const handleRsvp = async (rsvpStatus) => {
    if (!canAthleteUpdateRsvp(session) || updating) return

    setUpdating(true)
    try {
      const result = await coachBackend.updateSessionRsvp(session.id, rsvpStatus)
      if (!result.ok) {
        appUi.toast('Could not update your response.', 'error')
        return
      }

      const updated = normalizeAthleteScheduledSession(result.session)
      setSession(updated)
      onUpdated?.(updated)
      appUi.toast(
        rsvpStatus === RSVP_STATUS.CONFIRMED
          ? 'Session confirmed.'
          : 'Coach notified you cannot make it.',
        'success',
      )
    } catch (error) {
      appUi.toast(error.message ?? 'Could not update your response.', 'error')
    } finally {
      setUpdating(false)
    }
  }

  const when = formatAppointmentDayTime(session)
  const coachName = session.coachDisplayName ?? 'Coach'
  const place = locationLabel(session)
  const placeLabel =
    place && place !== 'Default location' ? place : 'AVAREN Gym'
  const workoutTitle = linkedWorkoutTitle(session)
  const sessionType = appointmentTypeLabel(session)
  const rsvpLabel = rsvpAthleteLabel(session.rsvpStatus)
  const showRsvpStatus =
    canAthleteUpdateRsvp(session) &&
    session.rsvpStatus === RSVP_STATUS.AWAITING

  return createPortal(
    <div
      className="app-ui-backdrop athlete-appointment-detail-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <section
        ref={panelRef}
        className="athlete-appointment-detail-sheet app-ui-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="athlete-appointment-detail-header app-ui-sheet-header">
          <div className="athlete-appointment-detail-titleblock">
            <span className="eyebrow">{sessionType.toUpperCase()}</span>
            <h2 id={titleId}>{when}</h2>
            <p className="athlete-appointment-detail-with">with {coachName}</p>
          </div>
          <AppUiCloseButton onClick={onClose} />
        </header>

        <div className="athlete-appointment-detail-body">
          <p className="athlete-appointment-detail-meta-line">
            {formatAppointmentDuration(session)} · {placeLabel}
          </p>

          {workoutTitle ? (
            <p className="athlete-appointment-detail-workout">{workoutTitle}</p>
          ) : null}

          {showRsvpStatus ? (
            <span className="athlete-appointment-status-pill">{rsvpLabel}</span>
          ) : null}

          {!showRsvpStatus && session.rsvpStatus !== RSVP_STATUS.AWAITING ? (
            <span className="athlete-appointment-status-pill athlete-appointment-status-pill--quiet">
              {rsvpLabel}
            </span>
          ) : null}

          {session.status === APPOINTMENT_STATUS.CANCELLED ? (
            <p className="athlete-appointment-cancelled">
              This session was cancelled by your coach.
            </p>
          ) : null}
        </div>

        {canAthleteUpdateRsvp(session) ? (
          <footer className="athlete-appointment-detail-footer">
            <button
              type="button"
              className={`gold-button machined athlete-appointment-confirm-button ${
                session.rsvpStatus === RSVP_STATUS.CONFIRMED ? 'active' : ''
              }`}
              disabled={updating}
              onClick={() => handleRsvp(RSVP_STATUS.CONFIRMED)}
            >
              <Check size={16} strokeWidth={1.75} aria-hidden="true" />
              Confirm
            </button>
            <button
              type="button"
              className={`athlete-appointment-decline-button ${
                session.rsvpStatus === RSVP_STATUS.CANNOT_ATTEND ? 'active' : ''
              }`}
              disabled={updating}
              onClick={() => handleRsvp(RSVP_STATUS.CANNOT_ATTEND)}
            >
              <XCircle size={16} strokeWidth={1.75} aria-hidden="true" />
              Cannot attend
            </button>
          </footer>
        ) : null}
      </section>
    </div>,
    document.body,
  )
}
