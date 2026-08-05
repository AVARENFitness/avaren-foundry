import {
  CalendarDays,
  ClipboardList,
  Mail,
  Search,
  Send,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { coachBackend } from '../lib/coachBackend'

export default function CoachScreen({
  workspace,
  setWorkspace,
  screen = 'clients',
  program,
}) {
  const [clients, setClients] = useState([])
  const [invitations, setInvitations] = useState([])
  const [assignments, setAssignments] = useState([])
  const [query, setQuery] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAssignment, setShowAssignment] = useState(false)
  const [assignment, setAssignment] = useState({
    athleteId: '',
    workoutName: program?.rotation?.[0] ?? '',
    dueDate: '',
    coachNotes: '',
  })

  const load = async () => {
    setLoading(true)

    try {
      const [nextClients, nextInvitations, nextAssignments] =
        await Promise.all([
          coachBackend.listClients(),
          coachBackend.listCoachInvitations(),
          coachBackend.listCoachAssignments(),
        ])

      setClients(nextClients)
      setInvitations(nextInvitations)
      setAssignments(nextAssignments)
      setWorkspace((current) => ({
        ...current,
        clients: nextClients,
        invitations: nextInvitations,
        assignments: nextAssignments,
      }))
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

  const visibleClients = useMemo(
    () =>
      clients.filter((client) =>
        client.athlete_email
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [clients, query],
  )

  const invite = async () => {
    const email = inviteEmail.trim().toLowerCase()

    if (!email.includes('@')) {
      setNotice('Enter a valid athlete email.')
      return
    }

    try {
      await coachBackend.inviteAthlete(email)
      setInviteEmail('')
      setNotice('Invitation sent.')
      await load()
    } catch (error) {
      setNotice(error.message)
    }
  }

  const createAssignment = async () => {
    const workout = program?.workouts?.[assignment.workoutName]

    if (!assignment.athleteId || !workout) {
      setNotice('Select a connected client and workout.')
      return
    }

    try {
      await coachBackend.createAssignment({
        athleteId: assignment.athleteId,
        title: assignment.workoutName,
        workout: {
          name: assignment.workoutName,
          exercises: workout,
        },
        coachNotes: assignment.coachNotes,
        dueDate: assignment.dueDate,
      })

      setShowAssignment(false)
      setNotice('Workout assigned.')
      await load()
    } catch (error) {
      setNotice(error.message)
    }
  }

  if (screen === 'assignments') {
    return (
      <section className="coach-hub-screen">
        <header className="coach-hub-page-header">
          <div>
            <span className="eyebrow">PROGRAM DELIVERY</span>
            <h1>Assignments</h1>
            <p>Send an existing AVAREN workout to any connected client.</p>
          </div>

          <button
            className="gold-button machined"
            disabled={clients.length === 0}
            onClick={() => setShowAssignment(true)}
          >
            <ClipboardList size={17} />
            New Assignment
          </button>
        </header>

        {clients.length === 0 && (
          <p className="coach-hub-notice">
            Connect a client before creating an assignment.
          </p>
        )}

        {showAssignment && (
          <section className="coach-assignment-composer">
            <header>
              <div>
                <span className="eyebrow">NEW ASSIGNMENT</span>
                <h2>Assign a workout</h2>
              </div>
              <button onClick={() => setShowAssignment(false)}>
                <X size={18} />
              </button>
            </header>

            <label>
              <span>Client</span>
              <select
                value={assignment.athleteId}
                onChange={(event) =>
                  setAssignment((current) => ({
                    ...current,
                    athleteId: event.target.value,
                  }))
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

            <label>
              <span>Workout</span>
              <select
                value={assignment.workoutName}
                onChange={(event) =>
                  setAssignment((current) => ({
                    ...current,
                    workoutName: event.target.value,
                  }))
                }
              >
                {(program?.rotation ?? []).map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Due date</span>
              <input
                type="date"
                value={assignment.dueDate}
                onChange={(event) =>
                  setAssignment((current) => ({
                    ...current,
                    dueDate: event.target.value,
                  }))
                }
              />
            </label>

            <label>
              <span>Coach notes</span>
              <textarea
                rows={4}
                value={assignment.coachNotes}
                onChange={(event) =>
                  setAssignment((current) => ({
                    ...current,
                    coachNotes: event.target.value,
                  }))
                }
                placeholder="Technique cues, effort target, substitutions, or anything the athlete should know."
              />
            </label>

            <button className="gold-button machined" onClick={createAssignment}>
              <Send size={17} />
              Assign Workout
            </button>
          </section>
        )}

        {notice && <p className="coach-hub-notice">{notice}</p>}

        {assignments.length ? (
          <div className="coach-assignment-list">
            {assignments.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.athlete_id}</span>
                </div>
                <small>{item.status}</small>
              </article>
            ))}
          </div>
        ) : (
          <section className="coach-empty-state">
            <ClipboardList size={28} />
            <h2>No assignments yet.</h2>
            <p>Accepted clients will be available for assignment here.</p>
          </section>
        )}
      </section>
    )
  }

  if (screen === 'settings') {
    return (
      <section className="coach-hub-screen">
        <header className="coach-hub-page-header">
          <div>
            <span className="eyebrow">COACH WORKSPACE</span>
            <h1>Coach settings</h1>
            <p>Database-backed coach access and private client relationships are active.</p>
          </div>
        </header>

        <section className="coach-settings-card">
          <article><span>Connected clients</span><strong>{clients.length}</strong></article>
          <article><span>Pending invitations</span><strong>{invitations.filter((item) => item.status === 'pending').length}</strong></article>
          <article><span>Assignments</span><strong>{assignments.length}</strong></article>
        </section>

        {notice && <p className="coach-hub-notice">{notice}</p>}
      </section>
    )
  }

  return (
    <section className="coach-hub-screen">
      <header className="coach-hub-page-header">
        <div>
          <span className="eyebrow">CLIENT MANAGEMENT</span>
          <h1>Coach Hub</h1>
          <p>Invite athletes using the email on their AVAREN account.</p>
        </div>

        <div className="coach-hub-count">
          <Users size={18} />
          <strong>{clients.length}</strong>
          <span>clients</span>
        </div>
      </header>

      <section className="coach-invite-card">
        <div>
          <UserPlus size={20} />
          <div>
            <strong>Invite an athlete</strong>
            <span>They can accept from Profile.</span>
          </div>
        </div>

        <div className="coach-invite-form">
          <label>
            <Mail size={15} />
            <input
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="athlete@email.com"
            />
          </label>
          <button onClick={invite}><Send size={16} />Invite</button>
        </div>

        {notice && <p className="coach-hub-notice">{notice}</p>}
      </section>

      <section className="coach-roster-section">
        <header>
          <div><span className="eyebrow">YOUR ROSTER</span><h2>Clients</h2></div>
          <label className="coach-client-search">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clients" />
          </label>
        </header>

        {loading ? (
          <p>Loading clients…</p>
        ) : visibleClients.length ? (
          <div className="coach-client-list">
            {visibleClients.map((client) => (
              <article key={client.id}>
                <div className="coach-client-avatar">{client.athlete_email.slice(0,1).toUpperCase()}</div>
                <div className="coach-client-copy"><strong>{client.athlete_email}</strong><span>Connected athlete</span></div>
                <CalendarDays size={16} />
              </article>
            ))}
          </div>
        ) : (
          <section className="coach-empty-state compact">
            <Users size={25} /><h2>No connected clients yet.</h2><p>Send an invitation and have the athlete accept it.</p>
          </section>
        )}
      </section>

      {invitations.length > 0 && (
        <section className="coach-pending-section">
          <header><div><span className="eyebrow">INVITATIONS</span><h2>Recent</h2></div></header>
          <div className="coach-pending-list">
            {invitations.map((item) => (
              <article key={item.id}>
                <div><Mail size={16} /><span>{item.athlete_email}</span></div>
                <div>
                  <small>{item.status}</small>
                  {item.status === 'pending' && (
                    <button onClick={async () => { await coachBackend.cancelInvitation(item.id); await load() }}><X size={15} /></button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  )
}
