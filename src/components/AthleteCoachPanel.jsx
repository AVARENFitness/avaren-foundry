import { CalendarDays, Check, ClipboardList } from 'lucide-react'
import { useEffect, useState } from 'react'
import { coachBackend } from '../lib/coachBackend'
import { useAthleteCoachInvitations } from '../hooks/useAthleteCoachInvitations'
import AssignmentExercisePreview from './AssignmentExercisePreview'
import AthleteCoachInvitationCard from './AthleteCoachInvitationCard'
import EmptyState from './ui/EmptyState'

export default function AthleteCoachPanel({ onStartAssignment }) {
  const {
    invitations,
    acceptInvitation,
    declineInvitation,
    pendingId,
    error: invitationError,
  } = useAthleteCoachInvitations()
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')

  const loadAssignments = async () => {
    setLoading(true)
    try {
      const nextAssignments = await coachBackend.listAthleteAssignments({
        activeOnly: false,
      })
      setAssignments(nextAssignments)
      setNotice('')
    } catch (error) {
      setNotice(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAssignments()
  }, [])

  const handleAccept = async (invitation) => {
    try {
      await acceptInvitation(invitation.id)
      setNotice('')
    } catch (error) {
      setNotice(error.message)
    }
  }

  const handleDecline = async (invitation) => {
    try {
      await declineInvitation(invitation.id)
      setNotice('')
    } catch (error) {
      setNotice(error.message)
    }
  }

  const displayNotice = notice || invitationError
  if (
    !loading &&
    !displayNotice &&
    invitations.length === 0 &&
    assignments.length === 0
  ) {
    return null
  }

  return (
    <section className="athlete-coach-panel">
      <header>
        <div>
          <span className="eyebrow">COACH CONNECTION</span>
          <h2>Coaching</h2>
        </div>
        <ClipboardList size={22} />
      </header>
      {loading && <p>Checking for coach updates…</p>}
      {displayNotice && <p className="coach-hub-notice">{displayNotice}</p>}
      {invitations.map((invitation) => (
        <AthleteCoachInvitationCard
          key={invitation.id}
          invitation={invitation}
          compact
          pending={pendingId === invitation.id}
          onAccept={handleAccept}
          onDecline={handleDecline}
        />
      ))}
      {assignments.length ? (
        assignments.map((assignment) => (
          <article
            className={`athlete-assignment-card status-${assignment.status}`}
            key={assignment.id}
          >
            <div>
              <span className="eyebrow">
                {assignment.status === 'completed'
                  ? 'COMPLETED ASSIGNMENT'
                  : 'ASSIGNED WORKOUT'}
              </span>
              <h3>{assignment.title}</h3>
              {assignment.coach_notes && <p>{assignment.coach_notes}</p>}
              {assignment.due_date && (
                <small>
                  <CalendarDays size={14} />
                  Due {new Date(`${assignment.due_date}T12:00:00`).toLocaleDateString()}
                </small>
              )}
              <AssignmentExercisePreview
                exercises={assignment.workout_payload?.exercises ?? []}
                compact
              />
            </div>
            {['assigned', 'started'].includes(assignment.status) && (
              <button
                className="gold-button machined"
                onClick={() => onStartAssignment?.(assignment)}
              >
                <Check size={17} />
                Start Assignment
              </button>
            )}
          </article>
        ))
      ) : (
        !loading && (
          <EmptyState
            icon={ClipboardList}
            title="No assignments yet"
            description="Accepted coach assignments will appear here."
          />
        )
      )}
    </section>
  )
}
