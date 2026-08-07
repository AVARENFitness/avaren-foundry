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
import { coachBackend } from '../lib/coachBackend'
import { buildClientIntelligence } from '../lib/clientIntelligence'
import {
  formatWeekRangeLabel,
  getCoachWeekRange,
  getWeeklyReviewStatus,
  normalizeWeeklyReview,
} from '../lib/weeklyReview'
import {
  emptySessionPackage,
  formatPackageDate,
  normalizeSessionPackage,
} from '../lib/sessionPackages'
import ClientIntelligenceDashboard from '../components/ClientIntelligenceDashboard'
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
  notesUpdatedAt = null,
  onClientNotesChange,
  onSaveNotes,
  coachEmail = 'Coach',
  onBack,
  onAssignWorkout,
  onOpenWeeklyReview,
  notice = '',
}) {
  const businessRef = useRef(null)
  const [activeSection, setActiveSection] = useState('today')
  const [packageSummary, setPackageSummary] = useState(emptySessionPackage())
  const [packageLoading, setPackageLoading] = useState(true)
  const [athleteState, setAthleteState] = useState(null)
  const [nutritionProfile, setNutritionProfile] = useState(null)
  const [nutritionDays, setNutritionDays] = useState([])
  const [intelligenceLoading, setIntelligenceLoading] = useState(true)
  const [intelligenceError, setIntelligenceError] = useState('')
  const [currentWeekReview, setCurrentWeekReview] = useState(null)

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

  const intelligence = useMemo(
    () =>
      buildClientIntelligence({
        client,
        assignments: clientAssignments,
        athleteState,
        nutritionProfile,
        nutritionDays,
        clientNotes,
        notesUpdatedAt,
      }),
    [
      client,
      clientAssignments,
      athleteState,
      nutritionProfile,
      nutritionDays,
      clientNotes,
      notesUpdatedAt,
    ],
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

  useEffect(() => {
    let active = true
    setIntelligenceLoading(true)
    setIntelligenceError('')

    Promise.all([
      coachBackend.getAthleteFoundryState(client.athlete_id),
      coachBackend.getAthleteNutritionSnapshot(client.athlete_id),
      coachBackend.getClientWeeklyReview(client.athlete_id),
    ])
      .then(([state, nutrition, review]) => {
        if (!active) return
        setAthleteState(state)
        setNutritionProfile(nutrition.profile)
        setNutritionDays(nutrition.days)
        setCurrentWeekReview(normalizeWeeklyReview(review))
      })
      .catch((error) => {
        if (!active) return
        setIntelligenceError(
          error?.message ?? 'Could not load client intelligence.',
        )
      })
      .finally(() => {
        if (active) setIntelligenceLoading(false)
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

  const handleSectionAction = (action) => {
    if (!action) return

    if (action === 'assignment') {
      onAssignWorkout?.()
      return
    }

    if (action === 'notes') {
      setActiveSection('notes')
      return
    }

    if (['training', 'progress'].includes(action)) {
      setActiveSection(action === 'progress' ? 'progress' : 'training')
    }
  }

  const programLabel =
    nextAssignment?.title ??
    (clientAssignments.length ? 'Individual programming' : 'No program assigned')

  const connectedSince = `Connected since ${new Date(client.created_at).toLocaleDateString([], {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })}`

  const weeklyReviewStatus = useMemo(
    () => getWeeklyReviewStatus({ currentReview: currentWeekReview }),
    [currentWeekReview],
  )

  const weeklyReviewAction = (
    <div className="coach-weekly-review-entry">
      <div>
        <span className="eyebrow">WEEKLY REVIEW</span>
        <strong>{formatWeekRangeLabel(weeklyReviewStatus.weekRange.weekStart, weeklyReviewStatus.weekRange.weekEnd)}</strong>
        <small>{weeklyReviewStatus.status}</small>
      </div>
      <button
        type="button"
        className="gold-button machined"
        onClick={onOpenWeeklyReview}
      >
        {weeklyReviewStatus.actionLabel}
      </button>
    </div>
  )

  const renderSection = () => {
    switch (activeSection) {
      case 'today':
        return (
          <ClientIntelligenceDashboard
            intelligence={intelligence}
            loading={intelligenceLoading}
            error={intelligenceError}
            onSectionAction={handleSectionAction}
            onAssignWorkout={onAssignWorkout}
            onSaveNotes={() => setActiveSection('notes')}
          />
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

            {intelligence.training.recentSessions.length > 0 && (
              <div className="coach-client-profile-activity">
                {intelligence.training.recentSessions.map((session) => (
                  <article key={session.id} className="coach-profile-activity-row">
                    <strong>{session.name}</strong>
                    <span>
                      {session.relativeLabel}
                      {session.volume
                        ? ` · ${Math.round(session.volume).toLocaleString()} lb`
                        : ''}
                    </span>
                  </article>
                ))}
              </div>
            )}
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
                {intelligence.notes.preview || 'No private notes yet.'}
              </p>
              {notesUpdatedAt && (
                <small className="client-intelligence-notes-updated">
                  Updated{' '}
                  {new Date(notesUpdatedAt).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </small>
              )}
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
            description="Recent workouts, performance trends, and assignment history."
            primaryAction={
              <button
                type="button"
                className="coach-secondary-button coach-client-profile-section-action"
                onClick={() => handleSectionAction('progress')}
              >
                <BarChart3 {...ICON} />
                Review trends
              </button>
            }
          >
            {intelligence.performance.cards.length > 0 && (
              <div className="client-intelligence-insight-grid">
                {intelligence.performance.cards.map((card) => (
                  <article key={card.id} className="coach-profile-card">
                    <div>
                      <small>{card.title}</small>
                      <strong>{card.value}</strong>
                      <span>{card.detail}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}

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
                      {item.completion_summary?.volume
                        ? ` · ${Math.round(item.completion_summary.volume).toLocaleString()} lb`
                        : ''}
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
      weeklyReviewAction={weeklyReviewAction}
    >
      {renderSection()}
      {notice && <p className="coach-hub-notice">{notice}</p>}
    </CoachClientProfileShell>
  )
}
