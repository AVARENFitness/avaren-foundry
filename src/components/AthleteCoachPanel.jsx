import {
  CalendarDays,
  Check,
  ClipboardList,
  UserCheck,
  UserX,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { coachBackend } from '../lib/coachBackend'

export default function AthleteCoachPanel({
  onStartAssignment,
}) {
  const [invitations, setInvitations] =
    useState([])
  const [assignments, setAssignments] =
    useState([])
  const [loading, setLoading] =
    useState(true)
  const [notice, setNotice] =
    useState('')

  const load = async () => {
    setLoading(true)

    try {
      const [nextInvitations, nextAssignments] =
        await Promise.all([
          coachBackend.listAthleteInvitations(),
          coachBackend.listAthleteAssignments(),
        ])

      setInvitations(nextInvitations)
      setAssignments(nextAssignments)
      setNotice('')
    } catch (error) {
      setNotice(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (
    !loading &&
    !notice &&
    invitations.length === 0 &&
    assignments.length === 0
  ) {
    return null
  }

  return (
    <section className="athlete-coach-panel">
      <header>
        <div>
          <span className="eyebrow">
            COACH CONNECTION
          </span>
          <h2>Coaching</h2>
        </div>
        <ClipboardList size={21} />
      </header>

      {loading && (
        <p>Checking for coach updates…</p>
      )}
      {notice && <p>{notice}</p>}

      {invitations.map((invitation) => (
        <article
          className="athlete-coach-invitation"
          key={invitation.id}
        >
          <div>
            <strong>Coach invitation</strong>
            <span>
              A coach invited this AVAREN
              account.
            </span>
          </div>

          <div>
            <button
              onClick={async () => {
                try {
                  await coachBackend.acceptInvitation(
                    invitation.id,
                  )
                  await load()
                } catch (error) {
                  setNotice(error.message)
                }
              }}
            >
              <UserCheck size={16} />
              Accept
            </button>

            <button
              onClick={async () => {
                try {
                  await coachBackend.declineInvitation(
                    invitation.id,
                  )
                  await load()
                } catch (error) {
                  setNotice(error.message)
                }
              }}
            >
              <UserX size={16} />
              Decline
            </button>
          </div>
        </article>
      ))}

      {assignments.map((assignment) => (
        <article
          className="athlete-assignment-card"
          key={assignment.id}
        >
          <div>
            <span className="eyebrow">
              ASSIGNED WORKOUT
            </span>
            <h3>{assignment.title}</h3>
            {assignment.coach_notes && (
              <p>{assignment.coach_notes}</p>
            )}
            {assignment.due_date && (
              <small>
                <CalendarDays size={14} />
                Due{' '}
                {new Date(
                  `${assignment.due_date}T12:00:00`,
                ).toLocaleDateString()}
              </small>
            )}
          </div>

          <button
            className="gold-button machined"
            onClick={() =>
              onStartAssignment?.(assignment)
            }
          >
            <Check size={17} />
            Start Assignment
          </button>
        </article>
      ))}
    </section>
  )
}
