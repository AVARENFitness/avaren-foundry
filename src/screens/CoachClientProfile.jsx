import {
  Activity,
  BarChart3,
  CalendarDays,
  ClipboardList,
  HeartPulse,
  Package,
  PenLine,
  Plus,
  Target,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { appUi } from '../lib/appUi'
import { coachBackend } from '../lib/coachBackend'
import {
  emptySessionPackage,
  formatPackageDate,
  normalizeSessionPackage,
} from '../lib/sessionPackages'
import CoachSessionPackage from '../components/CoachSessionPackage'
import CoachClientProfileShell from '../components/CoachClientProfileShell'
import EmptyState from '../components/ui/EmptyState'

const ICON = { size: 18, strokeWidth: 1.75 }

const formatDate = (value) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
      })
    : 'No due date'

const displayName = (email = '') => {
  const local = email.split('@')[0] ?? email
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const notesPreview = (value = '') => {
  const trimmed = value.trim()
  if (!trimmed) return 'No private notes yet.'
  const firstLine = trimmed.split('\n').find(Boolean) ?? trimmed
  return firstLine.length > 140 ? `${firstLine.slice(0, 137)}…` : firstLine
}

const goalFromNotes = (value = '') => {
  const trimmed = value.trim()
  if (!trimmed) return 'No goal recorded yet'
  return trimmed.split('\n').find(Boolean) ?? 'No goal recorded yet'
}

function ProfileSection({ eyebrow, title, description, primaryAction, children }) {
  return (
    <section className="coach-client-profile-section">
      <header className="coach-client-profile-section-header">
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
      </header>

      {primaryAction}

      <div className="coach-client-profile-section-content">
        {children}
      </div>
    </section>
  )
}

export default function CoachClientProfile({
  client,
  assignments = [],
  clientNotes = '',
  onClientNotesChange,
  onSaveNotes,
  coachEmail = 'Coach',
  onBack,
  onAssignWorkout,
  notice = '',
}) {
  const businessRef = useRef(null)
  const [activeSection, setActiveSection] = useState('today')
  const [packageSummary, setPackageSummary] = useState(emptySessionPackage())
  const [packageLoading, setPackageLoading] = useState(true)

  const clientAssignments = useMemo(
    () => assignments.filter((item) => item.athlete_id === client.athlete_id),
    [assignments, client.athlete_id],
  )

  const nextAssignment = useMemo(
    () =>
      [...clientAssignments]
        .filter((item) => ['assigned', 'started'].includes(item.status))
        .sort((a, b) =>
          String(a.due_date ?? '').localeCompare(String(b.due_date ?? '')),
        )[0] ?? null,
    [clientAssignments],
  )

  const recentActivity = useMemo(
    () =>
      [...clientAssignments]
        .filter((item) => item.status === 'completed')
        .sort(
          (a, b) =>
            new Date(b.completed_at).getTime() -
            new Date(a.completed_at).getTime(),
        )
        .slice(0, 4),
    [clientAssignments],
  )

  useEffect(() => {
    let active = true
    setPackageLoading(true)

    coachBackend
      .getSessionPackage(client.athlete_id)
      .then((row) => {
        if (active) setPackageSummary(normalizeSessionPackage(row))
      })
      .catch(() => {
        if (active) setPackageSummary(emptySessionPackage())
      })
      .finally(() => {
        if (active) setPackageLoading(false)
      })

    return () => {
      active = false
    }
  }, [client.athlete_id])

  const handleRecordSession = () => {
    setActiveSection('business')
    requestAnimationFrame(() => {
      businessRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }

  const handleViewProgress = () => {
    appUi.toast(
      'Athlete progress for coaches is coming in a future update.',
      'info',
    )
  }

  const programLabel =
    nextAssignment?.title ??
    (clientAssignments.length ? 'Individual programming' : 'No program assigned')

  const connectedSince = `Connected since ${new Date(client.created_at).toLocaleDateString([], {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })}`

  const renderSection = () => {
    switch (activeSection) {
      case 'today':
        return (
          <ProfileSection
            eyebrow="TODAY"
            title="At a glance"
            description="What matters for this client right now."
            primaryAction={
              <button
                type="button"
                className="gold-button machined coach-primary-action coach-client-profile-section-action"
                onClick={onAssignWorkout}
              >
                <Plus {...ICON} />
                Assign Workout
              </button>
            }
          >
            <div className="coach-client-profile-overview">
              <article className="coach-profile-card coach-profile-card--wide">
                <span className="coach-profile-card-icon" aria-hidden="true">
                  <CalendarDays {...ICON} />
                </span>
                <div>
                  <small>Next assigned workout</small>
                  {nextAssignment ? (
                    <>
                      <strong>{nextAssignment.title}</strong>
                      <span>
                        {nextAssignment.status} · {formatDate(nextAssignment.due_date)}
                      </span>
                    </>
                  ) : (
                    <>
                      <strong>Nothing scheduled</strong>
                      <span>Assign a workout when programming is ready.</span>
                    </>
                  )}
                </div>
              </article>

              <article className="coach-profile-card coach-profile-card--muted">
                <span className="coach-profile-card-icon" aria-hidden="true">
                  <HeartPulse {...ICON} />
                </span>
                <div>
                  <small>Readiness</small>
                  <strong>Not shared yet</strong>
                  <span>Readiness will appear when the athlete checks in.</span>
                </div>
              </article>

              <article className="coach-profile-card">
                <span className="coach-profile-card-icon" aria-hidden="true">
                  <Package {...ICON} />
                </span>
                <div>
                  <small>Session balance</small>
                  {packageLoading ? (
                    <strong>Loading…</strong>
                  ) : packageSummary.totalSessions > 0 ? (
                    <>
                      <strong>
                        {packageSummary.sessionsRemaining} remaining
                      </strong>
                      <span>
                        {packageSummary.sessionsUsed} used ·{' '}
                        {packageSummary.totalSessions} purchased
                      </span>
                    </>
                  ) : (
                    <>
                      <strong>No package on file</strong>
                      <span>Add sessions in Coaching Business.</span>
                    </>
                  )}
                </div>
              </article>
            </div>
          </ProfileSection>
        )

      case 'training':
        return (
          <ProfileSection
            eyebrow="TRAINING"
            title="Programming"
            description="Goals, program focus, and assignment workflow."
            primaryAction={
              <button
                type="button"
                className="gold-button machined coach-primary-action coach-client-profile-section-action"
                onClick={onAssignWorkout}
              >
                <Plus {...ICON} />
                Assign Workout
              </button>
            }
          >
            <div className="coach-client-profile-overview">
              <article className="coach-profile-card">
                <span className="coach-profile-card-icon" aria-hidden="true">
                  <Target {...ICON} />
                </span>
                <div>
                  <small>Current goal</small>
                  <strong>{goalFromNotes(clientNotes)}</strong>
                </div>
              </article>

              <article className="coach-profile-card">
                <span className="coach-profile-card-icon" aria-hidden="true">
                  <ClipboardList {...ICON} />
                </span>
                <div>
                  <small>Current program</small>
                  <strong>{programLabel}</strong>
                </div>
              </article>
            </div>
          </ProfileSection>
        )

      case 'business':
        return (
          <ProfileSection
            eyebrow="COACHING BUSINESS"
            title="Session packages"
            description="Track purchased sessions and record in-person visits."
            primaryAction={
              <button
                type="button"
                className="gold-button machined coach-primary-action coach-client-profile-section-action"
                onClick={handleRecordSession}
              >
                <Package {...ICON} />
                Record Session
              </button>
            }
          >
            <article className="coach-profile-card coach-profile-card--wide">
              <span className="coach-profile-card-icon" aria-hidden="true">
                <Package {...ICON} />
              </span>
              <div>
                <small>Session package</small>
                {packageLoading ? (
                  <strong>Loading…</strong>
                ) : packageSummary.totalSessions > 0 ? (
                  <>
                    <strong>
                      {packageSummary.sessionsRemaining} remaining
                    </strong>
                    <span>
                      {packageSummary.sessionsUsed} used ·{' '}
                      {packageSummary.totalSessions} purchased
                      {packageSummary.purchasedAt
                        ? ` · ${formatPackageDate(packageSummary.purchasedAt)}`
                        : ''}
                    </span>
                  </>
                ) : (
                  <>
                    <strong>No package on file</strong>
                    <span>Create a package below to start tracking sessions.</span>
                  </>
                )}
              </div>
            </article>

            <div ref={businessRef} id="coach-session-business">
              <CoachSessionPackage
                athleteId={client.athlete_id}
                coachLabel={coachEmail}
              />
            </div>
          </ProfileSection>
        )

      case 'notes':
        return (
          <ProfileSection
            eyebrow="COACH NOTES"
            title="Private notes"
            description="Only visible to you — never shown to the athlete."
            primaryAction={
              <button
                type="button"
                className="gold-button machined coach-primary-action coach-client-profile-section-action"
                onClick={onSaveNotes}
              >
                <PenLine {...ICON} />
                Save Notes
              </button>
            }
          >
            <section className="coach-profile-quiet-panel">
              <p className="coach-profile-notes-preview">
                {notesPreview(clientNotes)}
              </p>
              <textarea
                className="coach-field-input coach-profile-notes-input"
                rows={6}
                value={clientNotes}
                onChange={(event) => onClientNotesChange?.(event.target.value)}
                placeholder="Goals, limitations, check-in notes, programming context…"
              />
            </section>
          </ProfileSection>
        )

      case 'progress':
        return (
          <ProfileSection
            eyebrow="PROGRESS"
            title="Completed work"
            description="Recent workouts and long-term trends."
            primaryAction={
              <button
                type="button"
                className="coach-secondary-button coach-client-profile-section-action"
                onClick={handleViewProgress}
              >
                <BarChart3 {...ICON} />
                View Progress
              </button>
            }
          >
            {recentActivity.length ? (
              <div className="coach-client-profile-activity">
                {recentActivity.map((item) => (
                  <article key={item.id} className="coach-profile-activity-row">
                    <strong>{item.title}</strong>
                    <span>
                      Completed{' '}
                      {new Date(item.completed_at).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Activity}
                title="No completed workouts"
                description="Completed assignments will appear here."
              />
            )}
          </ProfileSection>
        )

      default:
        return null
    }
  }

  return (
    <CoachClientProfileShell
      clientName={displayName(client.athlete_email)}
      clientEmail={client.athlete_email}
      connectedSince={connectedSince}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      onBack={onBack}
    >
      {renderSection()}
      {notice && <p className="coach-hub-notice">{notice}</p>}
    </CoachClientProfileShell>
  )
}
