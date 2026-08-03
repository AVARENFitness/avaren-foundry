import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  Dumbbell,
  Flame,
  LineChart,
  Route,
  Sparkles,
  Sunrise,
  Wind,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  COACH_ACTIONS,
  COACH_CATEGORIES,
  coachSnapshot,
} from '../lib/coach'

const FILTERS = [
  ['all', 'All'],
  [COACH_CATEGORIES.RECOVERY, 'Recovery'],
  [COACH_CATEGORIES.CONSISTENCY, 'Consistency'],
  [COACH_CATEGORIES.STRENGTH, 'Strength'],
  [COACH_CATEGORIES.PROGRAMMING, 'Programming'],
  [COACH_CATEGORIES.MILESTONE, 'Milestones'],
  [COACH_CATEGORIES.MOMENTUM, 'Momentum'],
]

const CATEGORY_META = {
  [COACH_CATEGORIES.RECOVERY]: {
    label: 'Recovery',
    icon: Wind,
    className: 'recovery',
  },
  [COACH_CATEGORIES.CONSISTENCY]: {
    label: 'Consistency',
    icon: Flame,
    className: 'consistency',
  },
  [COACH_CATEGORIES.STRENGTH]: {
    label: 'Strength',
    icon: LineChart,
    className: 'strength',
  },
  [COACH_CATEGORIES.PROGRAMMING]: {
    label: 'Programming',
    icon: Route,
    className: 'programming',
  },
  [COACH_CATEGORIES.MILESTONE]: {
    label: 'Milestone',
    icon: Sparkles,
    className: 'milestone',
  },
  [COACH_CATEGORIES.MOMENTUM]: {
    label: 'Momentum',
    icon: Dumbbell,
    className: 'momentum',
  },
}

const ACTION_ICONS = {
  [COACH_ACTIONS.START_RESET]: Sunrise,
  [COACH_ACTIONS.START_RECOVERY]: Wind,
  [COACH_ACTIONS.START_WORKOUT]: Dumbbell,
  [COACH_ACTIONS.OPEN_PROGRESS]: LineChart,
  [COACH_ACTIONS.OPEN_JOURNEY]: Route,
}

function CoachInsightCard({ insight, onAction }) {
  const meta =
    CATEGORY_META[insight.category] ??
    CATEGORY_META[COACH_CATEGORIES.MOMENTUM]
  const Icon = meta.icon
  const ActionIcon =
    ACTION_ICONS[insight.action] ?? ArrowRight

  return (
    <article className={`coach-center-card ${meta.className}`}>
      <header>
        <div className="coach-center-icon">
          <Icon size={20} />
        </div>
        <div>
          <span>{meta.label}</span>
          <small>Priority {Math.round(insight.priority)}</small>
        </div>
      </header>

      <h3>{insight.title}</h3>
      <p>{insight.description}</p>

      {insight.evidence?.length > 0 && (
        <div className="coach-center-evidence">
          {insight.evidence.slice(0, 4).map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      )}

      {insight.action !== COACH_ACTIONS.NONE &&
        insight.actionLabel && (
          <button onClick={() => onAction?.(insight.action)}>
            <ActionIcon size={16} />
            {insight.actionLabel}
            <ArrowRight size={16} />
          </button>
        )}
    </article>
  )
}

export default function CoachScreen({
  state,
  onClose,
  onAction,
}) {
  const [filter, setFilter] = useState('all')

  const snapshot = useMemo(
    () =>
      coachSnapshot(state, {
        limit: 20,
        cooldownDays: 0,
      }),
    [state],
  )

  const visible = useMemo(
    () =>
      filter === 'all'
        ? snapshot.all
        : snapshot.all.filter(
            (insight) => insight.category === filter,
          ),
    [snapshot.all, filter],
  )

  const categoryCount = (category) =>
    snapshot.all.filter(
      (insight) => insight.category === category,
    ).length

  return (
    <section className="coach-center-screen">
      <header className="builder-header">
        <button className="builder-back" onClick={onClose}>
          <ArrowLeft size={18} /> Back
        </button>
        <div>
          <span className="eyebrow">TRAINING INTELLIGENCE</span>
          <h1>AVAREN Coach</h1>
        </div>
      </header>

      <section className="coach-center-hero">
        <div className="coach-center-hero-icon">
          <BrainCircuit size={28} />
        </div>
        <div>
          <span className="eyebrow">QUIET GUIDANCE</span>
          <h2>
            {snapshot.all.length
              ? `${snapshot.all.length} current insight${
                  snapshot.all.length === 1 ? '' : 's'
                }.`
              : 'Your coach is learning.'}
          </h2>
          <p>
            Guidance is ranked from your workouts, recovery,
            consistency, strength trends, and milestones.
          </p>
        </div>

        {snapshot.primary && (
          <div className="coach-center-primary">
            <span>Highest priority today</span>
            <strong>{snapshot.primary.title}</strong>
            <small>
              {CATEGORY_META[snapshot.primary.category]?.label ??
                'Coach'}
            </small>
          </div>
        )}
      </section>

      <div className="coach-center-filters">
        {FILTERS.map(([id, label]) => {
          const count =
            id === 'all'
              ? snapshot.all.length
              : categoryCount(id)

          return (
            <button
              key={id}
              className={filter === id ? 'active' : ''}
              onClick={() => setFilter(id)}
            >
              {label}
              <span>{count}</span>
            </button>
          )
        })}
      </div>

      {!visible.length && (
        <section className="empty-state">
          <h2>No current insights in this category.</h2>
          <p>
            Continue training and recovering to give AVAREN
            more useful context.
          </p>
        </section>
      )}

      <div className="coach-center-grid">
        {visible.map((insight) => (
          <CoachInsightCard
            key={insight.fingerprint}
            insight={insight}
            onAction={onAction}
          />
        ))}
      </div>
    </section>
  )
}
