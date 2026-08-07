import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  ClipboardList,
  HeartPulse,
  PenLine,
  Sparkles,
  TrendingUp,
  UtensilsCrossed,
} from 'lucide-react'
import { READINESS_BAND } from '../lib/clientIntelligence'
import EmptyState from './ui/EmptyState'

const ICON = { size: 18, strokeWidth: 1.75 }

function IntelligenceHero({ snapshot }) {
  if (!snapshot) return null

  const metrics = [
    snapshot.training,
    snapshot.readiness,
    snapshot.latest,
    snapshot.program,
  ].filter(Boolean)

  return (
    <section className="client-intelligence-hero" aria-label="Client intelligence summary">
      <div className="client-intelligence-hero-status">
        <span className="client-intelligence-hero-badge">{snapshot.clientStatus}</span>
      </div>

      <div className="client-intelligence-hero-grid">
        {metrics.map((metric) => (
          <article key={metric.label} className="client-intelligence-hero-metric">
            <small>{metric.label}</small>
            <strong>{metric.value}</strong>
            {metric.detail && <span>{metric.detail}</span>}
          </article>
        ))}
      </div>
    </section>
  )
}

function CoachAttentionPanel({ items = [], onAction }) {
  if (!items.length) return null

  return (
    <section className="client-intelligence-panel client-intelligence-attention">
      <header>
        <span className="eyebrow">COACH ATTENTION</span>
        <h2>What needs your eye</h2>
      </header>

      <div className="client-intelligence-attention-list">
        {items.map((item) => (
          <article
            key={item.id}
            className={`client-intelligence-attention-item severity-${item.severity}`}
          >
            <div>
              <strong>{item.title}</strong>
              <p>{item.description}</p>
            </div>
            {item.action && item.actionLabel && (
              <button
                type="button"
                className="coach-secondary-button client-intelligence-inline-action"
                onClick={() => onAction?.(item.action)}
              >
                {item.actionLabel}
                <ArrowUpRight size={16} />
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

function MetricStrip({ items = [] }) {
  return (
    <div className="client-intelligence-metric-strip">
      {items.map((item) => (
        <article key={item.label}>
          <small>{item.label}</small>
          <strong>{item.value}</strong>
          {item.detail && <span>{item.detail}</span>}
        </article>
      ))}
    </div>
  )
}

function SessionRow({ session }) {
  const details = [
    session.relativeLabel,
    session.durationMinutes ? `${session.durationMinutes} min` : null,
    session.sets ? `${session.sets} sets` : null,
    session.volume ? `${Math.round(session.volume).toLocaleString()} lb` : null,
  ].filter(Boolean)

  return (
    <article className="coach-profile-activity-row client-intelligence-session-row">
      <div>
        <strong>{session.name}</strong>
        <span>{details.join(' · ')}</span>
      </div>
      {session.prIndicator && (
        <span className="client-intelligence-pr-badge">{session.prIndicator}</span>
      )}
    </article>
  )
}

export default function ClientIntelligenceDashboard({
  intelligence,
  loading = false,
  error = '',
  onSectionAction,
  onAssignWorkout,
  onSaveNotes,
}) {
  if (loading) {
    return (
      <div className="client-intelligence-dashboard">
        <section className="client-intelligence-panel client-intelligence-loading">
          <Sparkles {...ICON} />
          <strong>Building client intelligence…</strong>
          <span>Reviewing training, assignments, and recovery signals.</span>
        </section>
      </div>
    )
  }

  if (error) {
    return (
      <div className="client-intelligence-dashboard">
        <section className="client-intelligence-panel client-intelligence-error">
          <AlertTriangle {...ICON} />
          <strong>Intelligence unavailable</strong>
          <span>{error}</span>
        </section>
      </div>
    )
  }

  if (!intelligence) return null

  const {
    snapshot,
    attention,
    training,
    performance,
    readiness,
    nutrition,
    assignmentStatus,
    notes,
  } = intelligence

  const trainingMetrics = [
    {
      label: 'This week',
      value: training.workoutsThisWeek
        ? `${training.workoutsThisWeek} workout${training.workoutsThisWeek === 1 ? '' : 's'}`
        : 'None yet',
      detail: training.label,
    },
    {
      label: 'Last 30 days',
      value: training.workoutsLast30Days
        ? `${training.workoutsLast30Days} sessions`
        : 'No sessions',
      detail: training.streak
        ? `${training.streak}-day current rhythm`
        : 'Streak forming',
    },
    {
      label: 'Volume trend',
      value:
        training.volumeTrend === 'up'
          ? 'Trending up'
          : training.volumeTrend === 'down'
          ? 'Trending down'
          : training.volumeTrend === 'flat'
          ? 'Holding steady'
          : 'Not enough data',
      detail:
        training.currentWeekVolume > 0
          ? `${Math.round(training.currentWeekVolume).toLocaleString()} lb this week`
          : null,
    },
  ]

  const readinessClass =
    readiness.band === READINESS_BAND.READY
      ? 'ready'
      : readiness.band === READINESS_BAND.RECOVERY
      ? 'recovery'
      : 'manage'

  return (
    <div className="client-intelligence-dashboard">
      <IntelligenceHero snapshot={snapshot} />

      <CoachAttentionPanel items={attention} onAction={onSectionAction} />

      <section className="client-intelligence-panel">
        <header className="client-intelligence-panel-header">
          <div>
            <span className="eyebrow">TRAINING</span>
            <h2>Training snapshot</h2>
          </div>
          <button
            type="button"
            className="coach-secondary-button client-intelligence-inline-action"
            onClick={() => onSectionAction?.('training')}
          >
            View training
            <ArrowUpRight size={16} />
          </button>
        </header>

        <MetricStrip items={trainingMetrics} />

        {training.recentSessions.length ? (
          <div className="coach-client-profile-activity">
            {training.recentSessions.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Activity}
            title="No training logged yet"
            description="Completed workouts and assignments will populate this snapshot."
          />
        )}
      </section>

      <section className="client-intelligence-panel">
        <header className="client-intelligence-panel-header">
          <div>
            <span className="eyebrow">PERFORMANCE</span>
            <h2>Performance</h2>
          </div>
          <button
            type="button"
            className="coach-secondary-button client-intelligence-inline-action"
            onClick={() => onSectionAction?.('progress')}
          >
            View progress
            <ArrowUpRight size={16} />
          </button>
        </header>

        {performance.cards.length ? (
          <div className="client-intelligence-insight-grid">
            {performance.cards.map((card) => (
              <article key={card.id} className="coach-profile-card">
                <span className="coach-profile-card-icon" aria-hidden="true">
                  <TrendingUp {...ICON} />
                </span>
                <div>
                  <small>{card.title}</small>
                  <strong>{card.value}</strong>
                  <span>{card.detail}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={BarChart3}
            title="Performance insights need more history"
            description="Set-level trends appear when full workout history is available."
          />
        )}

        {performance.recentPrs?.length > 0 && (
          <div className="client-intelligence-pr-list">
            {performance.recentPrs.map((pr) => (
              <article key={pr.id} className="client-intelligence-pr-row">
                <strong>{pr.exercise}</strong>
                <span>
                  {pr.type} · {pr.value}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="client-intelligence-panel">
        <header className="client-intelligence-panel-header">
          <div>
            <span className="eyebrow">RECOVERY</span>
            <h2>Readiness & Recovery</h2>
          </div>
        </header>

        {readiness.available ? (
          <div className={`client-intelligence-readiness-card ${readinessClass}`}>
            <div className="client-intelligence-readiness-score">
              <HeartPulse {...ICON} />
              <div>
                <strong>{readiness.score}</strong>
                <span>{readiness.status}</span>
              </div>
            </div>
            <p>{readiness.detail}</p>
            {readiness.trend && (
              <small className="client-intelligence-readiness-trend">
                {readiness.trend}
              </small>
            )}
            {readiness.mobility?.detail && (
              <span className="client-intelligence-readiness-mobility">
                {readiness.mobility.detail}
              </span>
            )}
          </div>
        ) : (
          <EmptyState
            icon={HeartPulse}
            title="No readiness check-ins yet"
            description={readiness.detail}
          />
        )}
      </section>

      <section className="client-intelligence-panel">
        <header className="client-intelligence-panel-header">
          <div>
            <span className="eyebrow">FUEL</span>
            <h2>Nutrition</h2>
          </div>
        </header>

        {nutrition.available ? (
          <div className="client-intelligence-nutrition-grid">
            <article className="coach-profile-card">
              <span className="coach-profile-card-icon" aria-hidden="true">
                <UtensilsCrossed {...ICON} />
              </span>
              <div>
                <small>Logging</small>
                <strong>{nutrition.status}</strong>
                <span>
                  {nutrition.daysLoggedThisWeek ?? 0} day
                  {nutrition.daysLoggedThisWeek === 1 ? '' : 's'} logged this week
                </span>
              </div>
            </article>

            {(nutrition.avgCalories || nutrition.calorieAdherence) && (
              <article className="coach-profile-card">
                <span className="coach-profile-card-icon" aria-hidden="true">
                  <BarChart3 {...ICON} />
                </span>
                <div>
                  <small>Recent average</small>
                  <strong>
                    {nutrition.avgCalories ? `${nutrition.avgCalories} kcal` : '—'}
                  </strong>
                  <span>
                    {nutrition.avgProtein ? `${nutrition.avgProtein} g protein` : nutrition.detail}
                    {nutrition.calorieAdherence
                      ? ` · ${nutrition.calorieAdherence}% calorie adherence`
                      : ''}
                    {nutrition.proteinAdherence
                      ? ` · ${nutrition.proteinAdherence}% protein adherence`
                      : ''}
                  </span>
                </div>
              </article>
            )}
          </div>
        ) : (
          <EmptyState
            icon={UtensilsCrossed}
            title={nutrition.status || 'No recent nutrition logs'}
            description={nutrition.detail}
          />
        )}
      </section>

      <section className="client-intelligence-panel">
        <header className="client-intelligence-panel-header">
          <div>
            <span className="eyebrow">DELIVERY</span>
            <h2>Assignment status</h2>
          </div>
          <button
            type="button"
            className="gold-button machined client-intelligence-inline-action"
            onClick={onAssignWorkout}
          >
            Manage Assignment
            <ClipboardList size={16} />
          </button>
        </header>

        {assignmentStatus.active ? (
          <article className="coach-profile-card coach-profile-card--wide">
            <span className="coach-profile-card-icon" aria-hidden="true">
              <ClipboardList {...ICON} />
            </span>
            <div>
              <small>Current assignment</small>
              <strong>{assignmentStatus.active.title}</strong>
              <span>
                {assignmentStatus.active.status}
                {assignmentStatus.active.dueDate
                  ? ` · Due ${new Date(`${assignmentStatus.active.dueDate}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
                  : ''}
                {assignmentStatus.active.overdue ? ' · Overdue' : ''}
              </span>
            </div>
          </article>
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="No active assignment"
            description="Assign the next workout to keep programming visible here."
          />
        )}

        {assignmentStatus.latestCompleted && (
          <article className="coach-profile-activity-row">
            <strong>Latest completed · {assignmentStatus.latestCompleted.title}</strong>
            <span>
              {assignmentStatus.latestCompleted.relativeLabel ?? 'Recently'}
              {assignmentStatus.latestCompleted.summary?.volume
                ? ` · ${Math.round(assignmentStatus.latestCompleted.summary.volume).toLocaleString()} lb`
                : ''}
            </span>
          </article>
        )}

        {assignmentStatus.previousCompleted && (
          <article className="coach-profile-activity-row">
            <strong>Previous · {assignmentStatus.previousCompleted.title}</strong>
            <span>{assignmentStatus.previousCompleted.relativeLabel ?? 'Earlier'}</span>
          </article>
        )}
      </section>

      <section className="client-intelligence-panel">
        <header className="client-intelligence-panel-header">
          <div>
            <span className="eyebrow">PRIVATE</span>
            <h2>Coach Notes</h2>
          </div>
          <button
            type="button"
            className="coach-secondary-button client-intelligence-inline-action"
            onClick={() => onSectionAction?.('notes')}
          >
            {notes.hasNotes ? 'Edit note' : 'Add note'}
            <PenLine size={16} />
          </button>
        </header>

        <div className="coach-profile-quiet-panel">
          <p className="coach-profile-notes-preview">
            {notes.preview || 'No private notes yet.'}
          </p>
          {notes.updatedAt && (
            <small className="client-intelligence-notes-updated">
              Updated{' '}
              {new Date(notes.updatedAt).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </small>
          )}
          <button
            type="button"
            className="coach-secondary-button"
            onClick={onSaveNotes}
          >
            Save Notes
          </button>
        </div>
      </section>
    </div>
  )
}

export { IntelligenceHero }
