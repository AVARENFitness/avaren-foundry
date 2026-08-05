import {
  CalendarClock,
  Check,
  ChevronRight,
  ClipboardList,
  Mail,
  MoreHorizontal,
  Search,
  Send,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'

const statusLabel = (status) =>
  status === 'accepted'
    ? 'Active'
    : status === 'declined'
    ? 'Declined'
    : 'Pending'

export default function CoachScreen({
  workspace,
  setWorkspace,
  screen = 'clients',
}) {
  const [query, setQuery] =
    useState('')
  const [inviteEmail, setInviteEmail] =
    useState('')
  const [notice, setNotice] =
    useState('')

  const clients =
    workspace?.clients ?? []
  const invitations =
    workspace?.invitations ?? []
  const assignments =
    workspace?.assignments ?? []

  const visibleClients = useMemo(
    () =>
      clients.filter((client) =>
        `${client.name} ${client.email}`
          .toLowerCase()
          .includes(
            query.trim().toLowerCase(),
          ),
      ),
    [clients, query],
  )

  const invite = () => {
    const email =
      inviteEmail.trim().toLowerCase()

    if (
      !email ||
      !email.includes('@')
    ) {
      setNotice(
        'Enter a valid email address.',
      )
      return
    }

    if (
      invitations.some(
        (item) =>
          item.email === email &&
          item.status === 'pending',
      )
    ) {
      setNotice(
        'That invitation is already pending.',
      )
      return
    }

    const invitation = {
      id: crypto.randomUUID(),
      email,
      status: 'pending',
      createdAt:
        new Date().toISOString(),
    }

    setWorkspace((current) => ({
      ...current,
      invitations: [
        invitation,
        ...(current.invitations ?? []),
      ],
    }))

    setInviteEmail('')
    setNotice(
      'Invitation saved. Email delivery and athlete acceptance are enabled in the next Coach Hub sprint.',
    )
  }

  if (screen === 'assignments') {
    return (
      <section className="coach-hub-screen">
        <header className="coach-hub-page-header">
          <div>
            <span className="eyebrow">
              PROGRAM DELIVERY
            </span>
            <h1>Assignments</h1>
            <p>
              Workouts and weekly plans
              assigned to connected clients
              will live here.
            </p>
          </div>

          <button
            className="gold-button machined"
            disabled
          >
            <ClipboardList size={17} />
            New Assignment
          </button>
        </header>

        {assignments.length ? (
          <div className="coach-assignment-list">
            {assignments.map(
              (assignment) => (
                <article
                  key={assignment.id}
                >
                  <div>
                    <strong>
                      {assignment.title}
                    </strong>
                    <span>
                      {assignment.clientName}
                    </span>
                  </div>

                  <small>
                    {assignment.status}
                  </small>
                </article>
              ),
            )}
          </div>
        ) : (
          <section className="coach-empty-state">
            <ClipboardList size={28} />
            <h2>No assignments yet.</h2>
            <p>
              Workout and weekly-plan
              assignment is the next phase.
            </p>
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
            <span className="eyebrow">
              COACH WORKSPACE
            </span>
            <h1>Coach settings</h1>
            <p>
              This mode is intentionally
              focused on coaching only.
            </p>
          </div>
        </header>

        <section className="coach-settings-card">
          <article>
            <span>Workspace status</span>
            <strong>Coach Mode active</strong>
          </article>

          <article>
            <span>Connected clients</span>
            <strong>
              {clients.length}
            </strong>
          </article>

          <article>
            <span>Pending invitations</span>
            <strong>
              {
                invitations.filter(
                  (item) =>
                    item.status ===
                    'pending',
                ).length
              }
            </strong>
          </article>
        </section>
      </section>
    )
  }

  return (
    <section className="coach-hub-screen">
      <header className="coach-hub-page-header">
        <div>
          <span className="eyebrow">
            CLIENT MANAGEMENT
          </span>
          <h1>Coach Hub</h1>
          <p>
            Invite athletes, manage your
            roster, and prepare assignments
            from one focused workspace.
          </p>
        </div>

        <div className="coach-hub-count">
          <Users size={18} />
          <strong>
            {clients.length}
          </strong>
          <span>clients</span>
        </div>
      </header>

      <section className="coach-invite-card">
        <div>
          <UserPlus size={20} />
          <div>
            <strong>
              Invite an athlete
            </strong>
            <span>
              Use the email on their
              AVAREN account.
            </span>
          </div>
        </div>

        <div className="coach-invite-form">
          <label>
            <Mail size={15} />
            <input
              type="email"
              value={inviteEmail}
              onChange={(event) =>
                setInviteEmail(
                  event.target.value,
                )
              }
              placeholder="athlete@email.com"
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter'
                ) {
                  invite()
                }
              }}
            />
          </label>

          <button onClick={invite}>
            <Send size={16} />
            Invite
          </button>
        </div>

        {notice && (
          <p className="coach-hub-notice">
            {notice}
          </p>
        )}
      </section>

      <section className="coach-roster-section">
        <header>
          <div>
            <span className="eyebrow">
              YOUR ROSTER
            </span>
            <h2>Clients</h2>
          </div>

          <label className="coach-client-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) =>
                setQuery(
                  event.target.value,
                )
              }
              placeholder="Search clients"
            />
          </label>
        </header>

        {visibleClients.length ? (
          <div className="coach-client-list">
            {visibleClients.map(
              (client) => (
                <article
                  key={client.id}
                >
                  <div className="coach-client-avatar">
                    {client.name
                      .slice(0, 1)
                      .toUpperCase()}
                  </div>

                  <div className="coach-client-copy">
                    <strong>
                      {client.name}
                    </strong>
                    <span>
                      {client.email}
                    </span>
                  </div>

                  <div className="coach-client-status">
                    <span
                      className={
                        client.status
                      }
                    >
                      {statusLabel(
                        client.status,
                      )}
                    </span>
                    <ChevronRight
                      size={16}
                    />
                  </div>
                </article>
              ),
            )}
          </div>
        ) : (
          <section className="coach-empty-state compact">
            <Users size={25} />
            <h2>
              No connected clients yet.
            </h2>
            <p>
              Invite an athlete above. Once
              accepted, they will appear
              here.
            </p>
          </section>
        )}
      </section>

      {invitations.length > 0 && (
        <section className="coach-pending-section">
          <header>
            <div>
              <span className="eyebrow">
                INVITATIONS
              </span>
              <h2>Pending</h2>
            </div>
          </header>

          <div className="coach-pending-list">
            {invitations.map(
              (inviteItem) => (
                <article
                  key={inviteItem.id}
                >
                  <div>
                    <Mail size={16} />
                    <span>
                      {inviteItem.email}
                    </span>
                  </div>

                  <div>
                    <small>
                      {statusLabel(
                        inviteItem.status,
                      )}
                    </small>

                    {inviteItem.status ===
                      'pending' && (
                      <button
                        onClick={() =>
                          setWorkspace(
                            (current) => ({
                              ...current,
                              invitations:
                                current.invitations.filter(
                                  (item) =>
                                    item.id !==
                                    inviteItem.id,
                                ),
                            }),
                          )
                        }
                        aria-label="Cancel invitation"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                </article>
              ),
            )}
          </div>
        </section>
      )}
    </section>
  )
}
