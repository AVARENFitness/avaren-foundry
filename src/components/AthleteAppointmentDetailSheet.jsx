import { Check } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import {
  APPOINTMENT_SCHEDULE_CONFLICT_HANDOFF,
  formatAppointmentScheduleConflictLine,
  hasOpenScheduleConflictFollowUp,
  submitAppointmentScheduleConflict,
} from '../lib/appointmentScheduleConflict'
import { appUi } from '../lib/appUi'
import { coachBackend } from '../lib/coachBackend'
import { buildAppointmentCoachIdentityDiagnostics } from '../lib/appointmentFollowUpIdentity'
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
import AppUiBackdrop from './ui/AppUiBackdrop'
import AppUiCloseButton from './ui/AppUiCloseButton'

const HANDOFF_VIEW = {
  DETAIL: 'detail',
  CONFLICT: 'conflict',
  SUCCESS: 'success',
  ERROR: 'error',
}

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
  const [view, setView] = useState(HANDOFF_VIEW.DETAIL)
  const [handoffError, setHandoffError] = useState('')
  const [handoffAlreadySent, setHandoffAlreadySent] = useState(false)
  const [athleteFollowUps, setAthleteFollowUps] = useState([])

  useEffect(() => {
    setSession(appointment)
    setView(HANDOFF_VIEW.DETAIL)
    setHandoffError('')
    setHandoffAlreadySent(false)
  }, [appointment])

  useEffect(() => {
    if (!open) {
      setView(HANDOFF_VIEW.DETAIL)
      setHandoffError('')
      setHandoffAlreadySent(false)
      return
    }

    panelRef.current?.scrollTo?.(0, 0)
  }, [open, appointment?.id])

  const isOpen = Boolean(open && session)

  if (!isOpen) return null

  const handleEscape = () => {
    if (view === HANDOFF_VIEW.CONFLICT || view === HANDOFF_VIEW.ERROR) {
      setView(HANDOFF_VIEW.DETAIL)
      return
    }
    onClose?.()
  }

  const handleRsvpConfirm = async () => {
    if (
      !canAthleteUpdateRsvp(session) ||
      updating ||
      session.rsvpStatus === RSVP_STATUS.CONFIRMED
    ) {
      return
    }

    const optimistic = {
      ...session,
      rsvpStatus: RSVP_STATUS.CONFIRMED,
    }
    setSession(optimistic)
    onUpdated?.(optimistic)

    setUpdating(true)
    try {
      const result = await coachBackend.updateSessionRsvp(session.id, RSVP_STATUS.CONFIRMED)
      if (!result.ok) {
        setSession(appointment)
        onUpdated?.(appointment)
        appUi.toast('Could not update your response.', 'error')
        return
      }

      const updated = normalizeAthleteScheduledSession(result.session)
      setSession(updated)
      onUpdated?.(updated)
      appUi.toast('Session confirmed.', 'success')
    } catch (error) {
      setSession(appointment)
      onUpdated?.(appointment)
      appUi.toast(error.message ?? 'Could not update your response.', 'error')
    } finally {
      setUpdating(false)
    }
  }

  const openScheduleConflictHandoff = async () => {
    if (updating) return

    if (import.meta.env.DEV) {
      console.warn(
        '[appointment-coach-identity]',
        buildAppointmentCoachIdentityDiagnostics(session),
      )
    }

    setHandoffError('')
    setHandoffAlreadySent(false)
    setView(HANDOFF_VIEW.CONFLICT)

    try {
      const followUps = await coachBackend.listAthleteFollowUps()
      setAthleteFollowUps(followUps)
      if (hasOpenScheduleConflictFollowUp(followUps, session.id)) {
        setHandoffAlreadySent(true)
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[appointment-schedule-conflict]', error)
      }
      setAthleteFollowUps([])
    }
  }

  const handleSendScheduleConflict = async () => {
    if (updating) return

    setUpdating(true)
    setHandoffError('')

    try {
      let followUps = athleteFollowUps
      if (!followUps.length) {
        followUps = await coachBackend.listAthleteFollowUps()
        setAthleteFollowUps(followUps)
      }

      const result = await submitAppointmentScheduleConflict({
        appointment: session,
        existingFollowUps: followUps,
        createFollowUp: (proposal) =>
          coachBackend.createClientFollowUp({
            ...proposal,
            appointmentContext: session,
          }),
        updateRsvp: async (sessionId, rsvpStatus) => {
          const response = await coachBackend.updateSessionRsvp(sessionId, rsvpStatus)
          if (!response.ok) return response
          return {
            ...response,
            session: normalizeAthleteScheduledSession(response.session),
          }
        },
      })

      if (!result.ok) {
        setHandoffError(
          result.error === 'followup_missing_session_coach'
            ? APPOINTMENT_SCHEDULE_CONFLICT_HANDOFF.ERROR_BODY
            : result.partial
              ? 'Coach was notified, but your RSVP could not be updated. Try again.'
              : APPOINTMENT_SCHEDULE_CONFLICT_HANDOFF.ERROR_BODY,
        )
        setView(HANDOFF_VIEW.ERROR)
        return
      }

      if (result.session) {
        setSession(result.session)
        onUpdated?.(result.session)
      }

      setHandoffAlreadySent(result.alreadySent)
      setView(HANDOFF_VIEW.SUCCESS)
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[appointment-schedule-conflict]', error)
      }
      setHandoffError(error.message ?? APPOINTMENT_SCHEDULE_CONFLICT_HANDOFF.ERROR_BODY)
      setView(HANDOFF_VIEW.ERROR)
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
  const isAwaitingRsvp = session.rsvpStatus === RSVP_STATUS.AWAITING
  const isConfirmedRsvp = session.rsvpStatus === RSVP_STATUS.CONFIRMED
  const showAwaitingPill =
    canAthleteUpdateRsvp(session) && isAwaitingRsvp
  const conflictLine = formatAppointmentScheduleConflictLine(session)
  const showConflictAction =
    canAthleteUpdateRsvp(session) &&
    session.status !== APPOINTMENT_STATUS.CANCELLED

  return (
    <AppUiBackdrop
      open={isOpen}
      onClose={onClose}
      onEscape={handleEscape}
      className="athlete-appointment-detail-backdrop"
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
            {view === HANDOFF_VIEW.CONFLICT || view === HANDOFF_VIEW.ERROR ? (
              <>
                <span className="eyebrow">{APPOINTMENT_SCHEDULE_CONFLICT_HANDOFF.TITLE}</span>
                <h2 id={titleId}>{when}</h2>
                <p className="athlete-appointment-detail-with">{conflictLine}</p>
              </>
            ) : view === HANDOFF_VIEW.SUCCESS ? (
              <>
                <span className="eyebrow">{APPOINTMENT_SCHEDULE_CONFLICT_HANDOFF.SUCCESS_TITLE}</span>
                <h2 id={titleId}>{when}</h2>
              </>
            ) : (
              <>
                <span className="eyebrow">{sessionType.toUpperCase()}</span>
                <h2 id={titleId}>{when}</h2>
                <p className="athlete-appointment-detail-with">with {coachName}</p>
              </>
            )}
          </div>
          <AppUiCloseButton onClick={onClose} />
        </header>

        {view === HANDOFF_VIEW.DETAIL ? (
          <>
            <div className="athlete-appointment-detail-body">
              <p className="athlete-appointment-detail-meta-line">
                {formatAppointmentDuration(session)} · {placeLabel}
              </p>

              {workoutTitle ? (
                <p className="athlete-appointment-detail-workout">{workoutTitle}</p>
              ) : null}

              {showAwaitingPill ? (
                <span className="athlete-appointment-status-pill">{rsvpLabel}</span>
              ) : null}

              {!showAwaitingPill && canAthleteUpdateRsvp(session) ? (
                <span
                  className={`athlete-appointment-status-pill athlete-appointment-status-pill--quiet${
                    isConfirmedRsvp ? ' athlete-appointment-status-pill--confirmed' : ''
                  }`}
                >
                  {isConfirmedRsvp ? '✓ Confirmed' : rsvpLabel}
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
                {isConfirmedRsvp ? (
                  <p className="athlete-appointment-confirmed-state" role="status">
                    <Check size={16} strokeWidth={1.75} aria-hidden="true" />
                    Confirmed
                  </p>
                ) : isAwaitingRsvp ? (
                  <button
                    type="button"
                    className="gold-button machined athlete-appointment-confirm-button"
                    disabled={updating}
                    onClick={handleRsvpConfirm}
                  >
                    <Check size={16} strokeWidth={1.75} aria-hidden="true" />
                    Confirm
                  </button>
                ) : null}
                {showConflictAction ? (
                  <button
                    type="button"
                    className="ui-btn-tertiary athlete-appointment-cant-make-it"
                    disabled={updating}
                    onClick={openScheduleConflictHandoff}
                  >
                    Can&apos;t make it
                  </button>
                ) : null}
              </footer>
            ) : null}
          </>
        ) : null}

        {view === HANDOFF_VIEW.CONFLICT ? (
          <>
            <div className="athlete-appointment-detail-body">
              <p className="athlete-appointment-handoff-lede">
                {APPOINTMENT_SCHEDULE_CONFLICT_HANDOFF.LEde}
              </p>
              {handoffAlreadySent ? (
                <p className="athlete-appointment-handoff-note">
                  {APPOINTMENT_SCHEDULE_CONFLICT_HANDOFF.ALREADY_SENT_BODY}
                </p>
              ) : null}
            </div>
            <footer className="athlete-appointment-detail-footer">
              <button
                type="button"
                className="gold-button machined athlete-appointment-confirm-button"
                disabled={updating}
                onClick={handleSendScheduleConflict}
              >
                {APPOINTMENT_SCHEDULE_CONFLICT_HANDOFF.SEND_LABEL}
              </button>
              <button
                type="button"
                className="ui-btn-tertiary athlete-appointment-cant-make-it"
                disabled={updating}
                onClick={() => setView(HANDOFF_VIEW.DETAIL)}
              >
                {APPOINTMENT_SCHEDULE_CONFLICT_HANDOFF.CANCEL_LABEL}
              </button>
            </footer>
          </>
        ) : null}

        {view === HANDOFF_VIEW.SUCCESS ? (
          <>
            <div className="athlete-appointment-detail-body">
              <p className="athlete-appointment-handoff-lede">
                {handoffAlreadySent
                  ? APPOINTMENT_SCHEDULE_CONFLICT_HANDOFF.ALREADY_SENT_BODY
                  : APPOINTMENT_SCHEDULE_CONFLICT_HANDOFF.SUCCESS_BODY}
              </p>
              <p className="athlete-appointment-handoff-note">
                This session stays on your schedule until your coach updates it.
              </p>
            </div>
            <footer className="athlete-appointment-detail-footer">
              <button
                type="button"
                className="gold-button machined athlete-appointment-confirm-button"
                onClick={onClose}
              >
                Done
              </button>
            </footer>
          </>
        ) : null}

        {view === HANDOFF_VIEW.ERROR ? (
          <>
            <div className="athlete-appointment-detail-body">
              <p className="athlete-appointment-handoff-error">{handoffError}</p>
            </div>
            <footer className="athlete-appointment-detail-footer">
              <button
                type="button"
                className="gold-button machined athlete-appointment-confirm-button"
                disabled={updating}
                onClick={handleSendScheduleConflict}
              >
                Try again
              </button>
              <button
                type="button"
                className="ui-btn-tertiary athlete-appointment-cant-make-it"
                disabled={updating}
                onClick={() => setView(HANDOFF_VIEW.DETAIL)}
              >
                {APPOINTMENT_SCHEDULE_CONFLICT_HANDOFF.CANCEL_LABEL}
              </button>
            </footer>
          </>
        ) : null}
      </section>
    </AppUiBackdrop>
  )
}
