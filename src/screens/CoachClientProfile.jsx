import {
  Activity,
  ArrowLeft,
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
    businessRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
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

  return (
    <section className="coach-hub-screen coach-client-profile-screen">
      <button type="button" className="coach-back-link" onClick={onBack}>
        <ArrowLeft {...ICON} />
        Back to clients
      </button>

      <header className="coach-client-profile-header">
        <span className="eyebrow">CLIENT PROFILE</span>
        <h1>{displayName(client.athlete_email)}</h1>
        <p>{client.athlete_email}</p>
        <small>
          Connected since{' '}
          {new Date(client.created_at).toLocaleDateString([], {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
        </small>
      </header>

      <div className="coach-client-profile-actions">
        <button
          type="button"
          className="gold-button machined coach-primary-action"
          onClick={handleRecordSession}
        >
          <Package {...ICON} />
          Record Session
        </button>
        <button
          type="button"
          className="coach-secondary-button"
          onClick={onAssignWorkout}
        >
          <Plus {...ICON} />
          Assign Workout
        </button>
        <button
          type="button"
          className="coach-secondary-button"
          onClick={handleViewProgress}
        >
          <BarChart3 {...ICON} />
          View Progress
        </button>
      </div>

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
                <span>Add sessions in Business below.</span>
              </>
            )}
          </div>
        </article>

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
      </div>

      <section className="coach-profile-quiet-panel">
        <header className="coach-profile-quiet-header">
          <span className="coach-profile-card-icon" aria-hidden="true">
            <PenLine {...ICON} />
          </span>
          <div>
            <span className="eyebrow">COACH NOTES</span>
            <h2>Private preview</h2>
          </div>
        </header>
        <p className="coach-profile-notes-preview">{notesPreview(clientNotes)}</p>
        <textarea
          className="coach-field-input coach-profile-notes-input"
          rows={4}
          value={clientNotes}
          onChange={(event) => onClientNotesChange?.(event.target.value)}
          placeholder="Goals, limitations, check-in notes, programming context…"
        />
        <button
          type="button"
          className="coach-secondary-button"
          onClick={onSaveNotes}
        >
          Save Notes
        </button>
      </section>

      <section className="coach-profile-quiet-panel">
        <header className="coach-profile-quiet-header">
          <span className="coach-profile-card-icon" aria-hidden="true">
            <Activity {...ICON} />
          </span>
          <div>
            <span className="eyebrow">RECENT ACTIVITY</span>
            <h2>Completed workouts</h2>
          </div>
        </header>
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
      </section>

      <div ref={businessRef} id="coach-session-business">
        <CoachSessionPackage
          athleteId={client.athlete_id}
          coachLabel={coachEmail}
        />
      </div>

      {notice && <p className="coach-hub-notice">{notice}</p>}
    </section>
  )
}
